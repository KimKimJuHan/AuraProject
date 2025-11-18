require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('./models/Game'); 
const hltb = require('howlongtobeat');
const hltbService = new hltb.HowLongToBeatService();

// 태그 매핑 사전
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

const randomDelay = (min, max) => new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1) + min)));

function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) result.push(array.slice(i, i + size));
  return result;
}

async function collectGamesData() {
  // ★ [원복] 다시 Secrets(환경변수)를 사용하도록 수정
  const ITAD_API_KEY = process.env.ITAD_API_KEY;

  // 키 로드 확인 (보안을 위해 앞 4자리만 출력)
  if (!ITAD_API_KEY) {
    console.error("❌ [오류] ITAD_API_KEY 환경 변수가 없습니다. GitHub Secrets 설정을 확인하세요.");
    return;
  }
  console.log(`✅ API Key 로드됨: ${ITAD_API_KEY.substring(0, 4)}...`);
  console.log('[시작] 데이터 수집 시작 (Secrets 사용 / 안정성 강화 v4.4)...');

  let collectedIds = new Set();
  let processedCount = 0;
  const TARGET_GAME_COUNT = 500; 
  const API_BATCH_LIMIT = 100; // ★ [수정] 요청 단위를 100개로 줄여서 500 에러 방지

  try {
    // 1. ID 수집
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
        console.log(`   >> 인기 게임 누적: ${collectedIds.size}`);
        offset += API_BATCH_LIMIT;
        await randomDelay(2000, 3000); // 딜레이 증가
      } catch (err) {
        console.error(`   ⚠️ ID 수집 부분 실패 (Status: ${err.response?.status}):`, err.message);
        break; 
      }
    }

    // 할인 게임 추가
    try {
        const dealsResponse = await axios.get('https://api.isthereanydeal.com/deals/v2', {
          params: { key: ITAD_API_KEY, limit: 30, sort: '-cut' } 
        });
        dealsResponse.data.list.forEach(deal => collectedIds.add(deal.id));
        console.log(`   >> 할인 게임 추가 완료 (총: ${collectedIds.size})`);
    } catch (err) { console.error("   ⚠️ 할인 목록 수집 실패:", err.message); }

    const allGameIds = Array.from(collectedIds);

    // 2. 가격 정보 조회 (청크 단위 실행)
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
            await randomDelay(2000, 3000); 
        } catch (err) {
            console.error(`   ⚠️ 가격 조회 실패 (Steam 가격 폴백 예정):`, err.message);
        }
    }

    // 3. 상세 수집
    console.log(`[3단계] 상세 정보 및 DB 저장...`);
    for (const itad_id of allGameIds) {
      try {
        const infoResponse = await axios.get('https://api.isthereanydeal.com/games/info/v2', {
          params: { key: ITAD_API_KEY, id: itad_id }
        });
        const infoData = infoResponse.data;
        const steamAppId = infoData.appid;
        
        if (!steamAppId || infoData.type !== 'game') continue; 

        await randomDelay(3000, 4500); 
        
        // Steam API
        const steamUrl = `https://store.steampowered.com/api/appdetails?appids=${steamAppId}&l=korean&cc=kr`;
        let steamData = null;
        try {
            const steamRes = await axios.get(steamUrl);
            if (steamRes.data[steamAppId]?.success) steamData = steamRes.data[steamAppId].data;
        } catch (e) { }

        if (!steamData) continue; 

        const steamRawTags = [];
        if (steamData.categories) steamRawTags.push(...steamData.categories.map(c => c.description));
        if (steamData.genres) steamRawTags.push(...steamData.genres.map(g => g.description));
        const smartTags = translateSmartTags(infoData.tags, steamRawTags);

        // 가격 정보
        const priceData = priceMap.get(itad_id);
        const steamStoreUrl = `https://store.steampowered.com/app/${steamAppId}`;
        
        let priceInfo = { 
          regular_price: null, current_price: null, discount_percent: 0, 
          store_url: steamStoreUrl, store_name: 'Steam', 
          historical_low: null, expiry: null, isFree: false, deals: [] 
        };

        if (steamData.is_free === true) { 
            priceInfo = { ...priceInfo, regular_price: 0, current_price: 0, isFree: true, historical_low: 0 };
        } 
        else if (priceData && priceData.deals && priceData.deals.length > 0) { 
            const bestDeal = priceData.deals[0];
            const historicalLow = (priceData.historyLow?.all?.amountInt) || null;
            
            priceInfo.current_price = bestDeal.price.amountInt;
            priceInfo.regular_price = bestDeal.regular.amountInt;
            priceInfo.discount_percent = bestDeal.cut;
            priceInfo.store_url = bestDeal.url;
            priceInfo.store_name = bestDeal.shop.name;
            priceInfo.historical_low = historicalLow;
            priceInfo.expiry = bestDeal.expiry;
            
            priceInfo.deals = priceData.deals.map(deal => ({
                shopName: deal.shop.name,
                price: deal.price.amountInt,
                regularPrice: deal.regular.amountInt,
                discount: deal.cut,
                url: deal.url
            }));
        }
        else if (steamData.price_overview) {
            priceInfo.current_price = steamData.price_overview.final / 100;
            priceInfo.regular_price = steamData.price_overview.initial / 100;
            priceInfo.discount_percent = steamData.price_overview.discount_percent;
            priceInfo.store_url = steamStoreUrl;
            priceInfo.store_name = 'Steam';
            priceInfo.deals = [{ shopName: 'Steam', price: steamData.price_overview.final/100, regularPrice: steamData.price_overview.initial/100, discount: steamData.price_overview.discount_percent, url: steamStoreUrl }];
        }

        const screenshots = steamData.screenshots?.map(s => s.path_full) || [];
        const trailers = steamData.movies?.filter(m => m.webm?.['1080'] || m.webm?.max).map(m => m.webm['1080'] || m.webm.max) || [];

        let playTime = "정보 없음";
        try {
            const cleanTitle = infoData.title.replace(/[^a-zA-Z0-9 ]/g, ""); 
            const hltbResults = await hltbService.search(cleanTitle);
            const bestMatch = hltbResults.find(h => h.similarity > 0.6); 
            if (bestMatch) playTime = `${bestMatch.gameplayMain} 시간`;
        } catch (e) {}

        const metacriticScore = steamData.metacritic?.score || 0;
        const titleKo = steamData.name || infoData.title;
        
        let recSpecs = steamData.pc_requirements?.recommended || "권장 사양 정보 없음";
        if (recSpecs.length < 10) recSpecs = "권장 사양 정보 없음";

        const gameDataToSave = {
          slug: itad_id, 
          title: infoData.title,
          title_ko: titleKo,
          steam_appid: steamAppId,
          main_image: infoData.assets.banner600 || steamData.header_image, 
          description: steamData.short_description || "설명 없음",
          smart_tags: smartTags,
          pc_requirements: {
             minimum: steamData.pc_requirements?.minimum || "정보 없음",
             recommended: recSpecs
          },
          popularity: (infoData.stats.waitlisted || 0) + (infoData.stats.collected || 0),
          price_info: priceInfo, 
          releaseDate: new Date(infoData.releaseDate),
          screenshots: screenshots,
          trailers: trailers,
          play_time: playTime,
          metacritic_score: metacriticScore
        };

        await Game.updateOne({ slug: itad_id }, gameDataToSave, { upsert: true });
        processedCount++;
        console.log(`[${processedCount}/${allGameIds.length}] 저장: ${titleKo}`);

      } catch (err) {
        console.error(`   ⚠️ 개별 실패 (${itad_id}): ${err.message}`);
      }
    }
  } catch (error) {
    console.error(`❌ 치명적 실패:`, error.message);
  }
  console.log(`✅ [완료] 총 ${processedCount}개의 게임 데이터 저장 완료.`);
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