// /backend/collector.js

require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('./models/Game'); 
const hltb = require('howlongtobeat');
const hltbService = new hltb.HowLongToBeatService();

// 태그 번역 함수
function translateSmartTags(itadTags, steamTags) {
  const smartTags = [];
  const allTags = [...(itadTags || []), ...(steamTags || [])];
  if (allTags.includes('Co-op') || allTags.includes('Online Co-Op')) smartTags.push('4인 협동');
  if (allTags.includes('RPG') || allTags.includes('Action RPG')) smartTags.push('RPG');
  if (allTags.includes('Open World')) smartTags.push('오픈월드');
  // ... (기존 매핑 로직 유지, 필요시 추가) ...
  return [...new Set(smartTags)];
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function collectGamesData() {
  const ITAD_API_KEY = process.env.ITAD_API_KEY;

  // ★ [진단 1] API 키 로드 확인
  if (!ITAD_API_KEY) {
    console.error("❌ [치명적 오류] .env 파일에서 ITAD_API_KEY를 찾을 수 없습니다!");
    console.error("   -> .env 파일의 위치와 내용을 확인해주세요.");
    return;
  } else {
    console.log(`✅ API 키 로드 확인: ${ITAD_API_KEY.substring(0, 4)}...`);
  }

  console.log('[시작] 데이터 수집 시작 (안전 모드)...');

  let collectedCount = 0;
  const POPULAR_LIMIT = 120; 
  const DEALS_LIMIT = 30;

  // ID를 담을 Set (중복 방지)
  const allGameIds = new Set();

  // --- 1. 게임 ID 수집 단계 (개별 try-catch 적용) ---
  
  // 1-A. 인기 게임 수집
  try {
    console.log("   >> 인기 게임 목록 요청 중...");
    const popularResponse = await axios.get('https://api.isthereanydeal.com/stats/most-popular/v1', {
      params: { key: ITAD_API_KEY, limit: POPULAR_LIMIT, offset: 0 }
    });
    if (popularResponse.data) {
        popularResponse.data.forEach(game => allGameIds.add(game.id));
        console.log(`   ✅ 인기 게임 ${popularResponse.data.length}개 확보`);
    }
  } catch (err) {
    console.error(`   ⚠️ 인기 게임 목록 수집 실패 (건너뜀): ${err.message}`);
  }

  // 1-B. 할인 게임 수집
  try {
    console.log("   >> 할인 게임 목록 요청 중...");
    const dealsResponse = await axios.get('https://api.isthereanydeal.com/deals/v2', {
      params: { key: ITAD_API_KEY, limit: DEALS_LIMIT, sort: '-cut' } 
    });
    if (dealsResponse.data && dealsResponse.data.list) {
        dealsResponse.data.list.forEach(deal => allGameIds.add(deal.id));
        console.log(`   ✅ 할인 게임 ${dealsResponse.data.list.length}개 확보`);
    }
  } catch (err) {
    console.error(`   ⚠️ 할인 게임 목록 수집 실패 (건너뜀): ${err.message}`);
  }

  // ID 수집 결과 확인
  const targetIds = Array.from(allGameIds);
  if (targetIds.length === 0) {
      console.error("❌ [중단] 수집된 게임 ID가 하나도 없습니다. API 상태를 확인하세요.");
      return;
  }
  console.log(`[정보] 총 ${targetIds.length}개의 고유 게임 ID 수집 완료. 상세 정보 수집 시작...`);


  // --- 2. 가격 정보 조회 ---
  let priceMap = new Map();
  try {
    const priceResponse = await axios.post(
      `https://api.isthereanydeal.com/games/prices/v3?key=${ITAD_API_KEY}&country=KR`,
      targetIds 
    );
    priceMap = new Map(priceResponse.data.map(p => [p.id, p]));
    console.log(`[정보] ${priceMap.size}개의 가격 정보를 가져왔습니다.`);
  } catch (err) {
    console.error(`⚠️ 가격 정보 일괄 조회 실패 (가격 정보 없이 진행): ${err.message}`);
  }


  // --- 3. 상세 정보 수집 (메인 루프) ---
  for (const itad_id of targetIds) {
    try {
      // 3A. ITAD 기본 정보
      const infoResponse = await axios.get('https://api.isthereanydeal.com/games/info/v2', {
        params: { key: ITAD_API_KEY, id: itad_id }
      });
      const infoData = infoResponse.data;
      const steamAppId = infoData.appid;
      
      if (!steamAppId) continue; 

      await delay(3000); // Steam API 3초 대기

      // 3B. Steam API (한국 가격)
      const steamUrl = `https://store.steampowered.com/api/appdetails?appids=${steamAppId}&l=korean&cc=kr`;
      const steamResponse = await axios.get(steamUrl);
      
      if (!steamResponse.data[steamAppId] || !steamResponse.data[steamAppId].success) continue;
      const steamData = steamResponse.data[steamAppId].data;

      const steamTags = steamData.categories ? steamData.categories.map(cat => cat.description) : [];
      const smartTags = translateSmartTags(infoData.tags, steamTags);

      // 3C. 가격 정보 로직
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
          const historicalLow = (priceData.historyLow && priceData.historyLow.all) ? priceData.historyLow.all.amountInt : null;
          
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

      // 미디어
      const screenshots = steamData.screenshots ? steamData.screenshots.map(s => s.path_full) : [];
      const trailers = steamData.movies ? steamData.movies
          .filter(m => m.webm && (m.webm['1080'] || m.webm.max)) 
          .map(m => m.webm['1080'] || m.webm.max) : [];

      // HLTB
      let playTime = "정보 없음";
      try {
          const cleanTitle = infoData.title.replace(/[^a-zA-Z0-9 ]/g, ""); 
          const hltbResults = await hltbService.search(cleanTitle);
          const bestMatch = hltbResults.find(h => h.similarity > 0.6); 
          if (bestMatch) playTime = `${bestMatch.gameplayMain} 시간`;
      } catch (hltbErr) {
          // console.log(`[정보] HLTB 실패: ${infoData.title}`);
      }

      const metacriticScore = steamData.metacritic ? steamData.metacritic.score : 0;
      // ★ [신규] 한글 제목 우선, 없으면 영어 제목
      const titleKo = steamData.name || infoData.title;

      const gameDataToSave = {
        slug: itad_id, 
        title: infoData.title,
        title_ko: titleKo, // DB에 한글 제목 저장
        steam_appid: steamAppId,
        main_image: infoData.assets.banner600 || steamData.header_image, 
        description: steamData.short_description || "설명 없음",
        smart_tags: smartTags,
        pc_requirements: {
            minimum: steamData.pc_requirements?.minimum || "정보 없음",
            recommended: steamData.pc_requirements?.recommended || "권장 사양 정보 없음"
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
      console.log(`[성공] ${titleKo}`);
      collectedCount++;

    } catch (err) {
      const status = err.response ? err.response.status : "Unknown";
      if (status !== 404 && status !== 429) console.error(`[실패] ${itad_id}: ${err.message}`);
    }
  }
  
  console.log(`[결과] 총 ${collectedCount}개의 게임을 DB에 저장했습니다.`);
}

async function runCollector() {
  const dbUri = process.env.MONGODB_URI;
  if (!dbUri) {
      console.error("❌ 오류: MONGODB_URI 환경 변수가 설정되지 않았습니다.");
      return;
  }
  
  await mongoose.connect(dbUri); 
  console.log("✅ (수집기) 몽고DB 연결 성공");
  await collectGamesData();
  console.log("--- 완료 ---");
  await mongoose.disconnect();
}
runCollector();