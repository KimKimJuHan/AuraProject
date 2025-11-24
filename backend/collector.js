require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('./models/Game'); 
const hltb = require('howlongtobeat');
const hltbService = new hltb.HowLongToBeatService();

// ---------------------------------------------------------
// 1. API 설정 및 유틸
// ---------------------------------------------------------

// 랜덤 딜레이
const randomDelay = (min, max) => new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1) + min)));

// 배열 쪼개기
function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) result.push(array.slice(i, i + size));
  return result;
}

// 태그 매핑
const TAG_MAP = {
  'rpg': 'RPG', 'role-playing': 'RPG', 'action': '액션',
  'fps': 'FPS', 'shooter': 'FPS', 'first-person shooter': 'FPS',
  'simulation': '시뮬레이션', 'sim': '시뮬레이션',
  'strategy': '전략', 'rts': '전략', 'grand strategy': '전략',
  'sports': '스포츠', 'racing': '레이싱', 'puzzle': '퍼즐',
  'survival': '생존', 'survival horror': '생존',
  'horror': '공포', 'psychological horror': '공포',
  'rhythm': '리듬', 'music': '리듬', 'adventure': '어드벤처',
  'first-person': '1인칭', 'third-person': '3인칭', 'isometric': '쿼터뷰',
  'pixel graphics': '픽셀 그래픽', 'pixel art': '픽셀 그래픽',
  '2d': '2D', '3d': '3D', 'anime': '만화 같은', 'cartoon': '만화 같은',
  'realistic': '현실적', 'photorealistic': '현실적', 'cute': '귀여운',
  'fantasy': '판타지', 'sci-fi': '공상과학', 'cyberpunk': '사이버펑크',
  'medieval': '중세', 'modern': '현대', 'space': '우주',
  'zombies': '좀비', 'post-apocalyptic': '포스트아포칼립스',
  'open world': '오픈월드', 'open-world': '오픈월드',
  'co-op': '4인 협동', 'online co-op': '4인 협동',
  'multiplayer': '멀티플레이어', 'singleplayer': '싱글플레이어',
  'pvp': '경쟁/PvP', 'souls-like': '소울라이크', 'story rich': '스토리 중심'
};

function translateSmartTags(itadTags, steamTags) {
  const rawTags = [...(itadTags || []), ...(steamTags || [])].map(t => t.toLowerCase());
  const myTags = new Set();
  rawTags.forEach(tag => { if (TAG_MAP[tag]) myTags.add(TAG_MAP[tag]); });
  if (myTags.has('FPS')) myTags.add('1인칭');
  return Array.from(myTags);
}

// ---------------------------------------------------------
// 2. Twitch API (Official)
// ---------------------------------------------------------
let twitchAccessToken = null;

// 토큰 발급 (Client Credentials Flow) 
async function getTwitchToken() {
  try {
    const res = await axios.post('https://id.twitch.tv/oauth2/token', null, {
      params: {
        client_id: process.env.TWITCH_CLIENT_ID,
        client_secret: process.env.TWITCH_CLIENT_SECRET,
        grant_type: 'client_credentials'
      }
    });
    twitchAccessToken = res.data.access_token;
    console.log('✅ Twitch Token 발급 완료');
  } catch (e) {
    console.error('❌ Twitch Token 발급 실패:', e.message);
  }
}

// 게임 시청자 수 조회
async function getTwitchStats(gameName) {
  if (!twitchAccessToken) await getTwitchToken();
  if (!twitchAccessToken) return 0;

  try {
    // 1. 게임 ID 검색
    const gameRes = await axios.get('https://api.twitch.tv/helix/games', {
      headers: {
        'Authorization': `Bearer ${twitchAccessToken}`, // 
        'Client-Id': process.env.TWITCH_CLIENT_ID       // 
      },
      params: { name: gameName }
    });

    const gameData = gameRes.data.data[0];
    if (!gameData) return 0;

    // 2. 해당 게임의 스트림 조회 (시청자 수 합산)
    const streamRes = await axios.get('https://api.twitch.tv/helix/streams', {
      headers: {
        'Authorization': `Bearer ${twitchAccessToken}`,
        'Client-Id': process.env.TWITCH_CLIENT_ID
      },
      params: { game_id: gameData.id, first: 100 }
    });

    const totalViewers = streamRes.data.data.reduce((acc, stream) => acc + stream.viewer_count, 0);
    return totalViewers;
  } catch (e) {
    // console.error(`Twitch Error (${gameName}):`, e.message);
    return 0;
  }
}

