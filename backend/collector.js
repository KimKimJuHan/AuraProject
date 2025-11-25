require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('./models/Game');
const hltb = require('howlongtobeat');
const hltbService = new hltb.HowLongToBeatService();

// 1. 환경변수 검증 및 로드
const { MONGODB_URI, ITAD_API_KEY, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET } = process.env;

console.log("📋 환경변수 점검:");
console.log(`  - ITAD KEY: ${ITAD_API_KEY ? "✅ 로드됨" : "❌ 없음"}`);
console.log(`  - TWITCH: ${TWITCH_CLIENT_ID ? "✅ 로드됨" : "⚠️ 없음"}`);

if (!ITAD_API_KEY) {
    console.error("🚨 ITAD_API_KEY가 없습니다. 수집을 중단합니다.");
    process.exit(1);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 태그 매핑
const TAG_MAP = {
  'rpg': 'RPG', 'role-playing': 'RPG', 'jrpg': 'RPG', 'action': '액션', 'hack and slash': '액션',
  'fps': 'FPS', 'shooter': 'FPS', 'simulation': '시뮬레이션', 'strategy': '전략', 'rts': '전략',
  'sports': '스포츠', 'racing': '레이싱', 'puzzle': '퍼즐', 'survival': '생존', 'horror': '공포',
  'rhythm': '리듬', 'adventure': '어드벤처', 'open world': '오픈 월드', 'co-op': '협동',
  'multiplayer': '멀티플레이', 'roguelike': '로그라이크', 'souls-like': '소울라이크',
  'story rich': '스토리 중심', 'pixel graphics': '픽셀 그래픽', '2d': '2D', '3d': '3D',
  'anime': '애니메이션', 'scifi': 'SF', 'sci-fi': 'SF', 'fantasy': '판타지'
};

function translateTags(tags) {
    if (!tags || !Array.isArray(tags)) return [];
    const myTags = new Set();
    tags.forEach(t => {
        const lower = t.toLowerCase();
        for (const key in TAG_MAP) { if (lower.includes(key)) myTags.add(TAG_MAP[key]); }
    });
    return Array.from(myTags);
}

// ---------------------------------------------------------
// [A] 트렌드 데이터 (Twitch & Chzzk)
// ---------------------------------------------------------
let twitchToken = null;

// 트위치 토큰 발급
async function getTwitchToken() {
    if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) return;
    try {
        const res = await axios.post('https://id.twitch.tv/oauth2/token', null, {
            params: { client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' }
        });
        twitchToken = res.data.access_token;
    } catch (e) { console.error("⚠️ Twitch Token 실패:", e.message); }
}

function cleanGameName(name) {
    if (!name) return "";
    let cleaned = name.replace(/[™®©]/g, '');
    const suffixes = ["Game of the Year", "GOTY", "Complete Edition", "Definitive", "Remastered", "Deluxe", "Ultimate"];
    suffixes.forEach(s => {
        const regex = new RegExp(`\\s*${s}.*$`, 'gi');
        cleaned = cleaned.replace(regex, '');
    });
    return cleaned.replace(/\s*\(.*\)/g, '').trim();
}

// 트위치 시청자 수 조회
async function getTwitchStats(gameName) {
    if (!TWITCH_CLIENT_ID || !twitchToken) {
        if (TWITCH_CLIENT_ID) await getTwitchToken();
        if (!twitchToken) return 0;
    }
    
    const searchName = cleanGameName(gameName);
    try {
        const searchRes = await axios.get('https://api.twitch.tv/helix/search/categories', {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchToken}` },
            params: { query: searchName, first: 1 }
        });
        const foundGame = searchRes.data?.data?.[0];
        if (!foundGame) return 0;

        const streamRes = await axios.get('https://api.twitch.tv/helix/streams', {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchToken}` },
            params: { game_id: foundGame.id, first: 100 }
        });
        return streamRes.data.data.reduce((acc, s) => acc + s.viewer_count, 0);
    } catch (e) { return 0; }
}

