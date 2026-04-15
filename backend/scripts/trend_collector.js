// backend/scripts/trend_collector.js
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const axios = require('axios');

const Game = require('../models/Game');
const GameCategory = require('../models/GameCategory');
const TrendHistory = require('../models/TrendHistory');

const { MONGODB_URI, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, CHZZK_CLIENT_ID, CHZZK_CLIENT_SECRET } = process.env;

if (!MONGODB_URI) { 
    console.error('❌ MONGODB_URI 누락'); 
    process.exit(1); 
}

let twitchToken = null;
let chzzkToken = null;
let chzzkTokenExpiry = 0;

// 1. 트위치 토큰 발급
async function getTwitchToken() {
    if (!TWITCH_CLIENT_ID) return;
    try {
        const res = await axios.post('https://id.twitch.tv/oauth2/token', null, { 
            params: { client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' } 
        });
        twitchToken = res.data.access_token;
    } catch (e) {}
}

// 2. 치지직 공식 OpenAPI 토큰 발급 (네이버 개편 반영)
async function getChzzkToken() {
    if (!CHZZK_CLIENT_ID || !CHZZK_CLIENT_SECRET) return null;
    if (chzzkToken && Date.now() < chzzkTokenExpiry) return chzzkToken;
    
    try {
        const res = await axios.post(
            'https://openapi.chzzk.naver.com/auth/v1/token',
            new URLSearchParams({ 
                grant_type: 'client_credentials', 
                client_id: CHZZK_CLIENT_ID, 
                client_secret: CHZZK_CLIENT_SECRET 
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 5000 }
        );
        chzzkToken = res.data.access_token;
        chzzkTokenExpiry = Date.now() + (res.data.expires_in * 1000) - 300000; // 만료 5분 전 갱신
        return chzzkToken;
    } catch (e) {
        console.warn("⚠️ 치지직 공식 토큰 발급 실패. 비공식 우회 API로 폴백합니다.");
        return null;
    }
}

// 3. 스팀 동접자 수집
async function getSteamCCU(appId) {
    try {
        const res = await axios.get(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appId}`, { timeout: 5000 });
        if (res.data?.response?.result === 1) return res.data.response.player_count || 0;
    } catch (e) {}
    return 0;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function collectTrends() {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ DB Connected. [초고속 전수조사] 트렌드 수집기 시작...');

    const allGames = await Game.find({}).select('steam_appid title').lean();
    if (allGames.length === 0) process.exit(0);

    await getTwitchToken();
    let processed = 0;

    for (const game of allGames) {
        const steamId = game.steam_appid;
        const categoryData = await GameCategory.findOne({ steamAppId: steamId }).lean();
        
        let twitchViewers = 0;
        let chzzkViewers = 0;

        // [수집 A] 트위치 시청자
        if (categoryData?.twitch?.id && twitchToken) {
            try {
                const res = await axios.get('https://api.twitch.tv/helix/streams', { 
                    headers: { 'Client-ID': TWITCH_CLIENT_ID, Authorization: `Bearer ${twitchToken}` }, 
                    params: { game_id: categoryData.twitch.id, first: 100 } 
                });
                twitchViewers = res.data.data.reduce((acc, s) => acc + (s.viewer_count || 0), 0);
            } catch (e) {}
        }

        // [수집 B] 치지직 시청자 (네이버 개편 이중 방어 로직)
        if (categoryData?.chzzk?.categoryValue) {
            const keyword = encodeURIComponent(categoryData.chzzk.categoryValue);
            // 띄어쓰기 및 특수문자 완벽 제거로 매칭률 극대화
            const target = categoryData.chzzk.categoryValue.replace(/[\s_\W]/g, '').toLowerCase();
            const token = await getChzzkToken();

            let success = false;

            // 전략 1: 공식 OpenAPI 호출 시도
            if (token) {
                try {
                    const res = await axios.get(`https://openapi.chzzk.naver.com/open/v1/lives`, {
                        headers: { 'Authorization': `Bearer ${token}` },
                        params: { query: keyword, size: 50 },
                        timeout: 3000
                    });
                    const lives = res.data?.content?.data || res.data?.data || [];
                    lives.forEach((live) => {
                        const cat = (live.liveCategory || live.liveCategoryValue || '').replace(/[\s_\W]/g, '').toLowerCase();
                        if (cat.includes(target) || target.includes(cat)) {
                            chzzkViewers += live.concurrentUserCount || 0;
                        }
                    });
                    success = true;
                } catch (e) {}
            }

            // 전략 2: 공식 API 실패 시 비공식 v2 API 우회 호출 (안티 크롤링 우회 헤더 적용)
            if (!success) {
                try {
                    const res = await axios.get(`https://api.chzzk.naver.com/service/v2/search/lives?keyword=${keyword}&offset=0&size=50`, { 
                        headers: { 
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Referer': 'https://chzzk.naver.com/'
                        },
                        timeout: 3000
                    });
                    const lives = res.data?.content?.data || res.data?.data || [];
                    lives.forEach((item) => {
                        const live = item.live || item;
                        if (!live) return;
                        const cat = (live.liveCategory || live.liveCategoryValue || '').replace(/[\s_\W]/g, '').toLowerCase();
                        if (cat.includes(target) || target.includes(cat)) {
                            chzzkViewers += live.concurrentUserCount || 0;
                        }
                    });
                } catch (e) {}
            }
        }

        // [종합] 트렌드 점수 합산 및 저장
        const steamCCU = await getSteamCCU(steamId);
        // 트렌드 가중치: 치지직(국내) 2배, 트위치 1배, 스팀(글로벌) 0.1배
        const trendScore = twitchViewers + (chzzkViewers * 2) + Math.round(steamCCU * 0.1);

        await Game.updateOne(
            { steam_appid: steamId }, 
            { $set: { trend_score: trendScore, twitch_viewers: twitchViewers, chzzk_viewers: chzzkViewers, steam_ccu: steamCCU, lastUpdated: new Date() } }
        );
        
        await new TrendHistory({ 
            steam_appid: steamId, trend_score: trendScore, twitch_viewers: twitchViewers, chzzk_viewers: chzzkViewers, steam_ccu: steamCCU, recordedAt: new Date() 
        }).save();
        
        processed++;
        console.log(`📡 [${processed}/${allGames.length}] ${game.title} | 점수: ${trendScore} | 치지직: ${chzzkViewers} | 트위치: ${twitchViewers}`);
        
        await sleep(200); // 벤 당하지 않도록 딜레이 유지
    }

    console.log(`\n🎉 트렌드 전수조사 완료!`);
    process.exit(0);
}

collectTrends();