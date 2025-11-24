require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('./models/Game'); 
const hltb = require('howlongtobeat');
const hltbService = new hltb.HowLongToBeatService();

// 1. 환경변수 및 설정
const { MONGODB_URI, ITAD_API_KEY, STEAM_API_KEY } = process.env;

// 랜덤 지연 (차단 방지)
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 태그 매핑 (한글화)
const TAG_MAP = {
  'rpg': 'RPG', 'role-playing': 'RPG', 'action': '액션', 'fps': 'FPS', 
  'shooter': 'FPS', 'simulation': '시뮬레이션', 'strategy': '전략', 
  'adventure': '어드벤처', 'indie': '인디', 'casual': '캐주얼', 
  'open world': '오픈월드', 'massively multiplayer': 'MMO', 'puzzle': '퍼즐', 
  'racing': '레이싱', 'sports': '스포츠', 'horror': '공포', 'survival': '생존',
  'roguelike': '로그라이크', 'souls-like': '소울라이크'
};

// ---------------------------------------------------------
// [A] 게임 목록 확보 (ITAD -> 실패시 Steam 동적 조회)
// ---------------------------------------------------------
async function getGameList() {
    const ids = new Set();

    // 1. ITAD 인기 게임 시도
    console.log("📡 [1단계] ITAD 인기 게임 목록 조회 시도...");
    try {
        const res = await axios.get('https://api.isthereanydeal.com/stats/most-popular/v1', {
            params: { key: ITAD_API_KEY, limit: 60 },
            timeout: 5000
        });
        if (res.data && Array.isArray(res.data)) {
            res.data.forEach(g => ids.add({ id: g.id, source: 'itad' }));
            console.log(`✅ ITAD 목록 확보 성공: ${ids.size}개`);
            return Array.from(ids);
        }
    } catch (e) {
        console.warn(`⚠️ ITAD 목록 조회 실패 (Status: ${e.response?.status || 'Unknown'})`);
        if (e.response?.data) console.warn("   -> 에러 상세:", JSON.stringify(e.response.data));
    }

    // 2. Steam 인기 게임 시도 (ITAD 실패 시 Fallback)
    console.log("🔄 [2단계] Steam 인기 차트(동접자순) 동적 조회 시도...");
    try {
        // ISteamChartsService는 키 없이도 호출 가능한 경우가 많음, 실패하면 Store API 사용
        const steamRes = await axios.get('https://api.steampowered.com/ISteamChartsService/GetGamesByConcurrentPlayers/v1/');
        const steamGames = steamRes.data?.response?.ranks || [];
        
        if (steamGames.length > 0) {
            steamGames.forEach(g => ids.add({ id: g.appid, source: 'steam' }));
            console.log(`✅ Steam 동접자 순위 목록 확보: ${ids.size}개`);
            return Array.from(ids);
        }
    } catch (steamErr) {
        console.warn("⚠️ Steam 차트 API 실패, Store API로 재시도...");
    }

    // 3. Steam Store Featured (최후의 수단 - 동적)
    try {
        const featuredRes = await axios.get('https://store.steampowered.com/api/featuredcategories?l=english&cc=kr');
        const categories = ['0', '1']; // Top Sellers, New
        categories.forEach(cat => {
            if (featuredRes.data[cat]?.items) {
                featuredRes.data[cat].items.forEach(item => ids.add({ id: item.id, source: 'steam' }));
            }
        });
        console.log(`✅ Steam 추천 목록 확보: ${ids.size}개`);
    } catch (e) {
        console.error("❌ 모든 목록 확보 실패.");
    }

    return Array.from(ids);
}

// ---------------------------------------------------------
// [B] ITAD 가격 정보 조회 (Steam ID -> ITAD Lookup)
// ---------------------------------------------------------
async function getITADPrice(steamAppId, gameTitle) {
    if (!ITAD_API_KEY) return null;
    try {
        // 1. Steam AppID로 ITAD Plain ID 찾기 (Lookup)
        // ITAD v2 API 사용 (v1은 500 에러 잦음)
        const lookupUrl = `https://api.isthereanydeal.com/games/lookup/v1?key=${ITAD_API_KEY}&appid=${steamAppId}&shop=steam`;
        const lookupRes = await axios.get(lookupUrl);
        const plain = lookupRes.data?.game?.plain;

        if (!plain) return null;

        // 2. 가격 조회
        const priceUrl = `https://api.isthereanydeal.com/games/prices/v2?key=${ITAD_API_KEY}&plains=${plain}&country=KR`;
        const priceRes = await axios.get(priceUrl);
        const data = priceRes.data?.[plain];

        if (data && data.list && data.list.length > 0) {
            const best = data.list[0];
            return {
                current_price: best.price_new,
                regular_price: best.price_old,
                discount_percent: best.price_cut,
                store_name: best.shop.name,
                url: best.url,
                deals: data.list.map(d => ({
                    shopName: d.shop.name,
                    price: d.price_new,
                    regularPrice: d.price_old,
                    discount: d.price_cut,
                    url: d.url
                }))
            };
        }
    } catch (e) {
        // ITAD 조회 실패 시 조용히 넘어감 (Steam 가격 사용)
        return null;
    }
    return null;
}