// ---------------------------------------------------------
// 3. Chzzk API (Official Open API)
// ---------------------------------------------------------
async function getChzzkStats(gameName) {
  const CHZZK_CLIENT_ID = process.env.CHZZK_CLIENT_ID;
  const CHZZK_CLIENT_SECRET = process.env.CHZZK_CLIENT_SECRET;

  if (!CHZZK_CLIENT_ID || !CHZZK_CLIENT_SECRET) return 0;

  try {
    // 카테고리 검색 API 사용 
    const url = 'https://openapi.chzzk.naver.com/open/v1/categories/search'; // 
    
    const res = await axios.get(url, {
      headers: {
        'Client-Id': CHZZK_CLIENT_ID,         // 
        'Client-Secret': CHZZK_CLIENT_SECRET, // 
        'Content-Type': 'application/json'    // 
      },
      params: {
        query: gameName,
        size: 1 // 가장 정확한 1개만 확인
      }
    });

    // 공식 API에서는 카테고리 정보만 제공하고 실시간 시청자 수를 바로 주는 엔드포인트가 제한적일 수 있음.
    // 카테고리가 존재하면(인기 게임이면) 가산점을 주는 방식으로 트렌드 점수에 반영하거나,
    // 라이브 조회 API 권한이 있다면 /open/v1/lives 등을 추가로 호출해야 함.
    // 여기서는 카테고리가 검색되면 기본 점수(트렌드 반영)를 부여하는 로직으로 처리.
    
    const category = res.data.content?.data?.[0]; //  응답 구조 참조
    if (category) {
        // 카테고리 ID가 존재하면 해당 게임이 치지직에 등록되어 있다는 뜻
        // (실시간 시청자 수는 별도 라이브 API가 필요하므로, 여기서는 존재 여부로 가중치 부여)
        return 1000; // 임의의 트렌드 점수 부여
    }
    return 0;

  } catch (e) {
    // console.error(`Chzzk Error (${gameName}):`, e.message);
    return 0;
  }
}

