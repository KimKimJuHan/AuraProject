require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('./models/Game');
const hltb = require('howlongtobeat');
const hltbService = new hltb.HowLongToBeatService();

// 1. 환경변수 검증 및 로드
const { MONGODB_URI, ITAD_API_KEY, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, CHZZK_CLIENT_ID, CHZZK_CLIENT_SECRET } = process.env;

console.log("📋 환경변수 점검:");
console.log(`  - ITAD KEY: ${ITAD_API_KEY ? "✅ 로드됨" : "❌ 없음"}`);
console.log(`  - TWITCH: ${TWITCH_CLIENT_ID ? "✅ 로드됨" : "⚠️ 없음"}`);
console.log(`  - CHZZK: ${CHZZK_CLIENT_ID ? "✅ 로드됨" : "⚠️ 없음"}`);

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

// ★ 트위치용 영문 별칭 매핑 (공식 카테고리명과 다를 때 사용)
const TWITCH_GAME_ALIAS = {
    "grand theft auto v": "Grand Theft Auto V",
    "gta 5": "Grand Theft Auto V",
    "gta v": "Grand Theft Auto V",
    "pubg: battlegrounds": "PUBG: BATTLEGROUNDS",
    "counter-strike 2": "Counter-Strike",
    "tom clancy's rainbow six siege": "Tom Clancy's Rainbow Six Siege",
    "rainbow six siege": "Tom Clancy's Rainbow Six Siege",
    "r6s": "Tom Clancy's Rainbow Six Siege",
    "baldurs gate 3": "Baldur's Gate 3",
    "the witcher 3: wild hunt": "The Witcher 3: Wild Hunt",
    "among us": "Among Us"
};

// ★ 치지직용 한글 별칭 매핑 (매우 중요)
const KOREAN_NAME_MAP = {
    "palworld": "팰월드",
    "pubg: battlegrounds": "배틀그라운드",
    "league of legends": "리그 오브 레전드",
    "grand theft auto v": "GTA 5", 
    "gta 5": "GTA 5",
    "counter-strike 2": "카운터 스트라이크 2",
    "baldurs gate 3": "발더스 게이트 3",
    "elden ring": "엘든 링",
    "the witcher 3: wild hunt": "더 위쳐 3: 와일드 헌트",
    "apex legends": "에이펙스 레전드",
    "dota 2": "도타 2",
    "lost ark": "로스트아크",
    "stardew valley": "스타듀 밸리",
    "terraria": "테라리아",
    "lethal company": "리썰 컴퍼니",
    "rust": "러스트",
    "dayz": "데이즈",
    "among us": "어몽어스",
    "tom clancy's rainbow six siege": "레인보우 식스 시즈",
    "rainbow six siege": "레인보우 식스 시즈",
    "dead by daylight": "데드 바이 데이라이트",
    "overwatch 2": "오버워치 2",
    "team fortress 2": "팀 포트리스 2",
    "left 4 dead 2": "레프트 4 데드 2",
    "warframe": "워프레임",
    "assetto corsa": "아세토 코르사"
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
    let cleaned = name.toLowerCase();
    cleaned = cleaned.replace(/[™®©]/g, '');
    const suffixes = ["game of the year", "goty", "complete edition", "definitive", "remastered", "deluxe", "ultimate", "legacy", "edition", "re-elected"];
    suffixes.forEach(s => {
        const regex = new RegExp(`\\s*${s}.*$`, 'gi');
        cleaned = cleaned.replace(regex, '');
    });
    return cleaned.replace(/\s*\(.*\)/g, '').trim();
}

// 트위치 시청자 수 조회
async function getTwitchStats(gameName) {
    if (!TWITCH_CLIENT_ID) return 0;
    if (!twitchToken) await getTwitchToken();
    if (!twitchToken) return 0;
    
    const cleanedName = cleanGameName(gameName);
    const searchName = TWITCH_GAME_ALIAS[cleanedName] || cleanedName;

    try {
        const searchRes = await axios.get('https://api.twitch.tv/helix/search/categories', {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchToken}` },
            params: { query: searchName, first: 5 }
        });
        
        const candidates = searchRes.data?.data || [];
        if (candidates.length === 0) return 0;

        let targetGame = candidates[0];
        const exactMatch = candidates.find(c => c.name.toLowerCase() === searchName.toLowerCase());
        if (exactMatch) targetGame = exactMatch;

        const streamRes = await axios.get('https://api.twitch.tv/helix/streams', {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchToken}` },
            params: { game_id: targetGame.id, first: 100 }
        });
        return streamRes.data.data.reduce((acc, s) => acc + s.viewer_count, 0);
    } catch (e) { return 0; }
}

