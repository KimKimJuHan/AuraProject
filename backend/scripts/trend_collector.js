// backend/scripts/trend_collector.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') }); // 경로 충돌 타파
const mongoose = require('mongoose');
const axios = require('axios');

const Game = require('../models/Game');
const GameCategory = require('../models/GameCategory');
const TrendHistory = require('../models/TrendHistory');

const { MONGODB_URI, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, CHZZK_CLIENT_ID, CHZZK_CLIENT_SECRET } = process.env;

if (!MONGODB_URI) { console.error('❌ MONGODB_URI 누락'); process.exit(1); }

let twitchToken = null;
async function getTwitchToken() {
    if (!TWITCH_CLIENT_ID) return;
    try {
        const res = await axios.post('https://id.twitch.tv/oauth2/token', null, { params: { client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' } });
        twitchToken = res.data.access_token;
    } catch (err) {
        console.error('❌ 트위치 토큰 발급 실패:', err.message);
    }
}

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

        // 트위치 수집 로직
        if (categoryData?.twitch?.id && twitchToken) {
            try {
                const res = await axios.get('https://api.twitch.tv/helix/streams', { 
                    headers: { 'Client-ID': TWITCH_CLIENT_ID, Authorization: `Bearer ${twitchToken}` }, 
                    params: { game_id: categoryData.twitch.id, first: 100 } 
                });
                twitchViewers = res.data.data.reduce((acc, s) => acc + (s.viewer_count || 0), 0);
            } catch (err) {
                console.error(`[Twitch Error] ${game.title}:`, err.message);
            }
        }

        // 치지직 수집 로직 (★ 키 주입, 에러 로깅, 및 지능형 매칭 추가)
        if (categoryData?.chzzk?.categoryValue) {
            try {
                const keyword = encodeURIComponent(categoryData.chzzk.categoryValue);
                const res = await axios.get(`https://api.chzzk.naver.com/service/v1/search/lives?keyword=${keyword}&offset=0&size=50&sortType=POPULAR`, { 
                    headers: { 
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                        'Client-Id': CHZZK_CLIENT_ID || '',
                        'Client-Secret': CHZZK_CLIENT_SECRET || ''
                    } 
                });
                
                const lives = res.data?.content?.data || [];
                
                // ★ 지능형 매칭 적용 (특수문자 및 공백 완벽 무시)
                const normalize = (str) => str.replace(/[^\w가-힣0-9]/g, '').toLowerCase();
                const target = normalize(categoryData.chzzk.categoryValue);
                
                lives.forEach((item) => {
                    const live = item.live;
                    if (!live) return;
                    
                    const cat = normalize(live.liveCategoryValue || '');
                    if (cat.includes(target) || target.includes(cat)) {
                        chzzkViewers += live.concurrentUserCount || 0;
                    }
                });
            } catch (err) {
                console.error(`[Chzzk Error] ${game.title} 수집 실패:`, err.response?.status || err.message);
            }
        }

        const steamCCU = await getSteamCCU(steamId);
        const trendScore = twitchViewers + (chzzkViewers * 2) + Math.round(steamCCU * 0.1);

        await Game.updateOne({ steam_appid: steamId }, { $set: { trend_score: trendScore, twitch_viewers: twitchViewers, chzzk_viewers: chzzkViewers, steam_ccu: steamCCU, lastUpdated: new Date() } });
        await new TrendHistory({ steam_appid: steamId, trend_score: trendScore, twitch_viewers: twitchViewers, chzzk_viewers: chzzkViewers, steam_ccu: steamCCU, recordedAt: new Date() }).save();
        
        processed++;
        console.log(`📡 [${processed}/${allGames.length}] ${game.title} | Trend: ${trendScore} | CHZ: ${chzzkViewers}`);
        await sleep(200); 
    }

    console.log(`\n🎉 트렌드 전수조사 완료!`);
    process.exit(0);
}

collectTrends();