const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const axios = require('axios');

const { sendDiscordAlert, setupAxiosRetry } = require('../utils/systemHelper');
if (setupAxiosRetry) setupAxiosRetry();

const Game = require('../models/Game');
const GameCategory = require('../models/GameCategory');
const TrendHistory = require('../models/TrendHistory');

const { MONGODB_URI, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET } = process.env;

if (!MONGODB_URI) { console.error('❌ MONGODB_URI 누락'); process.exit(1); }

let twitchToken = null;
async function getTwitchToken() {
    if (!TWITCH_CLIENT_ID) return;
    try {
        const res = await axios.post('https://id.twitch.tv/oauth2/token', null, { 
            params: { client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' } 
        });
        twitchToken = res.data.access_token;
    } catch (err) {
        console.error('❌ 트위치 토큰 발급 실패:', err.message);
    }
}

async function getSteamCCU(appId) {
    try {
        const res = await axios.get(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appId}`, { timeout: 10000 });
        if (res.data?.response?.result === 1) return res.data.response.player_count || 0;
    } catch (e) {}
    return 0;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ★ 수술 완료: 무한 루프 위험이 있던 기존 코드를 버리고 안전하고 최적화된 레벤슈타인 거리 알고리즘으로 전면 교체했습니다.
function getSimilarity(s1, s2) {
    let longer = s1; let shorter = s2;
    if (s1.length < s2.length) { longer = s2; shorter = s1; }
    const longerLength = longer.length;
    if (longerLength === 0) return 1.0;
    
    shorter = shorter.toLowerCase();
    longer = longer.toLowerCase();
    const costs = new Array();
    for (let i = 0; i <= longer.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= shorter.length; j++) {
            if (i === 0) costs[j] = j;
            else {
                if (j > 0) {
                    let newValue = costs[j - 1];
                    if (longer.charAt(i - 1) !== shorter.charAt(j - 1))
                        newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                    costs[j - 1] = lastValue; lastValue = newValue;
                }
            }
        }
        if (i > 0) costs[shorter.length] = lastValue;
    }
    return (longerLength - costs[shorter.length]) / parseFloat(longerLength);
}

function getCoreKeyword(text) {
    if (!text) return "";
    let core = text.replace(/[™®©]/g, '');
    if (core.includes(':')) core = core.split(':')[0];
    core = core.replace(/\s+(I|II|III|IV|V|VI|VII|VIII|IX|X|\d+)$/i, '');
    core = core.replace(/(\d+)$/, '');
    return core.trim();
}

async function collectTrends() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ DB Connected. [초고속 전수조사] 트렌드 수집기 시작...');

        const allGames = await Game.find({}).select('steam_appid title title_ko').lean();
        if (allGames.length === 0) process.exit(0);

        await getTwitchToken();
        let processed = 0;

        for (const game of allGames) {
            const steamId = game.steam_appid;
            const categoryData = await GameCategory.findOne({ steamAppId: steamId }).lean();
            
            let twitchViewers = 0;
            let chzzkViewers = 0;

            // 1. 트위치 수집
            if (categoryData?.twitch?.id && twitchToken) {
                try {
                    const res = await axios.get('https://api.twitch.tv/helix/streams', { 
                        headers: { 'Client-ID': TWITCH_CLIENT_ID, Authorization: `Bearer ${twitchToken}` }, 
                        params: { game_id: categoryData.twitch.id, first: 100 },
                        timeout: 10000
                    });
                    twitchViewers = res.data.data.reduce((acc, s) => acc + (s.viewer_count || 0), 0);
                } catch (err) {}
            }

            // 2. 치지직 수집
            const koCore = getCoreKeyword(game.title_ko);
            const enCore = getCoreKeyword(game.title);
            const searchQuery = koCore || enCore;

            if (searchQuery) {
                try {
                    // ★ 수술 완료: CHZZK_CLIENT_ID 등 네이버 오픈 API 키를 제거하고, 브라우저 위장 헤더를 보강했습니다.
                    const res = await axios.get(`https://api.chzzk.naver.com/service/v1/search/lives?keyword=${encodeURIComponent(searchQuery)}&offset=0&size=50&sortType=POPULAR`, { 
                        headers: { 
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                            'Accept': 'application/json, text/plain, */*',
                            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
                            'Origin': 'https://chzzk.naver.com',
                            'Referer': 'https://chzzk.naver.com/'
                        },
                        timeout: 10000
                    });
                    
                    const lives = res.data?.content?.data || [];
                    
                    const normalize = (str) => str.replace(/[^a-zA-Z0-9가-힣]/g, '').toLowerCase();
                    const targetEng = normalize(game.title.replace(/[™®©]/g, ''));
                    const targetKor = normalize((game.title_ko || "").replace(/[™®©]/g, ''));
                    
                    lives.forEach((item) => {
                        const live = item.live;
                        if (!live) return;
                        
                        const categoryValue = live.liveCategoryValue || '';
                        const normalizedCat = normalize(categoryValue);
                        
                        let isMatch = false;
                        if (targetKor && targetKor.length > 1 && normalizedCat.includes(targetKor)) isMatch = true;
                        else if (targetEng && targetEng.length > 2 && normalizedCat.includes(targetEng)) isMatch = true;

                        if (!isMatch) {
                            const simKor = targetKor ? getSimilarity(targetKor, normalizedCat) : 0;
                            const simEng = targetEng ? getSimilarity(targetEng, normalizedCat) : 0;
                            if (simKor >= 0.70 || simEng >= 0.70) isMatch = true;
                        }
                        
                        if (isMatch) chzzkViewers += live.concurrentUserCount || 0;
                    });
                } catch (err) {
                    // ★ 수술 완료: 네이버 차단(403) 시 이유를 터미널에 명확히 출력하도록 방어 코드를 추가했습니다.
                    if (err.response && (err.response.status === 403 || err.response.status === 429)) {
                        console.log(`[치지직 차단 감지] ${err.response.status} 에러 발생 (${game.title})`);
                    }
                }
            }

            // 3. 스팀 동접자 수집
            const steamCCU = await getSteamCCU(steamId);
            
            // 4. 트렌드 점수 합산
            const trendScore = twitchViewers + (chzzkViewers * 2) + Math.round(steamCCU * 0.1);

            await Game.updateOne(
                { steam_appid: steamId }, 
                { $set: { trend_score: trendScore, twitch_viewers: twitchViewers, chzzk_viewers: chzzkViewers, steam_ccu: steamCCU, lastUpdated: new Date() } }
            );
            await new TrendHistory({ 
                steam_appid: steamId, trend_score: trendScore, twitch_viewers: twitchViewers, chzzk_viewers: chzzkViewers, steam_ccu: steamCCU, recordedAt: new Date() 
            }).save();
            
            processed++;
            console.log(`📡 [${processed}/${allGames.length}] ${game.title} | Trend: ${trendScore} (T:${twitchViewers} C:${chzzkViewers} S:${steamCCU})`);
            
            await sleep(500); 
        }

        console.log(`\n🎉 트렌드 전수조사 완료!`);
        process.exit(0);

    } catch (error) {
        console.error("수집기 크래시 발생:", error);
        if (typeof sendDiscordAlert === 'function') {
            await sendDiscordAlert("Trend Collector 붕괴", `수집기 가동 중 치명적 에러가 발생했습니다.\n\`\`\`json\n${error.message}\n\`\`\``);
        }
        process.exit(1);
    }
}

collectTrends();