// ★ 치지직 실시간 시청자 수 조회 (구조 수정됨)
async function getChzzkStats(gameName) {
    const cleanedName = cleanGameName(gameName);
    
    // 한글 매핑 우선 사용
    const queries = [];
    if (KOREAN_NAME_MAP[cleanedName]) queries.push(KOREAN_NAME_MAP[cleanedName]);
    queries.push(cleanedName);

    for (const query of queries) {
        if (!query) continue;
        try {
            const encodeName = encodeURIComponent(query);
            const url = `https://api.chzzk.naver.com/service/v1/search/lives?keyword=${encodeName}&offset=0&size=20&sortType=POPULAR`;
            
            const res = await axios.get(url, {
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    ...(CHZZK_CLIENT_ID && { 'Client-Id': CHZZK_CLIENT_ID, 'Client-Secret': CHZZK_CLIENT_SECRET })
                }
            });

            const lives = res.data?.content?.data || [];
            
            if (lives.length > 0) {
                let totalViewers = 0;
                let matchCount = 0;

                lives.forEach(item => {
                    // ⚠️ [핵심 수정] live 객체 내부 접근으로 변경
                    const live = item.live; 
                    if (!live) return;

                    const category = (live.liveCategoryValue || "").replace(/\s/g, '').toLowerCase();
                    const q = query.replace(/\s/g, '').toLowerCase();

                    // 카테고리가 검색어와 일치하거나 포함되면 집계
                    if (category.includes(q) || q.includes(category)) {
                        totalViewers += live.concurrentUserCount || 0;
                        matchCount++;
                    }
                });

                if (matchCount > 0) return totalViewers;
            }
        } catch (e) { }
    }
    return 0;
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
        
        return {
            current_price: dealsRaw[0]?.price?.amount ?? 0,
            regular_price: dealsRaw[0]?.regular?.amount ?? 0,
            discount_percent: dealsRaw[0]?.cut ?? 0,
            deals: dealsRaw.map(d => ({
                 shopName: d.shop?.name || "Store",
                 price: d.price?.amount ?? 0,
                 regularPrice: d.regular?.amount ?? 0,
                 discount: d.cut ?? 0,
                 url: d.url || ""
            })),
            historical_low: gameData.historyLow?.price?.amount || 0
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

    // 수집 대상 (Steam Top Chart)
    const targetAppIds = [
        1623730, 578080, 570, 730, 1172470, 244210, 271590, 1086940, 1245620, 
        292030, 359550, 105600, 413150, 1966720, 230410, 252490, 221100, 440, 550, 945360
    ];
    console.log(`🎯 수집 대상: ${targetAppIds.length}개`);

    let successCount = 0;

    for (const appid of targetAppIds) {
      try {
        await sleep(1500);

        const steamRes = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=korean&cc=kr`);
        if (!steamRes.data[appid]?.success) continue;
        const data = steamRes.data[appid].data;
        if (data.type !== 'game') continue;

        // 가격 정보
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

        // 트렌드 점수
        const cleanName = cleanGameName(data.name);
        const [twitchView, chzzkView] = await Promise.all([
            getTwitchStats(cleanName),
            getChzzkStats(cleanName)
        ]);
        const trendScore = twitchView + chzzkView;

        // 날짜 처리
        let releaseDate = new Date();
        if (data.release_date?.date) {
            const dateStr = data.release_date.date.replace(/년|월|일/g, '-').replace(/\s/g, '');
            const parsed = new Date(dateStr);
            if (!isNaN(parsed.getTime())) releaseDate = parsed;
        }

        // 태그
        const rawTags = [];
        if(data.genres) rawTags.push(...data.genres.map(g=>g.description));
        if(data.categories) rawTags.push(...data.categories.map(c=>c.description));
        const smartTags = translateTags(rawTags);

        // HLTB
        let playTime = "정보 없음";
        try {
            const hltbRes = await hltbService.search(cleanName);
            if(hltbRes.length > 0) playTime = `${hltbRes[0].gameplayMain} 시간`;
        } catch(e){}

        const gameDoc = {
            slug: `steam-${appid}`,
            steam_appid: appid,
            title: data.name,
            title_ko: KOREAN_NAME_MAP[cleanName] || data.name,
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