// ★ 치지직 실시간 시청자 수 조회 (비공식 API 활용)
async function getChzzkStats(gameName) {
    // 치지직은 한글 게임명을 좋아함. 영어면 검색이 잘 안 될 수 있음.
    const searchName = cleanGameName(gameName); 
    if (!searchName) return 0;

    try {
        // 1. 전체 라이브 목록 검색 (인기순)
        // 참고: 게임별 필터가 없어서 통합 검색을 해야 함.
        // 하지만 여기서는 '게임 카테고리' 내의 방송을 찾는게 아니라, 방송 제목/카테고리에 게임명이 포함된걸 찾아야 함.
        // 다행히 치지직 검색 API는 방송 검색을 지원함.
        
        const encodeName = encodeURIComponent(searchName);
        const url = `https://api.chzzk.naver.com/service/v1/search/lives?keyword=${encodeName}&offset=0&size=20&sortType=POPULAR`;
        
        const res = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });

        const lives = res.data?.content?.data || [];
        let totalViewers = 0;

        lives.forEach(live => {
            // 방송 카테고리가 검색어와 유사하거나 포함되면 집계
            // (예: 'League of Legends' 검색 -> 카테고리 '리그 오브 레전드' 방송 집계)
            const category = live.liveCategoryValue || "";
            // 영어 이름 매칭이 어려우므로, 단순히 검색 결과 상위권의 시청자수를 합산 (약식)
            // 정확도를 위해선 한글 게임명 매핑이 필요하지만, 여기선 검색 결과 신뢰
            totalViewers += live.concurrentUserCount || 0;
        });

        return totalViewers;
    } catch (e) { return 0; }
}

// ---------------------------------------------------------
// [B] ITAD 로직
// ---------------------------------------------------------
async function fetchITADData(steamAppId) {
    try {
        const lookupUrl = `https://api.isthereanydeal.com/games/lookup/v1?key=${ITAD_API_KEY}&appid=${steamAppId}`;
        const lookupRes = await axios.get(lookupUrl, { timeout: 5000 });
        if (!lookupRes.data?.found || !lookupRes.data.game?.id) return null;
        const itadUuid = lookupRes.data.game.id;

        const priceUrl = `https://api.isthereanydeal.com/games/prices/v3?key=${ITAD_API_KEY}&country=KR`;
        const pricesRes = await axios.post(priceUrl, [itadUuid], { headers: { 'Content-Type': 'application/json' }, timeout: 5000 });
        
        const gameData = pricesRes.data?.[0];
        if (!gameData) return null;

        const dealsRaw = gameData.deals || [];
        dealsRaw.sort((a, b) => (a.price.amount - b.price.amount));
        const bestDeal = dealsRaw[0] || {};

        return {
            current_price: bestDeal.price?.amount ?? 0,
            regular_price: bestDeal.regular?.amount ?? 0,
            discount_percent: bestDeal.cut ?? 0,
            store_name: bestDeal.shop?.name || "Steam",
            url: bestDeal.url || "",
            historical_low: gameData.historyLow?.price?.amount || 0,
            deals: dealsRaw.map(d => ({
                 shopName: d.shop?.name || "Store",
                 price: d.price?.amount ?? 0,
                 regularPrice: d.regular?.amount ?? 0,
                 discount: d.cut ?? 0,
                 url: d.url || ""
            }))
        };
    } catch (e) { return null; }
}

