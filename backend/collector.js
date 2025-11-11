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

// ★★★ '탭별 데이터' 수집 로직 (v3.2 - Steam 가격 폴백) ★★★
async function collectGamesData() {
  const ITAD_API_KEY = process.env.ITAD_API_KEY;
  console.log('[시작] 탭별 데이터 수집 시작...');

  let collectedCount = 0;
  const POPULAR_LIMIT = 120; // '인기' 탭용 120개
  const DEALS_LIMIT = 30; // '할인' 탭용 30개

  try {
    // --- 1A. '인기' 게임 목록 (120개) ---
    const popularResponse = await axios.get('https://api.isthereanydeal.com/stats/most-popular/v1', {
      params: { key: ITAD_API_KEY, limit: POPULAR_LIMIT, offset: 0 }
    });
    const popularIds = popularResponse.data.map(game => game.id);
    console.log(`[정보] '인기' 게임 ${popularIds.length}개 ID 수집`);

    // --- 1B. '할인' 게임 목록 (30개) ---
    const dealsResponse = await axios.get('https://api.isthereanydeal.com/deals/v2', {
      params: { key: ITAD_API_KEY, limit: DEALS_LIMIT, sort: '-cut' } 
    });
    const dealIds = dealsResponse.data.list.map(deal => deal.id);
    console.log(`[정보] '할인' 게임 ${dealIds.length}개 ID 수집`);

    // --- 1C. 중복 제거 목록 ---
    const allGameIds = [...new Set([...popularIds, ...dealIds])];
    console.log(`[정보] 중복 제거 후 총 ${allGameIds.length}개의 고유 게임 수집`);

    // --- 2. '가격' 정보 한 번에 가져오기 ---
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

        // --- 3C. 스팀 API 호출 전 딜레이 ---
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

        // --- 3F. '가격 정보' 조합 (★ Steam 가격 폴백 추가) ---
        const priceData = priceMap.get(itad_id);
        const steamStoreUrl = `https://store.steampowered.com/app/${steamAppId}`;
        
        let priceInfo = { 
          regular_price: null, 
          current_price: null, 
          discount_percent: 0, 
          store_url: steamStoreUrl,
          store_name: 'Steam',
          historical_low: 0, 
          expiry: null, 
          isFree: false 
        };

        if (steamData.is_free === true) { 
            // 1. (무료 게임)
            priceInfo = {
              ...priceInfo,
              regular_price: 0,
              current_price: 0,
              isFree: true,
            };
        } 
        else if (priceData && priceData.deals && priceData.deals.length > 0) { 
            // 2. (ITAD 가격 정보 있음)
            const bestDeal = priceData.deals[0];
            const historicalLow = (priceData.historyLow && priceData.historyLow.all) ? priceData.historyLow.all.amountInt : 0;

            if (bestDeal.cut > 0) { // (A) 할인 중
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
            } else { // (B) 정가
                priceInfo = {
                    current_price: bestDeal.regular.amountInt,
                    regular_price: bestDeal.regular.amountInt,
                    discount_percent: 0,
                    store_url: bestDeal.url,
                    store_name: bestDeal.shop.name, 
                    historical_low: historicalLow,
                    expiry: null,
                    isFree: false
                };
            }
        }
        // ★ [수정] 3. (ITAD 가격은 없지만, Steam에 가격이 있음)
        else if (steamData.price_overview) {
            console.log(`[정보] ${infoData.title}: ITAD 가격 없음. Steam 정가로 대체합니다.`);
            priceInfo = {
                // (Steam 가격은 100이 곱해져 있으므로 나눠야 함)
                current_price: steamData.price_overview.final / 100, 
                regular_price: steamData.price_overview.initial / 100,
                discount_percent: steamData.price_overview.discount_percent,
                store_url: steamStoreUrl,
                store_name: 'Steam',
                historical_low: 0, // (ITAD 정보가 없으므로 0)
                expiry: null,
                isFree: false
            };
        }
        // 4. (모든 곳에 가격 정보가 없으면 priceInfo.regular_price는 'null' 유지)

        // --- 3G. 'PC 사양' 조합 ---
        let pcReq = { minimum: "정보 없음", recommended: "정보 없음" };
        if (steamData.pc_requirements && !Array.isArray(steamData.pc_requirements)) {
            pcReq = {
                minimum: steamData.pc_requirements.minimum || "정보 없음",
                recommended: steamData.pc_requirements.recommended || "정보 없음"
            };
        }

        // --- 3H. '미디어' 정보 추출 ---
        const screenshots = steamData.screenshots ? steamData.screenshots.map(s => s.path_full) : [];
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
          screenshots: screenshots,
          trailers: trailers,
        };

        // --- 3J. MongoDB에 저장 ---
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
  const dbUri = process.env.MONGODB_URI;
  if (!dbUri) {
    console.error("오류: MONGODB_URI 환경 변수가 설정되지 않았습니다.");
    return;
  }
  
  await mongoose.connect(dbUri); 
  console.log("✅ (수집기) 몽고DB 연결 성공");

  await collectGamesData();
  
  console.log("--- 메인 페이지 데이터 수집 완료 ---");
  await mongoose.disconnect();
}
runCollector();