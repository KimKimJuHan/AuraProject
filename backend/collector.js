require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('./models/Game'); 
const hltb = require('howlongtobeat');
const hltbService = new hltb.HowLongToBeatService();

// 1. 환경변수
const { MONGODB_URI, ITAD_API_KEY, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, CHZZK_CLIENT_ID, CHZZK_CLIENT_SECRET } = process.env;

// 랜덤 지연
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 태그 매핑
const TAG_MAP = {
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
  'first-person': '1인칭', 'fps': '1인칭',
  'third-person': '3인칭', 'third person': '3인칭',
  'top-down': '쿼터뷰', 'isometric': '쿼터뷰',
  'side scroller': '횡스크롤', 'platformer': '횡스크롤', '2d platformer': '횡스크롤',
  'pixel graphics': '픽셀 그래픽', 'pixel art': '픽셀 그래픽', 'retro': '픽셀 그래픽',
  '2d': '2D', '3d': '3D',
  'anime': '만화 같은', 'cartoon': '만화 같은', 'cel-shaded': '만화 같은',
  'realistic': '현실적', 'photorealistic': '현실적',
  'cute': '귀여운', 'family friendly': '귀여운',
  'fantasy': '판타지', 'magic': '판타지', 'dark fantasy': '판타지',
  'sci-fi': '공상과학', 'space': '공상과학', 'cyberpunk': '공상과학', 'futuristic': '공상과학',
  'medieval': '중세', 'historical': '중세',
  'modern': '현대',
  'post-apocalyptic': '포스트아포칼립스', 'survival': '포스트아포칼립스',
  'war': '전쟁', 'military': '전쟁', 'tanks': '전쟁',
  'open world': '오픈 월드', 'open-world': '오픈 월드',
  'story rich': '스토리 중심', 'narrative': '스토리 중심', 'visual novel': '스토리 중심',
  'choices matter': '선택의 중요성',
  'co-op': '협동', 'multiplayer': '협동', 'online co-op': '협동', 'local co-op': '협동',
  'competitive': '경쟁', 'pvp': 'PvP', 'esports': '경쟁',
  'souls-like': '소울라이크', 'difficult': '소울라이크', 'metroidvania': '소울라이크',
  'roguelike': '로그라이크', 'roguelite': '로그라이크'
};

// ---------------------------------------------------------
// [A] 트위치 & 치지직 (트렌드 분석)
// ---------------------------------------------------------
let twitchToken = null;
async function getTwitchToken() {
    if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) return;
    try {
        const res = await axios.post('https://id.twitch.tv/oauth2/token', null, {
            params: { client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' }
        });
        twitchToken = res.data.access_token;
    } catch (e) { console.error("Twitch Auth Error:", e.message); }
}

async function getTwitchStats(gameName) {
    if (!twitchToken) await getTwitchToken();
    if (!twitchToken) return 0;
    try {
        const gameRes = await axios.get('https://api.twitch.tv/helix/games', {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchToken}` },
            params: { name: gameName }
        });
        const gameId = gameRes.data.data[0]?.id;
        if (!gameId) return 0;
        const streamRes = await axios.get('https://api.twitch.tv/helix/streams', {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchToken}` },
            params: { game_id: gameId, first: 100 }
        });
        return streamRes.data.data.reduce((acc, s) => acc + s.viewer_count, 0);
    } catch (e) { return 0; }
}

async function getChzzkStats(gameName) {
    if (!CHZZK_CLIENT_ID || !CHZZK_CLIENT_SECRET) return 0;
    try {
        const res = await axios.get('https://openapi.chzzk.naver.com/open/v1/categories/search', {
            headers: { 'Client-Id': CHZZK_CLIENT_ID, 'Client-Secret': CHZZK_CLIENT_SECRET, 'Content-Type': 'application/json' },
            params: { query: gameName, size: 1 }
        });
        // 카테고리 존재하면 가중치 부여 (정확한 시청자 수는 비공식 API 필요하나 안전하게 공식 사용)
        return res.data?.content?.data?.length > 0 ? 1000 : 0;
    } catch (e) { return 0; }
}

// ---------------------------------------------------------
// [B] 게임 목록 확보 (ITAD -> 실패시 Steam 동적)
// ---------------------------------------------------------
async function getGameList() {
    const list = [];

    // 1. ITAD 시도
    if (ITAD_API_KEY) {
        console.log("📡 [1단계] ITAD 인기 게임 목록 조회...");
        try {
            const res = await axios.get('https://api.isthereanydeal.com/stats/most-popular/v1', {
                params: { key: ITAD_API_KEY, limit: 60 }, timeout: 5000
            });
            if (res.data) res.data.forEach(g => list.push({ id: g.id, title: g.title, source: 'itad' }));
            console.log(`✅ ITAD 목록: ${list.length}개`);
        } catch (e) { console.log("⚠️ ITAD 목록 조회 실패"); }
    }

    // 2. Steam 시도 (ITAD 실패 혹은 부족 시)
    if (list.length === 0) {
        console.log("🔄 [2단계] Steam 인기 차트 조회...");
        try {
            const res = await axios.get('https://api.steampowered.com/ISteamChartsService/GetGamesByConcurrentPlayers/v1/');
            const ranks = res.data?.response?.ranks || [];
            ranks.forEach(r => list.push({ id: r.appid, source: 'steam' }));
            console.log(`✅ Steam 목록: ${list.length}개`);
        } catch (e) { console.log("⚠️ Steam 차트 조회 실패"); }
    }
    
    return list;
}

