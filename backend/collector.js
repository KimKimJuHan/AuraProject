// /backend/collector.js

require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('./models/Game'); 
const hltb = require('howlongtobeat');
const hltbService = new hltb.HowLongToBeatService();

// --- 설정값 ---
const TARGET_GAME_COUNT = 1000; // ★ 목표 수집 개수 (1000개로 대폭 증가)
const API_BATCH_LIMIT = 200;    // ITAD API 1회 최대 요청 개수

// 딜레이
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 스마트 태그 번역
function translateSmartTags(itadTags, steamTags) {
  const smartTags = [];
  const allTags = [...(itadTags || []), ...(steamTags || [])];
  if (allTags.includes('Co-op') || allTags.includes('Online Co-Op')) smartTags.push('4인 협동');
  if (allTags.includes('RPG') || allTags.includes('Action RPG')) smartTags.push('RPG');
  if (allTags.includes('Open World')) smartTags.push('오픈월드');
  return [...new Set(smartTags)];
}

// ★ [신규] 배열을 N개씩 쪼개는 함수 (Chunking)
function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

async function collectGamesData() {
  const ITAD_API_KEY = process.env.ITAD_API_KEY;
  console.log(`[시작] 대규모 데이터 수집 시작 (목표: ${TARGET_GAME_COUNT}개)...`);

  let collectedIds = new Set();
  let processedCount = 0;

  try {
    // -------------------------------------------------------
    // 1. 게임 ID 수집 (Pagination Loop)
    // -------------------------------------------------------
    console.log(`[1단계] 게임 ID 목록 수집 중...`);
    
    // 1-A. 인기 게임 (Pagination)
    let offset = 0;
    while (collectedIds.size < TARGET_GAME_COUNT) {
      try {
        const response = await axios.get('https://api.isthereanydeal.com/stats/most-popular/v1', {
          params: { key: ITAD_API_KEY, limit: API_BATCH_LIMIT, offset: offset }
        });
        const batch = response.data;
        if (!batch || batch.length === 0) break; // 더 이상 데이터 없음

        batch.forEach(game => collectedIds.add(game.id));
        console.log(`   >> 인기 게임 ${batch.length}개 추가 (누적: ${collectedIds.size})`);
        
        offset += API_BATCH_LIMIT;
        await delay(1000); // API 부하 방지
      } catch (err) {
        console.error("   !! ID 수집 중 에러:", err.message);
        break;
      }
    }

    // 1-B. 할인율 높은 게임 (30개 추가 확보)
    try {
        const dealsResponse = await axios.get('https://api.isthereanydeal.com/deals/v2', {
          params: { key: ITAD_API_KEY, limit: 50, sort: '-cut' } 
        });
        dealsResponse.data.list.forEach(deal => collectedIds.add(deal.id));
        console.log(`   >> 할인 게임 추가 확보 (총 누적: ${collectedIds.size})`);
    } catch (err) {
        console.error("   !! 할인 리스트 수집 에러:", err.message);
    }

    const allGameIds = Array.from(collectedIds);

    // -------------------------------------------------------
    // 2. 가격 정보 조회 (Chunking Loop)
    // -------------------------------------------------------
    console.log(`[2단계] 가격 정보 일괄 조회 중...`);
    const priceMap = new Map();
    const idChunks = chunkArray(allGameIds, API_BATCH_LIMIT); // 200개씩 쪼개기

    for (const chunk of idChunks) {
        try {
            const priceResponse = await axios.post(
                `https://api.isthereanydeal.com/games/prices/v3?key=${ITAD_API_KEY}&country=KR`,
                chunk
            );
            priceResponse.data.forEach(p => priceMap.set(p.id, p));
            console.log(`   >> 가격 정보 ${chunk.length}개 로드 완료`);
            await delay(500);
        } catch (err) {
            console.error("   !! 가격 조회 에러:", err.message);
        }
    }

    // -------------------------------------------------------
    // 3. 상세 정보 수집 및 DB 저장 (Main Loop)
    // -------------------------------------------------------
    console.log(`[3단계] 상세 정보 수집 및 DB 저장 시작...`);

    for (const itad_id of allGameIds) {
      try {
        // 3A. 기본 정보 (ITAD)
        const infoResponse = await axios.get('https://api.isthereanydeal.com/games/info/v2', {
          params: { key: ITAD_API_KEY, id: itad_id }
        });
        const infoData = infoResponse.data;
        const steamAppId = infoData.appid;
        
        // AppID 없거나 게임 아니면 패스
        if (!steamAppId || infoData.type !== 'game') continue; 

        // 3B. Steam API (3초 딜레이 필수)
        await delay(3000); 
        const steamUrl = `https://store.steampowered.com/api/appdetails?appids=${steamAppId}&l=korean&cc=kr`;
        
        let steamData = null;
        try {
            const steamResponse = await axios.get(steamUrl);
            if (steamResponse.data[steamAppId] && steamResponse.data[steamAppId].success) {
                steamData = steamResponse.data[steamAppId].data;
            }
        } catch (steamErr) {
            console.warn(`   :: Steam API 호출 실패 (${infoData.title}) - 건너뜀`);
            continue; // Steam 정보 없으면 스킵 (데이터 품질 유지)
        }
        
        if (!steamData) continue;

        // 3C. 데이터 가공
        const steamTags = steamData.categories ? steamData.categories.map(cat => cat.description) : [];
        const smartTags = translateSmartTags(infoData.tags, steamTags);

        // 가격 정보 (폴백 로직)
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
            priceInfo.current_price = steamData.price_overview.final / 100;
            priceInfo.regular_price = steamData.price_overview.initial / 100;
            priceInfo.discount_percent = steamData.price_overview.discount_percent;
            priceInfo.store_url = steamStoreUrl;
            priceInfo.store_name = 'Steam';
            priceInfo.deals = [{
                shopName: 'Steam',
                price: steamData.price_overview.final / 100,
                regularPrice: steamData.price_overview.initial / 100,
                discount: steamData.price_overview.discount_percent,
                url: steamStoreUrl
            }];
        }

        // 미디어
        const screenshots = steamData.screenshots ? steamData.screenshots.map(s => s.path_full) : [];
        const trailers = steamData.movies ? steamData.movies
            .filter(m => m.webm && (m.webm['1080'] || m.webm.max)) 
            .map(m => m.webm['1080'] || m.webm.max) : [];

        // HLTB (가끔 실패하므로 try-catch)
        let playTime = "정보 없음";
        try {
            const hltbResults = await hltbService.search(infoData.title);
            const bestMatch = hltbResults.find(h => h.similarity > 0.8); 
            if (bestMatch) playTime = `${bestMatch.gameplayMain} 시간`;
        } catch (e) { /* 무시 */ }

        // Metacritic
        const metacriticScore = steamData.metacritic ? steamData.metacritic.score : 0;

        // DB 저장
        const gameDataToSave = {
          slug: itad_id, 
          title: infoData.title,
          steam_appid: steamAppId,
          main_image: infoData.assets.banner600 || steamData.header_image, 
          description: steamData.short_description || "설명 없음",
          smart_tags: smartTags,
          pc_requirements: {
             minimum: steamData.pc_requirements?.minimum || "정보 없음",
             recommended: steamData.pc_requirements?.recommended || "정보 없음"
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
        console.log(`[${processedCount}/${allGameIds.length}] 저장 완료: ${infoData.title}`);

      } catch (err) {
        console.error(`   !! 개별 처리 실패 (${itad_id}):`, err.message);
      }
    }
  } catch (error) {
    console.error(`[치명적 실패]`, error.message);
  }
  console.log(`[완료] 총 ${processedCount}개의 게임 데이터가 최신화되었습니다.`);
}

async function runCollector() {
  const dbUri = process.env.MONGODB_URI;
  if (!dbUri) return console.error("오류: MONGODB_URI 환경 변수 없음");
  
  await mongoose.connect(dbUri); 
  console.log("✅ (수집기) 몽고DB 연결 성공");
  await collectGamesData();
  console.log("--- 종료 ---");
  await mongoose.disconnect();
}
runCollector();