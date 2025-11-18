// /backend/collector.js

require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('./models/Game'); 
const hltb = require('howlongtobeat');
const hltbService = new hltb.HowLongToBeatService();

// 스마트 태그 번역
function translateSmartTags(itadTags, steamTags) {
  const smartTags = [];
  const allTags = [...(itadTags || []), ...(steamTags || [])];
  if (allTags.includes('Co-op') || allTags.includes('Online Co-Op')) smartTags.push('4인 협동');
  if (allTags.includes('RPG') || allTags.includes('Action RPG')) smartTags.push('RPG');
  if (allTags.includes('Open World')) smartTags.push('오픈월드');
  return [...new Set(smartTags)];
}

// ★ [수정] 랜덤 딜레이 함수 (min ~ max ms 사이)
const randomDelay = (min, max) => {
  const ms = Math.floor(Math.random() * (max - min + 1) + min);
  return new Promise(resolve => setTimeout(resolve, ms));
};

async function collectGamesData() {
  const ITAD_API_KEY = process.env.ITAD_API_KEY;
  console.log('[시작] 데이터 수집 시작 (HLTB 방어 코드 적용)...');

  let collectedCount = 0;
  const POPULAR_LIMIT = 120; 
  const DEALS_LIMIT = 30;

  try {
    // 1. ID 수집
    const popularResponse = await axios.get('https://api.isthereanydeal.com/stats/most-popular/v1', {
      params: { key: ITAD_API_KEY, limit: POPULAR_LIMIT, offset: 0 }
    });
    const popularIds = popularResponse.data.map(game => game.id);

    const dealsResponse = await axios.get('https://api.isthereanydeal.com/deals/v2', {
      params: { key: ITAD_API_KEY, limit: DEALS_LIMIT, sort: '-cut' } 
    });
    const dealIds = dealsResponse.data.list.map(deal => deal.id);

    const allGameIds = [...new Set([...popularIds, ...dealIds])];
    console.log(`[정보] 총 ${allGameIds.length}개의 고유 게임 ID 수집`);

    // 2. 가격 정보 조회
    const priceResponse = await axios.post(
      `https://api.isthereanydeal.com/games/prices/v3?key=${ITAD_API_KEY}&country=KR`,
      allGameIds 
    );
    const priceMap = new Map(priceResponse.data.map(p => [p.id, p]));

    // 3. 상세 정보 수집
    for (const itad_id of allGameIds) {
      try {
        // 3A. ITAD 기본 정보
        const infoResponse = await axios.get('https://api.isthereanydeal.com/games/info/v2', {
          params: { key: ITAD_API_KEY, id: itad_id }
        });
        const infoData = infoResponse.data;
        const steamAppId = infoData.appid;
        
        if (!steamAppId) continue; 

        // ★ [수정] 랜덤 딜레이 적용 (3000ms ~ 5000ms) - 봇 탐지 회피
        await randomDelay(3000, 5000);

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
          historical_low: 0, expiry: null, isFree: false, deals: [] 
        };

        if (steamData.is_free === true) { 
            priceInfo = { ...priceInfo, regular_price: 0, current_price: 0, isFree: true };
        } 
        else if (priceData && priceData.deals && priceData.deals.length > 0) { 
            const bestDeal = priceData.deals[0];
            const historicalLow = (priceData.historyLow && priceData.historyLow.all) ? priceData.historyLow.all.amountInt : 0;
            
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
            priceInfo = {
                current_price: steamData.price_overview.final / 100, 
                regular_price: steamData.price_overview.initial / 100,
                discount_percent: steamData.price_overview.discount_percent,
                store_url: steamStoreUrl,
                store_name: 'Steam',
                historical_low: 0,
                expiry: null,
                isFree: false,
                deals: [{ shopName: 'Steam', price: steamData.price_overview.final/100, regularPrice: steamData.price_overview.initial/100, discount: steamData.price_overview.discount_percent, url: steamStoreUrl }]
            };
        }

        const screenshots = steamData.screenshots ? steamData.screenshots.map(s => s.path_full) : [];
        const trailers = steamData.movies ? steamData.movies
            .filter(m => m.webm && (m.webm['1080'] || m.webm.max)) 
            .map(m => m.webm['1080'] || m.webm.max) : [];

        // ★ [수정] HLTB 안전 로직 (에러 나도 절대 멈추지 않음)
        let playTime = "정보 없음";
        try {
            // 특수문자 제거하여 검색 정확도 향상
            const cleanTitle = infoData.title.replace(/[^a-zA-Z0-9 ]/g, ""); 
            const hltbResults = await hltbService.search(cleanTitle);
            // 유사도 0.6 이상이면 채택
            const bestMatch = hltbResults.find(h => h.similarity > 0.6); 
            
            if (bestMatch) {
                playTime = `${bestMatch.gameplayMain} 시간`;
            }
        } catch (hltbErr) {
            // HLTB 에러는 무시하고 기본값 사용
        }

        const metacriticScore = steamData.metacritic ? steamData.metacritic.score : 0;

        const gameDataToSave = {
          slug: itad_id, 
          title: infoData.title,
          steam_appid: steamAppId,
          main_image: infoData.assets.banner600 || steamData.header_image, 
          description: steamData.short_description || "설명 없음",
          smart_tags: smartTags,
          pc_requirements: {
             minimum: steamData.pc_requirements?.minimum || "정보 없음",
             recommended: steamData.pc_requirements?.recommended || "권장 사양 정보 없음" // ★ [수정] 문구 변경
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
        console.log(`[성공] ${infoData.title}`);
        collectedCount++;

      } catch (err) {
        const status = err.response ? err.response.status : "Unknown";
        // 429 (Too Many Requests) 에러일 경우 로그 남김
        if (status === 429) console.warn(`[경고] API 요청 제한 걸림 (잠시 대기 필요)`);
        else console.error(`[실패] ${itad_id}: ${err.message}`);
      }
    }
  } catch (error) {
    console.error(`[치명적 실패]`, error.message);
  }
  console.log(`[결과] 총 ${collectedCount}개의 게임을 DB에 저장했습니다.`);
}

async function runCollector() {
  const dbUri = process.env.MONGODB_URI;
  if (!dbUri) return console.error("오류: MONGODB_URI 환경 변수 없음");
  
  await mongoose.connect(dbUri); 
  console.log("✅ (수집기) 몽고DB 연결 성공");
  await collectGamesData();
  console.log("--- 완료 ---");
  await mongoose.disconnect();
}
runCollector();