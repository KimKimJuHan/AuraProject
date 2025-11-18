require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('./models/Game'); 
const hltb = require('howlongtobeat');
const hltbService = new hltb.HowLongToBeatService();

// ★ [수정] 팀원분의 디자인에 맞춘 태그 매핑 시스템
function translateSmartTags(itadTags, steamTags) {
  const allTags = [...(itadTags || []), ...(steamTags || [])].map(t => t.toLowerCase());
  const smartTags = new Set();

  // 1. 장르 (Genre)
  if (allTags.includes('rpg') || allTags.includes('role-playing')) smartTags.add('RPG');
  if (allTags.includes('simulation') || allTags.includes('sim')) smartTags.add('시뮬레이션');
  if (allTags.includes('strategy') || allTags.includes('rts') || allTags.includes('turn-based strategy')) smartTags.add('전략');
  if (allTags.includes('sports')) smartTags.add('스포츠');
  if (allTags.includes('racing')) smartTags.add('레이싱');
  if (allTags.includes('puzzle')) smartTags.add('퍼즐');
  if (allTags.includes('survival') || allTags.includes('survival horror')) smartTags.add('생존');
  if (allTags.includes('horror') || allTags.includes('psychological horror')) smartTags.add('공포');
  if (allTags.includes('rhythm') || allTags.includes('music')) smartTags.add('리듬');
  if (allTags.includes('fps') || allTags.includes('shooter') || allTags.includes('first-person shooter')) smartTags.add('FPS'); // ★ 요청하신 FPS 추가

  // 2. 시점 (View)
  if (allTags.includes('first-person') || allTags.includes('fps')) smartTags.add('1인칭');
  if (allTags.includes('third-person') || allTags.includes('third person')) smartTags.add('3인칭');

  // 3. 그래픽 스타일 (Visuals)
  if (allTags.includes('pixel graphics') || allTags.includes('pixel art')) smartTags.add('픽셀 그래픽');
  if (allTags.includes('2d')) smartTags.add('2D');
  if (allTags.includes('3d')) smartTags.add('3D');
  if (allTags.includes('cartoon') || allTags.includes('anime') || allTags.includes('cel-shaded')) smartTags.add('만화 같은');
  if (allTags.includes('realistic')) smartTags.add('현실적');
  if (allTags.includes('cute')) smartTags.add('귀여운');

  // 4. 테마 (Theme)
  if (allTags.includes('fantasy')) smartTags.add('판타지');
  if (allTags.includes('sci-fi') || allTags.includes('science fiction')) smartTags.add('공상과학');
  if (allTags.includes('medieval')) smartTags.add('중세');
  if (allTags.includes('modern')) smartTags.add('현대');
  if (allTags.includes('space')) smartTags.add('우주');
  if (allTags.includes('zombies') || allTags.includes('zombie')) smartTags.add('좀비');
  if (allTags.includes('cyberpunk')) smartTags.add('사이버펑크');
  if (allTags.includes('magic')) smartTags.add('마법');
  if (allTags.includes('war') || allTags.includes('military') || allTags.includes('world war ii')) smartTags.add('전쟁');
  if (allTags.includes('post-apocalyptic')) smartTags.add('포스트아포칼립스');

  // 5. 특징 (Features)
  if (allTags.includes('open world')) smartTags.add('오픈 월드');
  if (allTags.includes('resource management') || allTags.includes('crafting')) smartTags.add('자원관리');
  if (allTags.includes('story rich') || allTags.includes('narrative')) smartTags.add('스토리 중심');
  if (allTags.includes('choices matter')) smartTags.add('선택의 중요성');
  if (allTags.includes('character customization')) smartTags.add('캐릭터 커스터마이즈');
  if (allTags.includes('co-op') || allTags.includes('co-op campaign') || allTags.includes('online co-op')) smartTags.add('협동 캠페인');
  if (allTags.includes('competitive') || allTags.includes('esports')) smartTags.add('경쟁');
  if (allTags.includes('pvp')) smartTags.add('PvP');
  if (allTags.includes('pve')) smartTags.add('PvE');

  return Array.from(smartTags);
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function collectGamesData() {
  const ITAD_API_KEY = process.env.ITAD_API_KEY;
  console.log('[시작] 데이터 수집 시작 (태그 매핑 강화)...');

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
        const infoResponse = await axios.get('https://api.isthereanydeal.com/games/info/v2', {
          params: { key: ITAD_API_KEY, id: itad_id }
        });
        const infoData = infoResponse.data;
        const steamAppId = infoData.appid;
        
        if (!steamAppId) continue; 

        await delay(3000);
        const steamUrl = `https://store.steampowered.com/api/appdetails?appids=${steamAppId}&l=korean&cc=kr`;
        const steamResponse = await axios.get(steamUrl);
        
        if (!steamResponse.data[steamAppId] || !steamResponse.data[steamAppId].success) continue;
        const steamData = steamResponse.data[steamAppId].data;

        const steamTags = steamData.categories ? steamData.categories.map(cat => cat.description) : [];
        // ★ [수정] 새로운 태그 번역 함수 적용
        const smartTags = translateSmartTags(infoData.tags, steamTags);

        // 가격 정보
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

        const screenshots = steamData.screenshots ? steamData.screenshots.map(s => s.path_full) : [];
        const trailers = steamData.movies ? steamData.movies
            .filter(m => m.webm && (m.webm['1080'] || m.webm.max)) 
            .map(m => m.webm['1080'] || m.webm.max) : [];

        let playTime = "정보 없음";
        try {
            const cleanTitle = infoData.title.replace(/[^a-zA-Z0-9 ]/g, ""); 
            const hltbResults = await hltbService.search(cleanTitle);
            const bestMatch = hltbResults.find(h => h.similarity > 0.7); 
            if (bestMatch) playTime = `${bestMatch.gameplayMain} 시간`;
        } catch (e) { /* 무시 */ }

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
        console.log(`[성공] ${infoData.title}`);
        collectedCount++;

      } catch (err) {
        const status = err.response ? err.response.status : "알 수 없음";
        console.error(`[실패] ${itad_id}: Status ${status} - ${err.message}`);
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