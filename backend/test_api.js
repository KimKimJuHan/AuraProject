require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('./models/Game');
const hltb = require('howlongtobeat');
const hltbService = new hltb.HowLongToBeatService();

const { MONGODB_URI, ITAD_API_KEY, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, CHZZK_CLIENT_ID, CHZZK_CLIENT_SECRET } = process.env;

if (!ITAD_API_KEY) { console.error("🚨 API Key Missing"); process.exit(1); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ★ [핵심] 게임별 플랫폼 ID 매핑 테이블 (Hardcoded Mapping)
// 스팀 AppID를 키(Key)로 사용하여, 각 플랫폼에서 사용하는 정확한 ID나 검색어를 지정합니다.
const GAME_ID_MAP = {
    "1623730": { // Palworld
        twitch_id: "1036710512", // Twitch Category ID (고정)
        chzzk_keyword: "팰월드"   // 치지직 검색어 (한글이 정확함)
    },
    "578080": { // PUBG
        twitch_id: "493057",
        chzzk_keyword: "배틀그라운드"
    },
    "570": { // Dota 2
        twitch_id: "29595",
        chzzk_keyword: "도타 2"
    },
    "730": { // CS2
        twitch_id: "32399",
        chzzk_keyword: "카운터 스트라이크 2"
    },
    "271590": { // GTA 5
        twitch_id: "32982",
        chzzk_keyword: "GTA 5"
    },
    "359550": { // Rainbow Six Siege
        twitch_id: "460630",
        chzzk_keyword: "레인보우 식스 시즈"
    },
    "21779": { // LoL (참고용 ID, 스팀엔 없지만 예시)
        twitch_id: "21779",
        chzzk_keyword: "리그 오브 레전드"
    },
    "1086940": { // Baldur's Gate 3
        twitch_id: "491487",
        chzzk_keyword: "발더스 게이트 3"
    },
    "1245620": { // Elden Ring
        twitch_id: "512953",
        chzzk_keyword: "엘든 링"
    }
    // 필요한 게임 계속 추가 가능
};

// 태그 매핑
const TAG_MAP = {
  'rpg': 'RPG', 'action': '액션', 'fps': 'FPS', 'simulation': '시뮬레이션', 'strategy': '전략',
  'sports': '스포츠', 'racing': '레이싱', 'puzzle': '퍼즐', 'survival': '생존', 'horror': '공포',
  'adventure': '어드벤처', 'open world': '오픈 월드', 'co-op': '협동', 'multiplayer': '멀티플레이',
  'roguelike': '로그라이크', 'souls-like': '소울라이크', 'story rich': '스토리 중심'
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

// 트위치 토큰 관리
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

// 이름 정제
function cleanGameName(name) {
    return name.replace(/[™®©]/g, '').replace(/\(.*\)/g, '').trim();
}

// 트위치 조회 (ID 매핑 우선)
async function getTwitchStats(steamAppId, gameName) {
    if (!TWITCH_CLIENT_ID) return 0;
    if (!twitchToken) await getTwitchToken();
    
    let gameId = null;

    // 1. 매핑 테이블 확인
    if (GAME_ID_MAP[steamAppId]?.twitch_id) {
        gameId = GAME_ID_MAP[steamAppId].twitch_id;
    } 
    // 2. 없으면 검색 (Fallback)
    else {
        try {
            const searchName = cleanGameName(gameName);
            const searchRes = await axios.get('https://api.twitch.tv/helix/search/categories', {
                headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchToken}` },
                params: { query: searchName, first: 1 }
            });
            gameId = searchRes.data?.data?.[0]?.id;
        } catch (e) { return 0; }
    }

    if (!gameId) return 0;

    // 3. 시청자 수 조회
    try {
        const streamRes = await axios.get('https://api.twitch.tv/helix/streams', {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchToken}` },
            params: { game_id: gameId, first: 100 }
        });
        return streamRes.data.data.reduce((acc, s) => acc + s.viewer_count, 0);
    } catch (e) { return 0; }
}

// 치지직 조회 (키워드 매핑 우선)
async function getChzzkStats(steamAppId, gameName) {
    // 1. 매핑된 한글 키워드 확인
    let searchKeyword = cleanGameName(gameName);
    if (GAME_ID_MAP[steamAppId]?.chzzk_keyword) {
        searchKeyword = GAME_ID_MAP[steamAppId].chzzk_keyword;
    }

    try {
        const encodeName = encodeURIComponent(searchKeyword);
        const url = `https://api.chzzk.naver.com/service/v1/search/lives?keyword=${encodeName}&offset=0&size=20&sortType=POPULAR`;
        
        const res = await axios.get(url, {
            headers: { 
                'User-Agent': 'Mozilla/5.0',
                ...(CHZZK_CLIENT_ID && { 'Client-Id': CHZZK_CLIENT_ID, 'Client-Secret': CHZZK_CLIENT_SECRET })
            }
        });

        const lives = res.data?.content?.data || [];
        if (lives.length === 0) return 0;

        let totalViewers = 0;
        let matchCount = 0;
        const target = searchKeyword.replace(/\s/g, '').toLowerCase(); // 비교용 정제 키워드

        lives.forEach(item => {
            const live = item.live;
            if (!live) return;
            
            // 카테고리 매칭 (공백 제거 후 비교)
            const category = (live.liveCategoryValue || "").replace(/\s/g, '').toLowerCase();
            
            if (category.includes(target) || target.includes(category)) {
                totalViewers += live.concurrentUserCount || 0;
                matchCount++;
            }
        });

        return matchCount > 0 ? totalViewers : 0;
    } catch (e) { return 0; }
}

async function fetchITADData(steamAppId) {
    try {
        const lookupRes = await axios.get(`https://api.isthereanydeal.com/games/lookup/v1?key=${ITAD_API_KEY}&appid=${steamAppId}`, { timeout: 5000 });
        if (!lookupRes.data?.found) return null;
        
        const pricesRes = await axios.post(`https://api.isthereanydeal.com/games/prices/v3?key=${ITAD_API_KEY}&country=KR`, 
            [lookupRes.data.game.id], 
            { headers: { 'Content-Type': 'application/json' }, timeout: 5000 }
        );
        
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
    console.log("✅ DB Connected & Start Collecting...");

    const targetAppIds = [
        1623730, 578080, 570, 730, 1172470, 244210, 271590, 1086940, 1245620, 
        292030, 359550, 105600, 413150, 1966720, 230410, 252490, 221100, 440, 550, 945360
    ];

    let count = 0;
    for (const appid of targetAppIds) {
        try {
            await sleep(1500);
            const steamRes = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=korean&cc=kr`);
            if (!steamRes.data[appid]?.success) continue;
            
            const data = steamRes.data[appid].data;
            if (data.type !== 'game') continue;

            // 1. 가격
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

            // 2. 트렌드 (ID 매핑 사용)
            const [twitchView, chzzkView] = await Promise.all([
                getTwitchStats(appid, data.name),
                getChzzkStats(appid, data.name)
            ]);
            const trendScore = twitchView + chzzkView;

            // 3. DB 저장
            await Game.findOneAndUpdate({ steam_appid: appid }, {
                slug: `steam-${appid}`,
                steam_appid: appid,
                title: data.name,
                title_ko: GAME_ID_MAP[appid]?.chzzk_keyword || data.name, // 한글 이름 우선
                main_image: data.header_image,
                description: data.short_description,
                smart_tags: translateTags([...(data.genres||[]).map(g=>g.description), ...(data.categories||[]).map(c=>c.description)]),
                trend_score: trendScore,
                twitch_viewers: twitchView,
                chzzk_viewers: chzzkView,
                price_info: priceInfo,
                releaseDate: data.release_date?.date ? new Date(data.release_date.date.replace(/년|월|일/g, '-')) : new Date(),
                screenshots: data.screenshots?.map(s=>s.path_full)||[],
                trailers: data.movies?.map(m=>m.webm?.max)||[],
                metacritic_score: data.metacritic?.score || 0
            }, { upsert: true });

            count++;
            console.log(`✅ [${count}] ${data.name} (Trend: ${trendScore} | Tw: ${twitchView} | Chzzk: ${chzzkView})`);

        } catch (e) { console.error(`❌ Error ${appid}: ${e.message}`); }
    }
    console.log("🎉 Done");
    process.exit(0);
}

collectGamesData();