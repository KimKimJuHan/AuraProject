require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('./models/Game');
const GameCategory = require('./models/GameCategory'); // 트렌드 족보
const GameMetadata = require('./models/GameMetadata'); // 가격 족보
const hltb = require('howlongtobeat');
const hltbService = new hltb.HowLongToBeatService();

const { MONGODB_URI, ITAD_API_KEY, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, CHZZK_CLIENT_ID, CHZZK_CLIENT_SECRET } = process.env;

if (!ITAD_API_KEY) { console.error("🚨 ITAD_API_KEY 누락"); process.exit(1); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// --- [트위치 토큰] ---
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

// --- [태그 매핑] ---
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

// --- [A. 트렌드 조회] ---
async function getTrendStats(steamAppId) {
    const mapping = await GameCategory.findOne({ steamAppId });
    let twitch = { value: 0, status: 'fail' }; 
    let chzzk = { value: 0, status: 'fail' };

    // 트위치
    if (mapping?.twitch?.id) {
        if (!twitchToken) await getTwitchToken();
        try {
            const res = await axios.get('https://api.twitch.tv/helix/streams', {
                headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchToken}` },
                params: { game_id: mapping.twitch.id, first: 100 }
            });
            const viewers = res.data.data.reduce((acc, s) => acc + s.viewer_count, 0);
            twitch = { value: viewers, status: 'ok' };
        } catch (e) {}
    }

    // 치지직
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
            chzzk = { value: viewers, status: 'ok' };
        } catch (e) {}
    }
    return { twitch, chzzk };
}

function calculateWeightedScore(trends) {
    const { twitch, chzzk } = trends;
    if (twitch.status === 'ok' && chzzk.status === 'ok') return twitch.value + chzzk.value;
    if (twitch.status === 'ok') return twitch.value * 2;
    if (chzzk.status === 'ok') return chzzk.value * 2;
    return 0;
}

// --- [B. 가격 조회 (ITAD + Steam Package)] ---
async function fetchPriceInfo(steamAppId, steamData) {
    let priceInfo = {
        regular_price: 0, current_price: 0, discount_percent: 0,
        store_name: 'Steam', store_url: `https://store.steampowered.com/app/${steamAppId}`,
        isFree: steamData.is_free === true, deals: []
    };

    if (steamData.price_overview) {
        priceInfo.regular_price = steamData.price_overview.initial / 100;
        priceInfo.current_price = steamData.price_overview.final / 100;
        priceInfo.discount_percent = steamData.price_overview.discount_percent;
    } 
    else if (!steamData.is_free && steamData.packages && steamData.packages.length > 0) {
        try {
            const packageId = steamData.packages[0]; 
            const pkgRes = await axios.get(`https://store.steampowered.com/api/packagedetails?packageids=${packageId}&l=korean&cc=kr`);
            const pkgData = pkgRes.data[packageId]?.data;
            if (pkgData && pkgData.price) {
                priceInfo.regular_price = pkgData.price.initial / 100;
                priceInfo.current_price = pkgData.price.final / 100;
                priceInfo.discount_percent = pkgData.price.discount_percent;
            }
        } catch(e) {}
    }

    const metadata = await GameMetadata.findOne({ steamAppId });
    if (metadata?.itad?.uuid) {
        try {
            const pricesRes = await axios.post(`https://api.isthereanydeal.com/games/prices/v3?key=${ITAD_API_KEY}&country=KR`, 
                [metadata.itad.uuid], { headers: { 'Content-Type': 'application/json' }, timeout: 5000 });
            
            const itadGame = pricesRes.data?.[0];
            if (itadGame) {
                const deals = (itadGame.deals || []).sort((a, b) => a.price.amount - b.price.amount);
                
                priceInfo.deals = deals.map(d => ({ 
                    shopName: d.shop?.name, price: d.price?.amount, regularPrice: d.regular?.amount, discount: d.cut, url: d.url 
                }));
                priceInfo.historical_low = itadGame.historyLow?.price?.amount || 0;

                const bestDeal = deals[0];
                if (bestDeal && !priceInfo.isFree && (bestDeal.price.amount < priceInfo.current_price || priceInfo.current_price === 0)) {
                    priceInfo.current_price = bestDeal.price.amount;
                    priceInfo.regular_price = bestDeal.regular.amount;
                    priceInfo.discount_percent = bestDeal.cut;
                }
            }
        } catch (e) {}
    }

    return priceInfo;
}

// --- [C. 메인 수집 루프] ---
async function collectGamesData() {
    if (!MONGODB_URI) return;
    await mongoose.connect(MONGODB_URI);
    console.log("✅ DB Connected. 수집 시작...");

    const metadatas = await GameMetadata.find({});
    let targetAppIds = metadatas.map(m => m.steamAppId);

    if (targetAppIds.length === 0) {
        console.log("⚠️ 메타데이터 없음. 기본 목록 사용");
        targetAppIds = [271590, 1623730, 1086940]; 
    }
    
    console.log(`🎯 수집 대상: ${targetAppIds.length}개`);

    let count = 0;
    for (const appid of targetAppIds) {
        try {
            await sleep(1500); 

            const steamRes = await axios.get(`https://store.steampowered.com/api/appdetails`, {
                params: { appids: appid, l: 'korean', cc: 'kr' },
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
            });
            const data = steamRes.data[appid]?.data;
            if (!data) continue;

            const trends = await getTrendStats(appid);
            const trendScore = calculateWeightedScore(trends);
            const priceInfo = await fetchPriceInfo(appid, data);

            let playTime = "정보 없음";
            try {
                const hltbRes = await hltbService.search(data.name.replace(/[™®©]/g,''));
                if(hltbRes.length > 0) playTime = `${hltbRes[0].gameplayMain} 시간`;
            } catch(e){}

            const categoryData = await GameCategory.findOne({ steamAppId: appid });

            await Game.findOneAndUpdate({ steam_appid: appid }, {
                slug: `steam-${appid}`,
                steam_appid: appid,
                title: data.name,
                title_ko: categoryData?.chzzk?.categoryValue || data.name,
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
            console.log(`✅ [${count}] ${data.name} (Price: ${priceInfo.current_price}원 | Trend: ${trendScore})`);

        } catch (e) { console.error(`❌ Error ${appid}: ${e.message}`); }
    }
    console.log("🎉 수집 완료");
    process.exit(0);
}

collectGamesData();