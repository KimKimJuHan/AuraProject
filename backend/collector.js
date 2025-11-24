require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('./models/Game'); 
const hltb = require('howlongtobeat');
const hltbService = new hltb.HowLongToBeatService();

// 1. 환경변수
const { MONGODB_URI, ITAD_API_KEY, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, CHZZK_CLIENT_ID, CHZZK_CLIENT_SECRET, STEAM_API_KEY } = process.env;

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
  'open world': '오픈월드', 'open-world': '오픈월드',
  'story rich': '스토리 중심', 'narrative': '스토리 중심', 'visual novel': '스토리 중심',
  'choices matter': '선택의 중요성',
  'co-op': '협동', 'multiplayer': '협동', 'online co-op': '협동', 'local co-op': '협동',
  'competitive': '경쟁', 'pvp': 'PvP', 'esports': '경쟁',
  'souls-like': '소울라이크', 'difficult': '소울라이크', 'metroidvania': '소울라이크',
  'roguelike': '로그라이크', 'roguelite': '로그라이크'
};

// ---------------------------------------------------------
// [A] 트렌드 데이터 (Twitch & Chzzk)
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
        return res.data?.content?.data?.length > 0 ? 1000 : 0;
    } catch (e) { return 0; }
}

// ---------------------------------------------------------
// [B] ITAD 로직 (Lookup -> Overview)
// ---------------------------------------------------------
async function fetchITADData(steamAppId) {
    if (!ITAD_API_KEY) return null;
    
    try {
        // 1. Lookup: Steam AppID로 ITAD UUID 찾기
        // 문서: GET /games/lookup/v1?key={key}&appid={steamAppId}
        const lookupRes = await axios.get('https://api.isthereanydeal.com/games/lookup/v1', {
            params: { key: ITAD_API_KEY, appid: steamAppId },
            timeout: 5000
        });

        if (!lookupRes.data?.found || !lookupRes.data.game?.id) {
            // console.log(`   ⚠️ ITAD: 게임을 찾을 수 없음 (SteamID: ${steamAppId})`);
            return null;
        }

        const itadUuid = lookupRes.data.game.id;

        // 2. Overview: UUID로 가격 정보 조회
        // 문서: POST /games/overview/v2?key={key}&country=KR
        const overviewRes = await axios.post(
            `https://api.isthereanydeal.com/games/overview/v2?key=${ITAD_API_KEY}&country=KR`,
            [itadUuid], // Body에 배열로 UUID 전달
            { headers: { 'Content-Type': 'application/json' }, timeout: 5000 }
        );

        const priceData = overviewRes.data?.prices?.[0]; // 첫 번째 결과
        if (!priceData) return null;

        // 데이터 포맷팅
        return {
            current_price: priceData.price.amount,
            regular_price: priceData.regular.amount,
            discount_percent: priceData.cut,
            store_name: priceData.shop.name,
            url: priceData.url,
            deals: [] // Overview API는 단일 최저가 위주이므로 deals 배열은 비워두거나 별도 처리
        };

    } catch (e) {
        console.error(`   ❌ ITAD 요청 실패 (SteamID: ${steamAppId}): ${e.message}`);
        if (e.response?.status === 400) {
            console.error("      -> Bad Request: 요청 형식이 잘못되었습니다.");
        }
        return null;
    }
}

// ---------------------------------------------------------
// [C] 메인 수집 로직 (Steam Top List -> Detail -> ITAD Price)
// ---------------------------------------------------------
async function getSteamTopGames() {
    const ids = new Set();
    try {
        const res = await axios.get('https://store.steampowered.com/api/featuredcategories?l=english&cc=kr');
        ['0', '1', '3'].forEach(key => {
            if(res.data[key]?.items) res.data[key].items.forEach(item => ids.add(item.id));
        });
    } catch (e) { console.log("⚠️ Steam API 실패 (백업 목록 사용)"); }

    // 백업 목록 (인기 게임)
    [1091500, 2357570, 570, 730, 578080, 1172470, 1245620, 271590, 359550, 292030, 105600, 1086940].forEach(id => ids.add(id));
    return Array.from(ids);
}

async function collectGamesData() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ DB 연결 성공. 수집 시작...");

  const appIds = await getSteamTopGames();
  const validAppIds = appIds.filter(id => id && !isNaN(id)); // 숫자 ID만 필터링
  console.log(`🎯 수집 대상: ${validAppIds.length}개`);

  let count = 0;
  for (const appid of validAppIds) {
      try {
          await sleep(1500);

          // 1. Steam 상세 정보
          const steamRes = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=korean&cc=kr`);
          if (!steamRes.data[appid]?.success) continue;
          const data = steamRes.data[appid].data;
          if (data.type !== 'game') continue;

          // 2. ITAD 가격 정보 조회 (Lookup -> Overview 흐름 적용)
          const itadPrice = await fetchITADData(appid);

          // 가격 정보 결정 (ITAD 우선, 없으면 Steam)
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

          if (itadPrice) {
              priceInfo = {
                  ...priceInfo,
                  current_price: itadPrice.current_price,
                  regular_price: itadPrice.regular_price,
                  discount_percent: itadPrice.discount_percent,
                  store_name: itadPrice.store_name,
                  store_url: itadPrice.url
              };
              console.log(`   💰 ITAD 가격 적용: ${data.name} (${itadPrice.store_name})`);
          }

          // 3. 트렌드 (Twitch/Chzzk)
          const cleanName = data.name.replace(/[^a-zA-Z0-9가-힣\s]/g, '');
          const [twitchView, chzzkView] = await Promise.all([
              getTwitchStats(cleanName),
              getChzzkStats(cleanName)
          ]);
          const trendScore = twitchView + (chzzkView * 2);

          // 4. 태그 매핑
          const rawTags = [];
          if(data.genres) rawTags.push(...data.genres.map(g=>g.description));
          if(data.categories) rawTags.push(...data.categories.map(c=>c.description));
          const smartTags = new Set();
          rawTags.forEach(t => {
              const lower = t.toLowerCase();
              for (const key in TAG_MAP) { if (lower.includes(key)) smartTags.add(TAG_MAP[key]); }
          });

          // 5. 날짜 파싱
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

          // 6. HLTB
          let playTime = "정보 없음";
          try {
             const hltbRes = await hltbService.search(cleanName);
             if(hltbRes.length > 0) playTime = `${hltbRes[0].gameplayMain} 시간`;
          } catch(e){}

          // DB 저장
          const gameDoc = {
              slug: `steam-${appid}`,
              steam_appid: appid,
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

          await Game.findOneAndUpdate({ steam_appid: appid }, gameDoc, { upsert: true });
          count++;
          console.log(`[${count}] 저장: ${data.name}`);

      } catch (err) {
          console.error(`❌ 실패 (${appid}): ${err.message}`);
      }
  }
  console.log(`✅ 수집 완료: 총 ${count}개`);
  process.exit(0);
}

collectGamesData();