// ---------------------------------------------------------
// 4. 메인 수집 로직
// ---------------------------------------------------------
async function collectGamesData() {
  const ITAD_API_KEY = process.env.ITAD_API_KEY;
  if (!ITAD_API_KEY) {
    console.error("❌ [오류] ITAD_API_KEY가 없습니다.");
    return;
  }
  console.log(`✅ API Key 로드됨: ${ITAD_API_KEY.substring(0, 4)}...`);
  
  // Twitch 토큰 미리 발급
  await getTwitchToken();

  console.log('[시작] 데이터 수집 시작 (Official API 적용)...');

  let collectedIds = new Set();
  let collectedCount = 0;
  const TARGET_GAME_COUNT = 150; 
  const API_BATCH_LIMIT = 50; 

  try {
    // --- 1. ID 수집 ---
    console.log(`[1단계] ID 수집 중...`);
    let offset = 0;
    while (collectedIds.size < TARGET_GAME_COUNT) {
      try {
        const response = await axios.get('https://api.isthereanydeal.com/stats/most-popular/v1', {
          params: { key: ITAD_API_KEY, limit: API_BATCH_LIMIT, offset: offset }
        });
        const batch = response.data;
        if (!batch || batch.length === 0) break;
        batch.forEach(game => collectedIds.add(game.id));
        console.log(`   >> 인기 게임 누적: ${collectedIds.size}개`);
        offset += API_BATCH_LIMIT;
        await randomDelay(1000, 2000);
      } catch (err) {
        console.error(`   ⚠️ ID 수집 에러:`, err.message);
        break; 
      }
    }

    // 할인 게임 추가
    try {
        const dealsResponse = await axios.get('https://api.isthereanydeal.com/deals/v2', {
          params: { key: ITAD_API_KEY, limit: 30, sort: '-cut' } 
        });
        if (dealsResponse.data && dealsResponse.data.list) {
            dealsResponse.data.list.forEach(deal => collectedIds.add(deal.id));
            console.log(`   >> 할인 게임 추가 완료 (총: ${collectedIds.size}개)`);
        }
    } catch (err) { console.error("   ⚠️ 할인 목록 수집 실패 (무시)"); }

    const allGameIds = Array.from(collectedIds);
    if (allGameIds.length === 0) return console.log("❌ 수집된 ID 없음");

    // --- 2. 가격 정보 조회 ---
    console.log(`[2단계] 가격 정보 조회...`);
    const priceMap = new Map();
    const idChunks = chunkArray(allGameIds, API_BATCH_LIMIT);

    for (const chunk of idChunks) {
        try {
            const priceResponse = await axios.post(
                `https://api.isthereanydeal.com/games/prices/v3?key=${ITAD_API_KEY}&country=KR`,
                chunk
            );
            priceResponse.data.forEach(p => priceMap.set(p.id, p));
            console.log(`   >> 가격 데이터 ${chunk.length}개 확보`);
            await randomDelay(1000, 2000);
        } catch (err) { console.error(`   ⚠️ 가격 조회 실패 (Steam 폴백 예정)`); }
    }

    // --- 3. 상세 수집 및 트렌드 반영 ---
    console.log(`[3단계] 상세 정보 및 트렌드 수집...`);
    for (const itad_id of allGameIds) {
      try {
        const infoResponse = await axios.get('https://api.isthereanydeal.com/games/info/v2', {
          params: { key: ITAD_API_KEY, id: itad_id }
        });
        const infoData = infoResponse.data;
        const steamAppId = infoData.appid;
        
        if (!steamAppId || infoData.type !== 'game') continue; 

        await randomDelay(2000, 3500); 
        
        // Steam API
        const steamUrl = `https://store.steampowered.com/api/appdetails?appids=${steamAppId}&l=korean&cc=kr`;
        let steamData = null;
        try {
            const steamRes = await axios.get(steamUrl);
            if (steamRes.data[steamAppId]?.success) steamData = steamRes.data[steamAppId].data;
        } catch (e) { }

        if (!steamData) continue; 

        // 태그 처리
        const steamRawTags = [];
        if (steamData.categories) steamRawTags.push(...steamData.categories.map(c => c.description));
        if (steamData.genres) steamRawTags.push(...steamData.genres.map(g => g.description));
        const smartTags = translateSmartTags(infoData.tags, steamRawTags);

        // ★ [신규] 트렌드 데이터 수집 (공식 API 사용)
        const gameTitle = infoData.title; // 정제된 제목 사용
        const [twitchViewers, chzzkScore] = await Promise.all([
            getTwitchStats(gameTitle),
            getChzzkStats(gameTitle)
        ]);

        // 트렌드 점수 계산 (트위치 시청자 + 치지직 가중치)
        const trendScore = twitchViewers + chzzkScore;

        // 가격 정보 구성
        const priceData = priceMap.get(itad_id);
        const steamStoreUrl = `https://store.steampowered.com/app/${steamAppId}`;
        
        const steamRegular = steamData.price_overview ? steamData.price_overview.initial / 100 : null;
        const steamCurrent = steamData.price_overview ? steamData.price_overview.final / 100 : null;
        const clean = (p) => Math.round(p / 10) * 10;

        let priceInfo = { 
          regular_price: 0, current_price: 0, discount_percent: 0, 
          store_url: steamStoreUrl, store_name: 'Steam', 
          historical_low: null, expiry: null, isFree: false, deals: [] 
        };

        if (steamData.is_free === true) { 
            priceInfo.isFree = true;
        } 
        else if (priceData && priceData.deals && priceData.deals.length > 0) { 
            const bestDeal = priceData.deals[0];
            const historicalLow = (priceData.historyLow?.all?.amountInt) || null;

            priceInfo.regular_price = steamRegular || clean(bestDeal.regular.amountInt);
            priceInfo.current_price = clean(bestDeal.price.amountInt);
            priceInfo.discount_percent = bestDeal.cut;
            priceInfo.store_url = bestDeal.url;
            priceInfo.store_name = bestDeal.shop.name;
            priceInfo.historical_low = historicalLow ? clean(historicalLow) : null;
            priceInfo.expiry = bestDeal.expiry;
            
            priceInfo.deals = priceData.deals.map(deal => ({
                shopName: deal.shop.name,
                price: clean(deal.price.amountInt),
                regularPrice: steamRegular || clean(deal.regular.amountInt),
                discount: deal.cut,
                url: deal.url
            }));
        }
        else if (steamData.price_overview) {
            priceInfo.current_price = steamCurrent;
            priceInfo.regular_price = steamRegular;
            priceInfo.discount_percent = steamData.price_overview.discount_percent;
            priceInfo.store_url = steamStoreUrl;
            priceInfo.store_name = 'Steam';
            priceInfo.deals = [{ shopName: 'Steam', price: steamCurrent, regularPrice: steamRegular, discount: steamData.price_overview.discount_percent, url: steamStoreUrl }];
        }

        // HLTB
        let playTime = "정보 없음";
        try {
            const cleanTitle = infoData.title.replace(/[^a-zA-Z0-9 ]/g, ""); 
            const hltbResults = await hltbService.search(cleanTitle);
            const bestMatch = hltbResults.find(h => h.similarity > 0.6); 
            if (bestMatch) playTime = `${bestMatch.gameplayMain} 시간`;
        } catch (e) {}

        const gameDataToSave = {
          slug: itad_id, 
          title: infoData.title,
          title_ko: steamData.name || infoData.title,
          steam_appid: steamAppId,
          main_image: infoData.assets.banner600 || steamData.header_image, 
          description: steamData.short_description || "설명 없음",
          smart_tags: smartTags,
          
          // ★ 저장되는 트렌드 데이터
          trend_score: trendScore,
          twitch_viewers: twitchViewers,
          chzzk_viewers: chzzkScore,

          pc_requirements: {
             minimum: steamData.pc_requirements?.minimum || "정보 없음",
             recommended: steamData.pc_requirements?.recommended || "권장 사양 정보 없음"
          },
          popularity: (infoData.stats.waitlisted || 0) + (infoData.stats.collected || 0),
          price_info: priceInfo, 
          releaseDate: new Date(infoData.releaseDate),
          screenshots: steamData.screenshots?.map(s => s.path_full) || [],
          trailers: steamData.movies?.filter(m => m.webm?.['1080'] || m.webm?.max).map(m => m.webm['1080'] || m.webm.max) || [],
          play_time: playTime,
          metacritic_score: steamData.metacritic?.score || 0
        };

        await Game.updateOne({ slug: itad_id }, gameDataToSave, { upsert: true });
        collectedCount++;
        console.log(`[${collectedCount}] 저장: ${gameDataToSave.title_ko} (트렌드 점수: ${trendScore})`);

      } catch (err) {
        console.error(`   ⚠️ 개별 실패 (${itad_id}): ${err.message}`);
      }
    }
  } catch (error) {
    console.error(`❌ 치명적 실패:`, error.message);
  }
  console.log(`✅ [완료] 총 ${collectedCount}개의 게임 데이터 저장 완료.`);
}

async function runCollector() {
  const dbUri = process.env.MONGODB_URI;
  if (!dbUri) return console.error("❌ 오류: MONGODB_URI 환경 변수 없음");
  await mongoose.connect(dbUri); 
  console.log("✅ (수집기) 몽고DB 연결 성공");
  await collectGamesData();
  console.log("--- 완료 ---");
  await mongoose.disconnect();
}
runCollector();