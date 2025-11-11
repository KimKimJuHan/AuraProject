// /backend/collector.js

require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('./models/Game'); 

// (스마트 태그 '번역 규칙')
function translateSmartTags(itadTags, steamTags) {
  const smartTags = [];
  const allTags = [...(itadTags || []), ...(steamTags || [])];
  if (allTags.includes('Co-op') || allTags.includes('Online Co-Op')) smartTags.push('4인 협동');
  if (allTags.includes('RPG') || allTags.includes('Action RPG')) smartTags.push('RPG');
  if (allTags.includes('Open World')) smartTags.push('오픈월드');
  return [...new Set(smartTags)];
}

// 딜레이 (Steam API용 3초)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ★★★ '탭별 데이터' 수집 로직 (v3) ★★★
async function collectGamesData() {
  const ITAD_API_KEY = process.env.ITAD_API_KEY;
  console.log('[시작] 탭별 데이터 수집 시작...');

  let collectedCount = 0;
  // ★ [수정] 탭별 데이터 수집 (API 200개 제한 준수)
  const POPULAR_LIMIT = 120; // '인기' 탭용 120개
  const DEALS_LIMIT = 30; // '할인' 탭용 30개

  try {
    // --- 1A. '인기' 게임 목록 가져오기 (120개) ---
    const popularResponse = await axios.get('https://api.isthereanydeal.com/stats/most-popular/v1', {
      params: { key: ITAD_API_KEY, limit: POPULAR_LIMIT, offset: 0 }
    });
    const popularIds = popularResponse.data.map(game => game.id);
    console.log(`[정보] '인기' 게임 ${popularIds.length}개 ID 수집`);

    // --- 1B. '할인' 게임 목록 가져오기 (30개) ---
    const dealsResponse = await axios.get('https://api.isthereanydeal.com/deals/v2', {
      params: { key: ITAD_API_KEY, limit: DEALS_LIMIT, sort: '-cut' } // 할인율(-cut) 기준
    });
    const dealIds = dealsResponse.data.list.map(deal => deal.id);
    console.log(`[정보] '할인' 게임 ${dealIds.length}개 ID 수집`);

    // --- 1C. 두 목록을 합치고 중복 제거 (총 150개 미만) ---
    const allGameIds = [...new Set([...popularIds, ...dealIds])];
    console.log(`[정보] 중복 제거 후 총 ${allGameIds.length}개의 고유 게임 수집`);

    // --- 2. '가격' 정보 한 번에 가져오기 (API 200개 제한 OK) ---
    const priceResponse = await axios.post(
      `https://api.isthereanydeal.com/games/prices/v3?key=${ITAD_API_KEY}&country=KR`,
      allGameIds 
    );
    const priceMap = new Map(priceResponse.data.map(p => [p.id, p]));
    console.log(`[정보] ${priceMap.size}개의 가격 정보를 가져왔습니다.`);

    // --- 3. 고유 ID 목록(allGameIds)을 순회하며 상세 정보 수집 ---
    for (const itad_id of allGameIds) {
      try {
        // --- 3A. '게임 정보' (ITAD API) ---
        const infoResponse = await axios.get('https://api.isthereanydeal.com/games/info/v2', {
          params: { key: ITAD_API_KEY, id: itad_id }
        });
        const infoData = infoResponse.data;
        const steamAppId = infoData.appid;
        
        if (infoData.type !== 'game' || !steamAppId) { 
          console.warn(`[경고] ${infoData.title || itad_id} (Type: ${infoData.type})는 게임이 아니거나 AppID가 없어 건너뜁니다.`);
          continue; 
        }

        // --- ★ [신규] 3B. '리뷰 점수' (ITAD Internal API) ---
        let reviewScore = 0;
        let reviewPlatform = 'N/A';
        try {
          const reviewResponse = await axios.get('https://api.isthereanydeal.com/internal/reviews/v1', {
            params: { key: ITAD_API_KEY, appid: steamAppId }
          });
          const reviewData = reviewResponse.data;
          // OpenCritic 점수를 우선 사용, 없으면 Metacritic 사용자 점수 사용
          if (reviewData?.opencritic?.score) {
            reviewScore = reviewData.opencritic.score;
            reviewPlatform = 'OpenCritic';
          } else if (reviewData?.metauser?.score) {
            reviewScore = reviewData.metauser.score;
            reviewPlatform = 'Metacritic';
          }
        } catch (reviewErr) {
          console.log(`[정보] ${infoData.title}의 리뷰 점수를 가져올 수 없습니다. (무시)`);
        }

        // ★ [유지] 3C. 스팀 API 호출 전 딜레이
        await delay(3000); 

        // --- 3D. '스팀 상세정보' (Steam API) ---
        const steamUrl = `https://store.steampowered.com/api/appdetails?appids=${steamAppId}&l=korean`;
        const steamResponse = await axios.get(steamUrl);
        
        if (!steamResponse.data[steamAppId] || !steamResponse.data[steamAppId].success) { 
          console.warn(`[경고] ${infoData.title}의 Steam 데이터를 가져올 수 없습니다.`);
          continue; 
        }
        const steamData = steamResponse.data[steamAppId].data;

        // --- 3E. '스마트 태그' 번역 ---
        const steamTags = steamData.categories ? steamData.categories.map(cat => cat.description) : [];
        const smartTags = translateSmartTags(infoData.tags, steamTags);

        // --- 3F. '가격 정보' 조합 ---
        const priceData = priceMap.get(itad_id);
        let priceInfo = { current_price: 0, regular_price: 0, discount_percent: 0, store_url: '#', store_name: '정보 없음', historical_low: 0, expiry: null, isFree: false };
        if (steamData.is_free === true) { 
            priceInfo = {
              ...priceInfo,
              isFree: true,
              store_url: `https://store.steampowered.com/app/${steamAppId}`,
              store_name: "Steam"
            };
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
                    store_name: bestDeal.shop.name, 
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
                    store_name: regularPriceDeal.shop.name, 
                    historical_low: historicalLow,
                    expiry: null,
                    isFree: false
                };
            }
        }

        // --- 3G. 'PC 사양' 조합 ---
        let pcReq = { minimum: "정보 없음", recommended: "정보 없음" };
        if (steamData.pc_requirements && !Array.isArray(steamData.pc_requirements)) {
            pcReq = {
                minimum: steamData.pc_requirements.minimum || "정보 없음",
                recommended: steamData.pc_requirements.recommended || "정보 없음"
            };
        }

        // --- ★ [신규] 3H. '미디어' 정보 추출 ---
        const screenshots = steamData.screenshots ? steamData.screenshots.map(s => s.path_full) : [];
        // (최대 1080p webm 포맷 필터링)
        const trailers = steamData.movies ? steamData.movies
            .filter(m => m.webm && (m.webm['1080'] || m.webm.max)) 
            .map(m => m.webm['1080'] || m.webm.max) : [];

        // --- 3I. DB에 저장할 최종 데이터 ---
        const gameDataToSave = {
          slug: itad_id, 
          title: infoData.title,
          steam_appid: steamAppId,
          main_image: infoData.assets.banner600 || steamData.header_image, 
          description: steamData.short_description || "설명 없음",
          smart_tags: smartTags,
          pc_requirements: pcReq, 
          popularity: (infoData.stats.waitlisted || 0) + (infoData.stats.collected || 0),
          price_info: priceInfo, 
          releaseDate: new Date(infoData.releaseDate),
          screenshots: screenshots, // ★ [신규]
          trailers: trailers, // ★ [신규]
          review_score: reviewScore, // ★ [신규]
          review_platform: reviewPlatform // ★ [신규]
        };

        // --- 3J. MongoDB에 저장 ---
        await Game.updateOne({ slug: itad_id }, gameDataToSave, { upsert: true });
        console.log(`[성공] ${infoData.title} DB 저장/업데이트 완료`);
        collectedCount++;

      } catch (err) {
        console.error(`[실패] ${itad_id} 처리 중 개별 에러:`, err.message, err.response?.data);
      }
    }
  } catch (error) {
    console.error(`[치명적 실패] '인기' 또는 '가격' API 호출 실패:`, error.message, error.response?.data);
  }
  console.log(`[결과] 총 ${collectedCount}개의 게임을 DB에 저장했습니다.`);
}

// --- 메인 실행부 ---
async function runCollector() {
  const dbUri = process.env.MONGODB_URI;
  if (!dbUri) {
    console.error("오류: MONGODB_URI 환경 변수가 설정되지 않았습니다.");
    return;
  }
  
  await mongoose.connect(dbUri); 
  console.log("✅ (수집기) 몽고DB 연결 성공");

  await collectGamesData(); // ★ [수정] 새 함수 이름으로 변경
  
  console.log("--- 메인 페이지 데이터 수집 완료 ---");
  await mongoose.disconnect();
}
runCollector();