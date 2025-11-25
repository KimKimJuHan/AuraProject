require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('./models/Game');
const GameCategory = require('./models/GameCategory'); // 필수
const hltb = require('howlongtobeat');
const hltbService = new hltb.HowLongToBeatService();

const { MONGODB_URI, ITAD_API_KEY, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, CHZZK_CLIENT_ID, CHZZK_CLIENT_SECRET } = process.env;

if (!ITAD_API_KEY) {
    console.error("🚨 ITAD_API_KEY 누락.");
    process.exit(1);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let twitchToken = null;
async function getTwitchToken() {
    if (!TWITCH_CLIENT_ID) return;
    try {
        const res = await axios.post('https://id.twitch.tv/oauth2/token', null, {
            params: { client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' }
        });
        twitchToken = res.data.access_token;
    } catch (e) { console.error("⚠️ Twitch Token Error"); }
}

const TAG_MAP = {
  'rpg': 'RPG', 'role-playing': 'RPG', 'action': '액션', 'fps': 'FPS', 'simulation': '시뮬레이션', 
  'strategy': '전략', 'sports': '스포츠', 'racing': '레이싱', 'puzzle': '퍼즐', 'survival': '생존', 
  'horror': '공포', 'adventure': '어드벤처', 'open world': '오픈 월드', 'co-op': '협동',
  'multiplayer': '멀티플레이', 'roguelike': '로그라이크', 'souls-like': '소울라이크', 'story rich': '스토리 중심'
};

function translateTags(tags) {
    if (!tags) return [];
    const myTags = new Set();
    tags.forEach(t => {
        const lower = t.toLowerCase();
        for (const key in TAG_MAP) { if (lower.includes(key)) myTags.add(TAG_MAP[key]); }
    });
    return Array.from(myTags);
}

// [A] 트렌드 데이터 (DB 매핑 조회 + 비율 보정)
async function getTrendStats(steamAppId) {
    const mapping = await GameCategory.findOne({ steamAppId });
    
    // 상태 객체: value(시청자수), status(ok/fail)
    let twitch = { value: 0, status: 'fail' }; 
    let chzzk = { value: 0, status: 'fail' };

    // 2. 트위치 조회
    if (mapping?.twitch?.id) {
        if (!twitchToken) await getTwitchToken();
        try {
            const res = await axios.get('https://api.twitch.tv/helix/streams', {
                headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchToken}` },
                params: { game_id: mapping.twitch.id, first: 100 }
            });
            const viewers = res.data.data.reduce((acc, s) => acc + s.viewer_count, 0);
            twitch = { value: viewers, status: 'ok' }; // 성공 (0명이어도 성공)
        } catch (e) { /* 실패 유지 */ }
    } 

    // 3. 치지직 조회
    if (mapping?.chzzk?.categoryValue) {
        try {
            const keyword = encodeURIComponent(mapping.chzzk.categoryValue);
            const res = await axios.get(`https://api.chzzk.naver.com/service/v1/search/lives?keyword=${keyword}&offset=0&size=50&sortType=POPULAR`, {
                headers: { 
                    'User-Agent': 'Mozilla/5.0',
                    ...(CHZZK_CLIENT_ID && { 'Client-Id': CHZZK_CLIENT_ID, 'Client-Secret': CHZZK_CLIENT_SECRET })
                }
            });
            
            const lives = res.data?.content?.data || [];
            const target = mapping.chzzk.categoryValue.replace(/\s/g, ''); 
            
            let viewers = 0;
            lives.forEach(item => {
                const live = item.live;
                if (!live) return;
                const cat = (live.liveCategoryValue || "").replace(/\s/g, '');
                if (cat.includes(target) || target.includes(cat)) {
                    viewers += live.concurrentUserCount || 0;
                }
            });
            chzzk = { value: viewers, status: 'ok' }; // 성공
        } catch (e) { /* 실패 유지 */ }
    }

    return { twitch, chzzk };
}

// 점수 보정 계산 함수
function calculateWeightedScore(trends) {
    const { twitch, chzzk } = trends;
    let finalScore = 0;

    // 둘 다 성공: 단순 합산 (1:1 비율 가정)
    if (twitch.status === 'ok' && chzzk.status === 'ok') {
        finalScore = twitch.value + chzzk.value;
    }
    // 트위치만 성공: 트위치 점수 * 2 (치지직 몫까지 채움)
    else if (twitch.status === 'ok') {
        finalScore = twitch.value * 2;
    }
    // 치지직만 성공: 치지직 점수 * 2
    else if (chzzk.status === 'ok') {
        finalScore = chzzk.value * 2;
    }
    // 둘 다 실패: 0점
    else {
        finalScore = 0;
    }

    return finalScore;
}

// [B] ITAD 로직
async function fetchITADData(steamAppId) {
    try {
        const lookupRes = await axios.get(`https://api.isthereanydeal.com/games/lookup/v1?key=${ITAD_API_KEY}&appid=${steamAppId}`, { timeout: 5000 });
        if (!lookupRes.data?.found) return null;
        
        const pricesRes = await axios.post(`https://api.isthereanydeal.com/games/prices/v3?key=${ITAD_API_KEY}&country=KR`, 
            [lookupRes.data.game.id], { headers: { 'Content-Type': 'application/json' }, timeout: 5000 });
        
        const gameData = pricesRes.data?.[0];
        if (!gameData) return null;
        
        const deals = (gameData.deals || []).sort((a, b) => a.price.amount - b.price.amount);
        const best = deals[0] || {};

        return {
            current_price: best.price?.amount ?? 0,
            regular_price: best.regular?.amount ?? 0,
            discount_percent: best.cut ?? 0,
            deals: deals.map(d => ({ shopName: d.shop?.name, price: d.price?.amount, url: d.url })),
            historical_low: gameData.historyLow?.price?.amount || 0
        };
    } catch (e) { return null; }
}

async function collectGamesData() {
    if (!MONGODB_URI) return;
    await mongoose.connect(MONGODB_URI);
    console.log("✅ DB Connected. 수집 시작...");

    const mappings = await GameCategory.find({});
    let targetAppIds = mappings.map(m => m.steamAppId);

    if (targetAppIds.length === 0) {
        console.log("⚠️ 매핑된 게임 없음. 기본 목록 사용");
        targetAppIds = [1623730, 578080, 570, 730, 271590, 359550];
    }
    
    console.log(`🎯 수집 대상: ${targetAppIds.length}개`);

    let count = 0;
    for (const appid of targetAppIds) {
        try {
            await sleep(1500);

            const steamRes = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=korean&cc=kr`);
            const data = steamRes.data[appid]?.data;
            if (!data) continue;

            // 트렌드 조회 (상태값 포함)
            const trends = await getTrendStats(appid);
            // 보정된 점수 계산
            const trendScore = calculateWeightedScore(trends);

            let priceInfo = {
                regular_price: data.price_overview?.initial / 100 || 0,
                current_price: data.price_overview?.final / 100 || 0,
                discount_percent: data.price_overview?.discount_percent || 0,
                store_name: 'Steam', store_url: `https://store.steampowered.com/app/${appid}`,
                isFree: data.is_free, deals: []
            };
            const itadData = await fetchITADData(appid);
            if (itadData) {
                if (!data.is_free && (itadData.current_price < priceInfo.current_price || priceInfo.current_price === 0)) {
                    priceInfo = { ...priceInfo, ...itadData };
                } else {
                    priceInfo.deals = itadData.deals;
                    priceInfo.historical_low = itadData.historical_low;
                }
            }

            let playTime = "정보 없음";
            try {
                const hltbRes = await hltbService.search(data.name.replace(/[™®©]/g,''));
                if(hltbRes.length > 0) playTime = `${hltbRes[0].gameplayMain} 시간`;
            } catch(e){}

            await Game.findOneAndUpdate({ steam_appid: appid }, {
                slug: `steam-${appid}`,
                steam_appid: appid,
                title: data.name,
                title_ko: (mappings.find(m=>m.steamAppId===appid)?.chzzk?.categoryValue) || data.name,
                main_image: data.header_image,
                description: data.short_description,
                smart_tags: translateTags([...(data.genres||[]).map(g=>g.description), ...(data.categories||[]).map(c=>c.description)]),
                trend_score: trendScore,
                twitch_viewers: trends.twitch.status === 'ok' ? trends.twitch.value : 0,
                chzzk_viewers: trends.chzzk.status === 'ok' ? trends.chzzk.value : 0,
                price_info: priceInfo,
                releaseDate: data.release_date?.date ? new Date(data.release_date.date.replace(/년|월|일/g, '-')) : new Date(),
                screenshots: data.screenshots?.map(s=>s.path_full)||[],
                trailers: data.movies?.map(m=>m.webm?.max)||[],
                metacritic_score: data.metacritic?.score || 0,
                play_time: playTime
            }, { upsert: true });

            count++;
            
            // 로그 출력: (Tw: 1000 | Chzzk: X -> 보정점수)
            const twLog = trends.twitch.status === 'ok' ? trends.twitch.value : 'X';
            const chLog = trends.chzzk.status === 'ok' ? trends.chzzk.value : 'X';
            console.log(`✅ [${count}] ${data.name} (Total: ${trendScore} | Tw: ${twLog} | Ch: ${chLog})`);

        } catch (e) { console.error(`❌ Error ${appid}: ${e.message}`); }
    }
    console.log("🎉 수집 완료");
    process.exit(0);
}

collectGamesData();