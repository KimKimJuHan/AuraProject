// /backend/collector.js

require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('./models/Game');

// (스마트 태그 '번역 규칙' - 동일)
function translateSmartTags(itadTags, steamTags) {
  const smartTags = [];
  const allTags = [...(itadTags || []), ...(steamTags || [])];
  if (allTags.includes('Co-op') || allTags.includes('Online Co-Op')) smartTags.push('4인 협동');
  if (allTags.includes('RPG') || allTags.includes('Action RPG')) smartTags.push('RPG');
  if (allTags.includes('Open World')) smartTags.push('오픈월드');
  return [...new Set(smartTags)];
}

// 딜레이 (3초)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ★★★ '인기 게임' 수집 로직 (안정화 버전) ★★★
async function collectPopularGames() {
  const ITAD_API_KEY = process.env.ITAD_API_KEY;
  console.log('[시작] "Top Sellers" 데이터 수집...');

  let collectedCount = 0;
  const BATCH_SIZE = 10; // (10개만 테스트)

  try {
    // --- 1. ITAD에서 '가장 인기 있는' 게임 10개 목록 가져오기 ---
    const popularResponse = await axios.get('https://api.isthereanydeal.com/stats/most-popular/v1', {
      params: { key: ITAD_API_KEY, limit: BATCH_SIZE, offset: 0 }
    });
    const popularList = popularResponse.data;
    console.log(`[정보] 인기 게임 ${popularList.length}개를 찾았습니다.`);

    // --- 2. 10개 게임의 '실시간 가격' 정보 한 번에 가져오기 ---
    const itad_ids = popularList.map(game => game.id);
    const priceResponse = await axios.post(
      `https://api.isthereanydeal.com/games/prices/v3?key=${ITAD_API_KEY}&country=KR`,
      itad_ids
    );
    const priceMap = new Map(priceResponse.data.map(p => [p.id, p]));
    console.log(`[정보] ${priceMap.size}개의 가격 정보를 가져왔습니다.`);

    // --- 3. "인기 게임 10개"를 하나씩 돌면서 상세 정보 수집 ---
    for (const popularGame of popularList) {
      const itad_id = popularGame.id;

      try {
        // --- 3A. '게임 정보' (ITAD API) ---
        const infoResponse = await axios.get('https://api.isthereanydeal.com/games/info/v2', {
          params: { key: ITAD_API_KEY, id: itad_id }
        });
        const infoData = infoResponse.data;
        const steamAppId = infoData.appid;

        if (infoData.type !== 'game' || !steamAppId) {
          console.warn(`[경고] ${infoData.title} (Type: ${infoData.type})는 게임이 아니거나 AppID가 없어 건너뜁니다.`);
          continue;
        }

        // ★ [유지] 스팀 API 호출 전, 추가 딜레이 (서버 차단 방지)
        await delay(3000); // (3초 추가 대기)

        // --- 3B. 'PC 사양' (Steam API) ---
        const steamUrl = `https://store.steampowered.com/api/appdetails?appids=${steamAppId}&l=korean`;
        const steamResponse = await axios.get(steamUrl);

        if (!steamResponse.data[steamAppId] || !steamResponse.data[steamAppId].success) {
          console.warn(`[경고] ${infoData.title}의 Steam 데이터를 가져올 수 없습니다.`);
          continue;
        }
        const steamData = steamResponse.data[steamAppId].data;

        // --- 3C. '스마트 태그' 번역 ---
        const steamTags = steamData.categories ? steamData.categories.map(cat => cat.description) : [];
        const smartTags = translateSmartTags(infoData.tags, steamTags);

        // --- 3D. '가격 정보' (방어 코드 적용) ---
        const priceData = priceMap.get(itad_id);
        let priceInfo = { current_price: 0, regular_price: 0, discount_percent: 0, store_url: '#', historical_low: 0, expiry: null, isFree: false };

        if (steamData.is_free === true) {
          priceInfo.isFree = true;
          priceInfo.store_url = `https://store.steampowered.com/app/${steamAppId}`;
        }
        else if (priceData) {
          const bestDeal = (priceData.deals && priceData.deals.length > 0) ? priceData.deals[0] : null;
          const historicalLow = (priceData.historyLow && priceData.historyLow.all) ? priceData.historyLow.all.amountInt : 0;

          if (bestDeal && bestDeal.cut > 0) { // (A) 할인 중
            priceInfo = {
              current_price: bestDeal.price.amountInt,
              regular_price: bestDeal.regular.amountInt,
              discount_percent: bestDeal.cut,
              store_url: bestDeal.url,
              historical_low: historicalLow,
              expiry: bestDeal.expiry,
              isFree: false
            };
          } else if (priceData.deals && priceData.deals.length > 0) { // (B) 정가
            const regularPriceDeal = priceData.deals[0];
            priceInfo = {
              current_price: regularPriceDeal.regular.amountInt,
              regular_price: regularPriceDeal.regular.amountInt,
              discount_percent: 0,
              store_url: regularPriceDeal.url,
              historical_low: historicalLow,
              expiry: null,
              isFree: false
            };
          }
        }

        // --- 3E. 'PC 사양' (방어 코드) ---
        let pcReq = { minimum: "정보 없음", recommended: "정보 없음" };
        if (steamData.pc_requirements && !Array.isArray(steamData.pc_requirements)) {
          pcReq = {
            minimum: steamData.pc_requirements.minimum || "정보 없음",
            recommended: steamData.pc_requirements.recommended || "정보 없음"
          };
        }

        // --- 3F. DB에 저장할 데이터 조합 ---
        const gameDataToSave = {
          slug: itad_id,
          title: infoData.title,
          steam_appid: steamAppId,
          main_image: infoData.assets.banner600 || steamData.header_image,
          description: steamData.short_description || "설명 없음",
          smart_tags: smartTags,
          pc_requirements: pcReq,
          popularity: infoData.stats.waitlisted || 0,
          price_info: priceInfo,
          releaseDate: new Date(infoData.releaseDate)
        };

        // --- 3G. MongoDB에 저장 ---
        await Game.updateOne({ slug: itad_id }, gameDataToSave, { upsert: true });
        console.log(`[성공] ${infoData.title} DB 저장/업데이트 완료`);
        collectedCount++;

      } catch (err) {
        console.error(`[실패] ${itad_id} 처리 중 개별 에러:`, err.message);
      }
    }
  } catch (error) {
    console.error(`[치명적 실패] '인기' 또는 '가격' API 호출 실패:`, error.message);
  }
  console.log(`[결과] 총 ${collectedCount}개의 게임을 DB에 저장했습니다.`);
}

// --- 메인 실행부 ---
async function runCollector() {
  // ★ [수정] MONGODB_URI 환경 변수를 사용하도록 변경
  const dbUri = process.env.MONGODB_URI;
  if (!dbUri) {
    console.error("오류: MONGODB_URI 환경 변수가 설정되지 않았습니다.");
    return;
  }

  await mongoose.connect(dbUri);
  console.log("✅ (수집기) 몽고DB 연결 성공");

  await collectPopularGames();

  console.log("--- 메인 페이지 데이터 수집 완료 ---");
  await mongoose.disconnect();
}
runCollector();