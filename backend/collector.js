require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('./models/Game'); 
const hltb = require('howlongtobeat');
const hltbService = new hltb.HowLongToBeatService();

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ★ [핵심] 태그 매핑 대폭 확장 (이제 거의 모든 게임이 태그를 가집니다)
const TAG_MAP = {
  // 장르
  'rpg': 'RPG', 'role-playing': 'RPG', 'jrpg': 'RPG', 'crpg': 'RPG', 'arpg': 'RPG',
  'action': '액션', 'hack and slash': '액션', 'beat \'em up': '액션',
  'fps': 'FPS', 'shooter': 'FPS', 'first-person shooter': 'FPS',
  'simulation': '시뮬레이션', 'sim': '시뮬레이션', 'management': '시뮬레이션', 'building': '시뮬레이션',
  'strategy': '전략', 'rts': '전략', 'turn-based strategy': '전략', 'grand strategy': '전략', '4x': '전략',
  'sports': '스포츠', 'racing': '레이싱', 'driving': '레이싱',
  'puzzle': '퍼즐', 'logic': '퍼즐',
  'survival': '생존', 'crafting': '생존', 'survival horror': '생존',
  'horror': '공포', 'psychological horror': '공포', 'zombies': '공포',
  'rhythm': '리듬', 'music': '리듬',
  
  // 시점
  'first-person': '1인칭', 'fps': '1인칭',
  'third-person': '3인칭', 'third person': '3인칭',
  'top-down': '쿼터뷰', 'isometric': '쿼터뷰',
  'side scroller': '횡스크롤', 'platformer': '횡스크롤', '2d platformer': '횡스크롤',

  // 그래픽
  'pixel graphics': '픽셀 그래픽', 'pixel art': '픽셀 그래픽', 'retro': '픽셀 그래픽',
  '2d': '2D',
  '3d': '3D',
  'anime': '만화 같은', 'cartoon': '만화 같은', 'cel-shaded': '만화 같은',
  'realistic': '현실적', 'photorealistic': '현실적',
  'cute': '귀여운', 'family friendly': '귀여운',

  // 테마
  'fantasy': '판타지', 'magic': '판타지', 'dark fantasy': '판타지',
  'sci-fi': '공상과학', 'space': '공상과학', 'cyberpunk': '공상과학', 'futuristic': '공상과학',
  'medieval': '중세', 'historical': '중세',
  'modern': '현대',
  'post-apocalyptic': '포스트아포칼립스', 'survival': '포스트아포칼립스',
  'war': '전쟁', 'military': '전쟁', 'tanks': '전쟁',

  // 특징
  'open world': '오픈 월드', 'open-world': '오픈 월드',
  'story rich': '스토리 중심', 'narrative': '스토리 중심', 'visual novel': '스토리 중심',
  'choices matter': '선택의 중요성',
  'co-op': '협동', 'multiplayer': '협동', 'online co-op': '협동', 'local co-op': '협동',
  'competitive': '경쟁', 'pvp': 'PvP', 'esports': '경쟁',
  'souls-like': '소울라이크', 'difficult': '소울라이크', 'metroidvania': '소울라이크',
  'roguelike': '로그라이크', 'roguelite': '로그라이크'
};

async function getSteamTopGames() {
    try {
        const res = await axios.get('https://store.steampowered.com/api/featuredcategories?l=korean&cc=kr');
        const ids = new Set();
        ['0', '1', '2'].forEach(key => {
            if(res.data[key]?.items) res.data[key].items.forEach(item => ids.add(item.id));
        });
        // 비상용
        [1091500, 2357570, 570, 730, 578080, 1172470, 1245620, 271590, 359550, 292030, 105600].forEach(id => ids.add(id));
        return Array.from(ids);
    } catch (e) { return [1091500, 2357570, 570, 730]; }
}

async function collectGamesData() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ DB 연결 성공. 수집 시작...");

  const appIds = await getSteamTopGames();
  console.log(`🎯 수집 대상: ${appIds.length}개`);

  let count = 0;
  for (const appid of appIds) {
      try {
          await sleep(1200); 
          const steamRes = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=korean&cc=kr`);
          
          if (!steamRes.data[appid]?.success) continue;
          const data = steamRes.data[appid].data;
          if (data.type !== 'game') continue;

          // 태그 매핑 로직 강화
          const rawTags = [];
          if(data.genres) rawTags.push(...data.genres.map(g=>g.description));
          if(data.categories) rawTags.push(...data.categories.map(c=>c.description));
          
          const smartTags = new Set();
          rawTags.forEach(t => {
              const lower = t.toLowerCase();
              // 완전 일치 및 부분 일치 검색
              for (const key in TAG_MAP) {
                  if (lower.includes(key)) smartTags.add(TAG_MAP[key]);
              }
          });

          // 가격
          const priceOverview = data.price_overview;
          const priceInfo = {
              regular_price: priceOverview ? priceOverview.initial / 100 : 0,
              current_price: priceOverview ? priceOverview.final / 100 : 0,
              discount_percent: priceOverview ? priceOverview.discount_percent : 0,
              store_url: `https://store.steampowered.com/app/${appid}`,
              store_name: 'Steam',
              isFree: data.is_free === true,
              deals: [] 
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
              smart_tags: Array.from(smartTags), // 여기!
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
          console.log(`[${count}] ${data.name} (태그: ${gameDoc.smart_tags.join(', ')})`);

      } catch (err) { console.error(`❌ ${appid} 실패: ${err.message}`); }
  }
  console.log("✅ 수집 완료");
  process.exit(0);
}

collectGamesData();