// ---------------------------------------------------------
// [C] 메인 수집 로직
// ---------------------------------------------------------
async function collectGamesData() {
  if (!MONGODB_URI) return console.error("❌ MONGODB_URI 없음");
  await mongoose.connect(MONGODB_URI);
  console.log("✅ DB 연결 성공. 데이터 수집 시작...");

  const gameList = await getGameList();
  if (gameList.length === 0) return console.log("❌ 수집할 게임이 없습니다.");

  let count = 0;
  for (const item of gameList) {
      try {
          await sleep(1500);
          let steamAppId = null;
          let gameTitle = item.title;

          // ★ [핵심 수정] ITAD ID(UUID)라면 -> Steam ID(숫자)로 변환
          if (item.source === 'itad') {
              try {
                  const infoRes = await axios.get('https://api.isthereanydeal.com/games/info/v2', {
                      params: { key: ITAD_API_KEY, id: item.id }
                  });
                  steamAppId = infoRes.data?.appid; // 여기서 스팀 ID 획득!
                  gameTitle = infoRes.data?.title || gameTitle;
              } catch (e) {
                  // console.log(`   ⚠️ ITAD Info 조회 실패 (${item.id})`);
                  continue; // 스팀 ID 못 구하면 패스
              }
          } else {
              steamAppId = item.id; // 스팀 소스면 그대로 사용
          }

          if (!steamAppId) continue;

          // 1. Steam 상세 정보
          const steamRes = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${steamAppId}&l=korean&cc=kr`);
          if (!steamRes.data[steamAppId]?.success) continue;
          const data = steamRes.data[steamAppId].data;
          if (data.type !== 'game') continue;

          // 2. ITAD 가격 정보 (옵션)
          let priceInfo = {
              regular_price: data.price_overview ? data.price_overview.initial / 100 : 0,
              current_price: data.price_overview ? data.price_overview.final / 100 : 0,
              discount_percent: data.price_overview ? data.price_overview.discount_percent : 0,
              store_url: `https://store.steampowered.com/app/${steamAppId}`,
              store_name: 'Steam',
              isFree: data.is_free === true,
              deals: []
          };
          
          if (ITAD_API_KEY) {
              try {
                  // v2 Lookup (Steam ID -> Plain -> Prices)
                  const lookup = await axios.get('https://api.isthereanydeal.com/games/lookup/v1', {
                      params: { key: ITAD_API_KEY, appid: steamAppId, shop: 'steam' }
                  });
                  const plain = lookup.data?.game?.plain;
                  if (plain) {
                      const prices = await axios.get('https://api.isthereanydeal.com/games/prices/v2', {
                          params: { key: ITAD_API_KEY, plains: plain, country: 'KR' }
                      });
                      const best = prices.data?.[plain]?.list?.[0];
                      if (best) {
                          priceInfo.current_price = best.price_new;
                          priceInfo.regular_price = best.price_old;
                          priceInfo.discount_percent = best.price_cut;
                          priceInfo.store_name = best.shop.name;
                          priceInfo.url = best.url;
                          priceInfo.deals = prices.data[plain].list.map(d => ({
                              shopName: d.shop.name, price: d.price_new, regularPrice: d.price_old, discount: d.price_cut, url: d.url
                          }));
                      }
                  }
              } catch (e) {}
          }

          // 3. 트렌드 (트위치/치지직)
          const cleanName = (data.name || gameTitle).replace(/[^a-zA-Z0-9가-힣\s]/g, '');
          const [twitchView, chzzkView] = await Promise.all([
              getTwitchStats(cleanName),
              getChzzkStats(cleanName)
          ]);
          const trendScore = twitchView + (chzzkView * 2);

          // 4. 태그 & 메타데이터
          const rawTags = [];
          if (data.genres) rawTags.push(...data.genres.map(g => g.description));
          if (data.categories) rawTags.push(...data.categories.map(c => c.description));
          const smartTags = new Set();
          rawTags.forEach(t => {
              const lower = t.toLowerCase();
              for (const key in TAG_MAP) { if (lower.includes(key)) smartTags.add(TAG_MAP[key]); }
          });

          // 날짜 파싱
          let releaseDate = new Date();
          if (data.release_date?.date) {
             const dStr = data.release_date.date;
             if(dStr.includes('년')) {
                 const p = dStr.replace(/일/g,'').split(/년|월/).map(s=>s.trim());
                 if(p.length>=3) releaseDate = new Date(`${p[0]}-${p[1]}-${p[2]}`);
             } else {
                 const p = new Date(dStr);
                 if(!isNaN(p)) releaseDate = p;
             }
          }

          // HLTB
          let playTime = "정보 없음";
          try {
             const hltbRes = await hltbService.search(cleanName);
             if(hltbRes.length > 0) playTime = `${hltbRes[0].gameplayMain} 시간`;
          } catch(e){}

          // DB 저장
          const gameDoc = {
              slug: `steam-${steamAppId}`,
              steam_appid: steamAppId,
              title: data.name,
              title_ko: data.name,
              main_image: data.header_image,
              description: data.short_description,
              smart_tags: Array.from(smartTags),
              
              trend_score: trendScore,
              twitch_viewers: twitchView,
              chzzk_viewers: chzzkView,
              
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

          await Game.findOneAndUpdate({ steam_appid: steamAppId }, gameDoc, { upsert: true });
          count++;
          console.log(`[${count}] 저장: ${data.name} (트렌드: ${trendScore})`);

      } catch (err) {
          console.error(`❌ 실패 (${item.id}): ${err.message}`);
      }
  }
  console.log(`✅ 수집 완료: 총 ${count}개`);
  process.exit(0);
}

collectGamesData();