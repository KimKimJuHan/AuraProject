require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('./models/Game');
const hltb = require('howlongtobeat');
const hltbService = new hltb.HowLongToBeatService();

// 1. 환경변수 검증 및 로드
const { MONGODB_URI, ITAD_API_KEY, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, CHZZK_CLIENT_ID, CHZZK_CLIENT_SECRET } = process.env;

// [디버깅 로그] 환경변수 상태 확인
console.log("📋 환경변수 점검:");
console.log(`  - ITAD KEY: ${ITAD_API_KEY ? "✅ 로드됨" : "❌ 없음 (수집 불가)"}`);
console.log(`  - DB URI: ${MONGODB_URI ? "✅ 로드됨" : "❌ 없음 (저장 불가)"}`);
console.log(`  - TWITCH: ${TWITCH_CLIENT_ID ? "✅ 로드됨" : "⚠️ 없음 (트렌드 0점 처리)"}`);
console.log(`  - CHZZK: ${CHZZK_CLIENT_ID ? "✅ 로드됨" : "⚠️ 없음 (트렌드 0점 처리)"}`);

if (!ITAD_API_KEY) {
    console.error("🚨 ITAD_API_KEY가 없습니다. 수집을 중단합니다.");
    process.exit(1);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 태그 매핑 (한글화)
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

// 게임 이름 정제
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
    if (!TWITCH_CLIENT_ID) return 0;
    if (!twitchToken) await getTwitchToken();
    if (!twitchToken) return 0;
    
    const searchName = cleanGameName(gameName);
    if (!searchName) return 0;

    try {
        // 1. 카테고리 검색
        const searchRes = await axios.get('https://api.twitch.tv/helix/search/categories', {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchToken}` },
            params: { query: searchName, first: 1 }
        });
        
        const foundGame = searchRes.data?.data?.[0];
        if (!foundGame) return 0;

        // 2. 시청자 수 조회
        const streamRes = await axios.get('https://api.twitch.tv/helix/streams', {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchToken}` },
            params: { game_id: foundGame.id, first: 100 }
        });
        
        const viewers = streamRes.data.data.reduce((acc, s) => acc + s.viewer_count, 0);
        return viewers;
    } catch (e) { return 0; }
}

// ★ 치지직 API 조회 (수정됨)
async function getChzzkStats(gameName) {
    if (!CHZZK_CLIENT_ID || !CHZZK_CLIENT_SECRET) return 0;
    
    const searchName = cleanGameName(gameName);
    if (!searchName) return 0; // 검색어 없으면 요청 안 함

    try {
        const res = await axios.get('https://openapi.chzzk.naver.com/open/v1/categories/search', {
            headers: { 
                'Client-Id': CHZZK_CLIENT_ID, 
                'Client-Secret': CHZZK_CLIENT_SECRET, 
                'Content-Type': 'application/json' 
            },
            params: { query: searchName, size: 1 }
        });
        
        // 학습한 JSON 구조: res.data.content.data[]
        const categories = res.data?.content?.data;

        // 카테고리가 존재하면 트렌드 점수 가산 (1000점)
        if (categories && categories.length > 0) {
            // console.log(`   ✅ 치지직 발견: ${categories[0].categoryValue}`);
            return 1000;
        }
        return 0;
    } catch (e) { 
        // 400, 401 등 에러 로그 출력 (디버깅용)
        // if (e.response) console.error(`⚠️ 치지직 에러 (${searchName}):`, e.response.status);
        return 0; 
    }
}

// ---------------------------------------------------------
// [B] ITAD 로직 (안정성 강화)
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

    // 수집 대상 게임 (Steam Top Chart + 예시 ID)
    const targetAppIds = [
        1623730, 578080, 570, 730, 1172470, 244210, 271590, 1086940, 1245620, 
        292030, 359550, 105600, 413150, 1966720, 230410, 252490, 221100, 440, 550, 945360
    ];
    console.log(`🎯 수집 대상: ${targetAppIds.length}개`);

    let successCount = 0;

    for (const appid of targetAppIds) {
      try {
        await sleep(1500); // Rate Limit 방지용 딜레이

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

        // ITAD 연동
        const itadData = await fetchITADData(appid);
        if (itadData) {
            if (!isFree && (itadData.current_price < priceInfo.current_price || priceInfo.current_price === 0)) {
                 priceInfo = { ...priceInfo, ...itadData };
            } else {
                 priceInfo.deals = itadData.deals;
                 priceInfo.historical_low = itadData.historical_low;
            }
        }

        // 3. 트렌드 점수 (Twitch + Chzzk)
        const cleanName = data.name;
        const [twitchView, chzzkScore] = await Promise.all([
            getTwitchStats(cleanName),
            getChzzkStats(cleanName)
        ]);
        const trendScore = twitchView + chzzkScore;

        // 4. 날짜 처리 (Invalid Date 방지)
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
            const hltbRes = await hltbService.search(cleanGameName(cleanName));
            if(hltbRes.length > 0) playTime = `${hltbRes[0].gameplayMain} 시간`;
        } catch(e){}

        // 7. DB 저장 객체
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
            chzzk_viewers: chzzkScore, // 여기엔 가산점이 들어감
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
        
        // 로그 출력
        const logMsg = `✅ [${successCount}] 저장: ${data.name} (Trend: ${trendScore} | Tw: ${twitchView} | Chzzk: ${chzzkScore > 0 ? 'O' : 'X'})`;
        console.log(logMsg);

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