// ---------------------------------------------------------
// [C] 메인 수집 로직
// ---------------------------------------------------------
async function collectGamesData() {
  if (!MONGODB_URI) return console.error("❌ MONGODB_URI 없음");
  await mongoose.connect(MONGODB_URI);
  console.log("✅ DB 연결 성공. 데이터 수집 시작...");

  // 1. 게임 목록 가져오기
  const gameList = await getGameList();
  if (gameList.length === 0) {
      console.log("❌ 수집할 게임이 없습니다. 종료합니다.");
      process.exit(0);
  }

  console.log(`🎯 총 ${gameList.length}개의 게임 정보를 상세 수집합니다.`);

  let successCount = 0;

  for (const item of gameList) {
      const appid = item.id;
      
      try {
          await sleep(1500); // Rate Limit 준수

          // [Steam] 상세 정보
          const steamRes = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=korean&cc=kr`);
          if (!steamRes.data[appid]?.success) continue;
          
          const data = steamRes.data[appid].data;
          if (data.type !== 'game') continue;

          // [ITAD] 가격 정보 시도
          const itadData = await getITADPrice(appid, data.name);

          // 가격 데이터 병합 (ITAD 우선, 없으면 Steam)
          const steamPrice = data.price_overview;
          let priceInfo = {
              regular_price: steamPrice ? steamPrice.initial / 100 : 0,
              current_price: steamPrice ? steamPrice.final / 100 : 0,
              discount_percent: steamPrice ? steamPrice.discount_percent : 0,
              store_url: `https://store.steampowered.com/app/${appid}`,
              store_name: 'Steam',
              isFree: data.is_free === true,
              deals: []
          };

          if (itadData) {
              priceInfo = { ...priceInfo, ...itadData };
              console.log(`   💰 ITAD 가격 연동 성공: ${data.name}`);
          }

          // 태그 정리
          const tags = [];
          if (data.genres) tags.push(...data.genres.map(g => g.description));
          if (data.categories) tags.push(...data.categories.map(c => c.description));
          const smartTags = new Set();
          tags.forEach(t => {
              const lower = t.toLowerCase();
              for (const key in TAG_MAP) {
                  if (lower.includes(key)) smartTags.add(TAG_MAP[key]);
              }
          });

          // 날짜 처리
          let releaseDate = new Date();
          if (data.release_date?.date) {
              // "2023년 8월 4일" 등의 한글 날짜 처리
              const dateStr = data.release_date.date;
              if (dateStr.includes('년')) {
                  const parts = dateStr.replace(/일/g, '').split(/년|월/).map(s => s.trim());
                  if (parts.length >= 3) releaseDate = new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);
              } else {
                  const parsed = new Date(dateStr);
                  if (!isNaN(parsed)) releaseDate = parsed;
              }
          }

          // HLTB
          let playTime = "정보 없음";
          try {
             const hltbRes = await hltbService.search(data.name.replace(/[^a-zA-Z0-9 ]/g, ""));
             if (hltbRes.length > 0) playTime = `${hltbRes[0].gameplayMain} 시간`;
          } catch (e) {}

          // DB 저장 객체
          const gameDoc = {
              slug: `steam-${appid}`,
              steam_appid: appid,
              title: data.name,
              title_ko: data.name,
              main_image: data.header_image,
              description: data.short_description,
              smart_tags: Array.from(smartTags),
              pc_requirements: {
                  minimum: data.pc_requirements?.minimum || "정보 없음",
                  recommended: data.pc_requirements?.recommended || "권장 사양 정보 없음"
              },
              popularity: data.recommendations?.total || 0,
              releaseDate: releaseDate,
              price_info: priceInfo,
              screenshots: data.screenshots?.map(s => s.path_full) || [],
              trailers: data.movies?.map(m => m.webm?.max) || [],
              play_time: playTime,
              metacritic_score: data.metacritic?.score || 0
          };

          await Game.findOneAndUpdate({ steam_appid: appid }, gameDoc, { upsert: true });
          successCount++;
          console.log(`[${successCount}] 저장 완료: ${data.name}`);

      } catch (err) {
          console.error(`❌ 개별 실패 (${appid}): ${err.message}`);
      }
  }

  console.log(`🎉 수집 완료: 총 ${successCount}개 게임 저장됨`);
  process.exit(0);
}

collectGamesData();