// ---------------------------------------------------------
// [C] 메인 수집 로직
// ---------------------------------------------------------
async function collectGamesData() {
  if (!MONGODB_URI) return console.error("❌ DB URI 없음");

  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ DB 연결 성공. 데이터 수집 시작...");

    // 수집 대상 (Steam Top Chart + 예시 ID)
    const targetAppIds = [
        1623730, 578080, 570, 730, 1172470, 244210, 271590, 1086940, 1245620, 
        292030, 359550, 105600, 413150, 1966720, 230410, 252490, 221100, 440, 550, 945360
    ];
    console.log(`🎯 수집 대상: ${targetAppIds.length}개`);

    let successCount = 0;

    for (const appid of targetAppIds) {
      try {
        await sleep(1500);

        // 1. Steam 정보
        const steamRes = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=korean&cc=kr`);
        if (!steamRes.data[appid]?.success) continue;
        const data = steamRes.data[appid].data;
        if (data.type !== 'game') continue;

        // 2. 가격 정보
        const priceOverview = data.price_overview;
        const isFree = data.is_free === true;
        let priceInfo = {
            regular_price: priceOverview ? priceOverview.initial / 100 : 0,
            current_price: priceOverview ? priceOverview.final / 100 : 0,
            discount_percent: priceOverview ? priceOverview.discount_percent : 0,
            store_url: `https://store.steampowered.com/app/${appid}`,
            store_name: 'Steam',
            isFree: isFree,
            deals: []
        };

        const itadData = await fetchITADData(appid);
        if (itadData) {
            if (!isFree && (itadData.current_price < priceInfo.current_price || priceInfo.current_price === 0)) {
                 priceInfo = { ...priceInfo, ...itadData };
            } else {
                 priceInfo.deals = itadData.deals;
                 priceInfo.historical_low = itadData.historical_low;
            }
        }

        // 3. 트렌드 점수 (치지직 로직 변경됨)
        // 스팀 이름(영어)보다는 한글 이름으로 검색해야 치지직에서 잘 나옴
        const searchName = cleanGameName(data.name); 
        
        const [twitchView, chzzkView] = await Promise.all([
            getTwitchStats(searchName),
            getChzzkStats(searchName) // 이제 진짜 시청자 수 가져옴
        ]);
        const trendScore = twitchView + chzzkView;

        // 4. 날짜 처리
        let releaseDate = new Date();
        if (data.release_date?.date) {
            const dateStr = data.release_date.date.replace(/년|월|일/g, '-').replace(/\s/g, '');
            const parsed = new Date(dateStr);
            if (!isNaN(parsed.getTime())) releaseDate = parsed;
        }

        // 5. 태그
        const rawTags = [];
        if(data.genres) rawTags.push(...data.genres.map(g=>g.description));
        if(data.categories) rawTags.push(...data.categories.map(c=>c.description));
        const smartTags = translateTags(rawTags);

        // 6. HLTB
        let playTime = "정보 없음";
        try {
            const hltbRes = await hltbService.search(searchName);
            if(hltbRes.length > 0) playTime = `${hltbRes[0].gameplayMain} 시간`;
        } catch(e){}

        // 7. DB 저장
        const gameDoc = {
            slug: `steam-${appid}`,
            steam_appid: appid,
            title: data.name,
            title_ko: data.name,
            main_image: data.header_image,
            description: data.short_description,
            smart_tags: smartTags,
            trend_score: trendScore,
            twitch_viewers: twitchView,
            chzzk_viewers: chzzkView,
            pc_requirements: {
                minimum: data.pc_requirements?.minimum || "정보 없음",
                recommended: data.pc_requirements?.recommended || "정보 없음"
            },
            price_info: priceInfo,
            releaseDate: releaseDate,
            screenshots: data.screenshots ? data.screenshots.map(s => s.path_full) : [],
            trailers: data.movies ? data.movies.map(m => m.webm?.max) : [],
            metacritic_score: data.metacritic?.score || 0,
            play_time: playTime
        };

        await Game.findOneAndUpdate({ steam_appid: appid }, gameDoc, { upsert: true });
        successCount++;
        
        console.log(`✅ [${successCount}] 저장: ${data.name} (Trend: ${trendScore} | Tw: ${twitchView} | Chzzk: ${chzzkView})`);

      } catch (innerErr) {
        console.error(`❌ 개별 실패 (${appid}): ${innerErr.message}`);
      }
    }

    console.log(`🎉 완료. 총 ${successCount}개 저장.`);
    process.exit(0);

  } catch (err) {
    console.error("🚨 시스템 에러:", err);
    process.exit(1);
  }
}

collectGamesData();