require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('./models/Game'); 
const hltb = require('howlongtobeat');
const hltbService = new hltb.HowLongToBeatService();

// 랜덤 딜레이
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 태그 매핑
const TAG_MAP = {
  'rpg': 'RPG', 'action': '액션', 'fps': 'FPS', 'simulation': '시뮬레이션', 'strategy': '전략',
  'adventure': '어드벤처', 'indie': '인디', 'casual': '캐주얼', 'open world': '오픈월드',
  'massively multiplayer': 'MMO', 'puzzle': '퍼즐', 'racing': '레이싱', 'sports': '스포츠'
};

// ★ [핵심] Steam에서 인기 게임 ID 가져오기 (ITAD 대체)
async function getSteamTopGames() {
    try {
        // Steam Spy API (대체제) 또는 Steam Store API 활용
        // 여기서는 Steam Store의 Featured API 사용
        const res = await axios.get('https://store.steampowered.com/api/featuredcategories?l=korean&cc=kr');
        const ids = new Set();
        
        // 인기 카테고리에서 게임 ID 추출
        const categories = ['0', '1', '2']; // Top Sellers, New, etc.
        categories.forEach(key => {
            if(res.data[key]?.items) {
                res.data[key].items.forEach(item => ids.add(item.id));
            }
        });
        
        // 비상용 하드코딩 ID (API 실패시 최소한 이건 수집됨)
        [1091500, 2357570, 570, 730, 578080, 1172470, 1245620, 271590, 359550, 292030, 105600].forEach(id => ids.add(id));
        
        return Array.from(ids);
    } catch (e) {
        console.error("Steam List Error:", e.message);
        return [1091500, 2357570, 570, 730]; // 실패 시 기본값
    }
}

async function collectGamesData() {
  const ITAD_API_KEY = process.env.ITAD_API_KEY; // 있으면 쓰고 없으면 맘
  
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ DB 연결 성공. 수집 시작...");

  // 1. 게임 목록 확보
  const appIds = await getSteamTopGames();
  console.log(`🎯 수집 대상 게임: ${appIds.length}개`);

  // 2. 상세 정보 수집
  let count = 0;
  for (const appid of appIds) {
      try {
          await sleep(1500); // 차단 방지 딜레이

          // Steam API 호출
          const steamUrl = `https://store.steampowered.com/api/appdetails?appids=${appid}&l=korean&cc=kr`;
          const steamRes = await axios.get(steamUrl);
          
          if (!steamRes.data[appid]?.success) continue;
          const data = steamRes.data[appid].data;
          if (data.type !== 'game') continue;

          // 태그 매핑
          const rawTags = [];
          if(data.genres) rawTags.push(...data.genres.map(g=>g.description));
          if(data.categories) rawTags.push(...data.categories.map(c=>c.description));
          
          const smartTags = new Set();
          rawTags.forEach(t => {
              const lower = t.toLowerCase();
              for (const key in TAG_MAP) {
                  if (lower.includes(key)) smartTags.add(TAG_MAP[key]);
              }
          });

          // 가격 정보 (Steam 데이터 기준)
          const priceOverview = data.price_overview;
          const isFree = data.is_free === true;
          
          const priceInfo = {
              regular_price: priceOverview ? priceOverview.initial / 100 : 0,
              current_price: priceOverview ? priceOverview.final / 100 : 0,
              discount_percent: priceOverview ? priceOverview.discount_percent : 0,
              store_url: `https://store.steampowered.com/app/${appid}`,
              store_name: 'Steam',
              isFree: isFree,
              deals: [] // ITAD가 안되므로 빈 배열 (오류 방지)
          };

          // HLTB
          let playTime = "정보 없음";
          try {
            const hltbRes = await hltbService.search(data.name.replace(/[^a-zA-Z0-9 ]/g, ""));
            if(hltbRes.length > 0) playTime = `${hltbRes[0].gameplayMain} 시간`;
          } catch(e){}

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
              releaseDate: new Date(data.release_date?.date || Date.now()),
              price_info: priceInfo,
              screenshots: data.screenshots?.map(s => s.path_full) || [],
              trailers: data.movies?.map(m => m.webm?.max) || [],
              play_time: playTime,
              metacritic_score: data.metacritic?.score || 0
          };

          await Game.findOneAndUpdate({ steam_appid: appid }, gameDoc, { upsert: true });
          count++;
          console.log(`[${count}] 저장 완료: ${data.name}`);

      } catch (err) {
          console.error(`❌ 에러 (${appid}): ${err.message}`);
      }
  }
  console.log("✅ 수집 완료");
  process.exit(0);
}

collectGamesData();