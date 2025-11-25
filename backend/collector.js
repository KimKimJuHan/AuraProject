require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('./models/Game'); 
const hltb = require('howlongtobeat');
const hltbService = new hltb.HowLongToBeatService();

// 1. 환경변수
const { MONGODB_URI, ITAD_API_KEY, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, CHZZK_CLIENT_ID, CHZZK_CLIENT_SECRET } = process.env;

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
// [A] 트렌드 데이터 (Twitch & Chzzk) - ★ 핵심 수정
// ---------------------------------------------------------
let twitchToken = null;

// 토큰 발급
async function getTwitchToken() {
    if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) return;
    try {
        const res = await axios.post('https://id.twitch.tv/oauth2/token', null, {
            params: { client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' }
        });
        twitchToken = res.data.access_token;
    } catch (e) { console.error("Twitch Token Error:", e.message); }
}

// ★ 이름 정제 함수 (꼬리표 제거)
function cleanGameName(name) {
    // 1. 특수문자 제거 (단, 하이픈/콜론은 유지할 수도 있으나 검색 호환성을 위해 공백 치환 추천)
    let cleaned = name.replace(/[™®©]/g, '');
    
    // 2. 불필요한 접미사 제거 (대소문자 무시)
    const suffixes = [
        "Game of the Year Edition", "GOTY", "Complete Edition", "Definitive Edition", 
        "Legacy", "Remastered", "Re-elected", "Director's Cut", "Anniversary Edition",
        "Bonus Content", "Deluxe Edition", "Ultimate Edition", "레거시"
    ];
    
    suffixes.forEach(suffix => {
        const regex = new RegExp(`\\s*${suffix}.*$`, 'gi'); // 해당 단어부터 끝까지 날림
        cleaned = cleaned.replace(regex, '');
    });

    // 3. 괄호 내용 제거 (예: "Witcher 3 (Next Gen)" -> "Witcher 3")
    cleaned = cleaned.replace(/\s*\(.*\)/g, '');

    return cleaned.trim();
}

// ★ 트위치 통계 (검색 API 사용)
async function getTwitchStats(gameName) {
    if (!twitchToken) await getTwitchToken();
    if (!twitchToken) return 0;
    
    const searchName = cleanGameName(gameName);
    
    try {
        // 1. 카테고리 검색 (Fuzzy Search) -> 정확한 게임 ID 찾기
        const searchRes = await axios.get('https://api.twitch.tv/helix/search/categories', {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchToken}` },
            params: { query: searchName, first: 1 } // 가장 유사한 1개만
        });
        
        const foundGame = searchRes.data?.data?.[0];
        if (!foundGame) {
            // console.log(`   ⚠️ Twitch 검색 실패: ${searchName}`);
            return 0;
        }

        // 2. 해당 게임 ID로 스트림 조회
        const streamRes = await axios.get('https://api.twitch.tv/helix/streams', {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchToken}` },
            params: { game_id: foundGame.id, first: 100 }
        });
        
        const viewers = streamRes.data.data.reduce((acc, s) => acc + s.viewer_count, 0);
        // console.log(`   🟣 Twitch Found: "${foundGame.name}" (${viewers}명)`);
        return viewers;
        
    } catch (e) { return 0; }
}

// ★ 치지직 통계
async function getChzzkStats(gameName) {
    if (!CHZZK_CLIENT_ID) return 0;
    const searchName = cleanGameName(gameName);

    try {
        const res = await axios.get('https://openapi.chzzk.naver.com/open/v1/categories/search', {
            headers: { 'Client-Id': CHZZK_CLIENT_ID, 'Client-Secret': CHZZK_CLIENT_SECRET, 'Content-Type': 'application/json' },
            params: { query: searchName, size: 1 }
        });
        // 카테고리가 존재하면 일단 1000점 (실시간 시청자 API가 비공식이라 안전하게 가중치 적용)
        // 만약 정확한 시청자 수를 원하면 비공식 API를 써야 하지만, 차단 위험이 있음.
        return res.data?.content?.data?.length > 0 ? 1000 : 0;
    } catch (e) { return 0; }
}

// ---------------------------------------------------------
// [B] ITAD 로직 (Lookup -> Prices V3)
// ---------------------------------------------------------
async function fetchITADData(steamAppId) {
    if (!ITAD_API_KEY) return null;
    try {
        const lookupRes = await axios.get('https://api.isthereanydeal.com/games/lookup/v1', {
            params: { key: ITAD_API_KEY, appid: steamAppId }, timeout: 5000
        });
        if (!lookupRes.data?.found || !lookupRes.data.game?.id) return null;
        const itadUuid = lookupRes.data.game.id;

        const pricesRes = await axios.post(
            `https://api.isthereanydeal.com/games/prices/v3?key=${ITAD_API_KEY}&country=KR`,
            [itadUuid], 
            { headers: { 'Content-Type': 'application/json' }, timeout: 5000 }
        );

        const gameData = pricesRes.data?.[0];
        if (!gameData) return null;

        const dealsRaw = gameData.deals || [];
        dealsRaw.sort((a, b) => (a.price.amount - b.price.amount));
        const bestDeal = dealsRaw[0] || {};

        const deals = dealsRaw.map(d => ({
             shopName: d.shop?.name || "Digital Store",
             price: d.price?.amount ?? 0,
             regularPrice: d.regular?.amount ?? 0,
             discount: d.cut ?? 0,
             url: d.url || ""
        }));

        return {
            current_price: bestDeal.price?.amount ?? 0,
            regular_price: bestDeal.regular?.amount ?? 0,
            discount_percent: bestDeal.cut ?? 0,
            store_name: bestDeal.shop?.name || "Store",
            url: bestDeal.url || "",
            historical_low: gameData.historyLow?.price?.amount || 0,
            deals: deals
        };
    } catch (e) { return null; }
}

// ---------------------------------------------------------
// [C] 메인 수집 로직
// ---------------------------------------------------------
async function getSteamTopGames() {
    const ids = new Set();
    console.log("📡 Steam 인기 게임 목록(Top 150) 조회...");
    try {
        const res = await axios.get('https://api.steampowered.com/ISteamChartsService/GetGamesByConcurrentPlayers/v1/');
        const ranks = res.data?.response?.ranks || [];
        ranks.slice(0, 150).forEach(r => ids.add(r.appid));
        console.log(`✅ Steam 차트에서 ${ids.size}개 확보`);
    } catch (e) { console.log("⚠️ Steam 차트 조회 실패 (백업 목록 사용)"); }

    const BACKUP = [
        1091500, 2357570, 570, 730, 578080, 1172470, 1245620, 271590, 359550, 292030, 
        105600, 1086940, 413150, 1966720, 1623730, 230410, 252490, 221100, 440, 550, 
        251570, 945360, 1174180, 397540, 49520, 594650, 892970, 289070, 322330, 242760, 
        1326470, 1203220, 1794680, 1888930, 2074920, 582010, 1446780, 1599340, 433850, 
        381210, 218620, 1272080, 1085660, 286160, 960090, 431960, 1222670, 646570,
        1172620, 1174180, 261550, 281990, 236850
    ];
    BACKUP.forEach(id => ids.add(id));
    return Array.from(ids);
}

async function collectGamesData() {
  if (!MONGODB_URI) return console.error("❌ MONGODB_URI 없음");
  await mongoose.connect(MONGODB_URI);
  console.log("✅ DB 연결 성공. 데이터 수집 시작...");

  const appIds = await getSteamTopGames();
  const validIds = appIds.filter(id => id && !isNaN(id));
  console.log(`🎯 수집 대상: ${validIds.length}개`);

  let count = 0;
  for (const appid of validIds) {
      try {
          await sleep(1000);

          const steamRes = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=korean&cc=kr`);
          if (!steamRes.data[appid]?.success) continue;
          const data = steamRes.data[appid].data;
          if (data.type !== 'game') continue;

          // 1. 가격
          const steamPrice = data.price_overview;
          const isSteamFree = data.is_free === true;
          let priceInfo = {
              regular_price: steamPrice ? steamPrice.initial / 100 : 0,
              current_price: steamPrice ? steamPrice.final / 100 : 0,
              discount_percent: steamPrice ? steamPrice.discount_percent : 0,
              store_url: `https://store.steampowered.com/app/${appid}`,
              store_name: 'Steam',
              isFree: isSteamFree,
              deals: []
          };
          const itadPrice = await fetchITADData(appid);
          if (itadPrice) {
              if (itadPrice.current_price === 0 && !isSteamFree && priceInfo.current_price > 0) {
                  priceInfo.deals = itadPrice.deals;
              } else {
                  priceInfo = { ...priceInfo, ...itadPrice };
              }
          }

          // 2. 트렌드 (이름 정제 후 검색)
          const cleanName = data.name; // 내부에서 cleanGameName 호출함
          const [twitchView, chzzkView] = await Promise.all([
              getTwitchStats(cleanName),
              getChzzkStats(cleanName)
          ]);
          const trendScore = twitchView + (chzzkView * 2);

          // 3. 태그
          const rawTags = [];
          if(data.genres) rawTags.push(...data.genres.map(g=>g.description));
          if(data.categories) rawTags.push(...data.categories.map(c=>c.description));
          const smartTags = new Set();
          rawTags.forEach(t => {
              const lower = t.toLowerCase();
              for (const key in TAG_MAP) { if (lower.includes(key)) smartTags.add(TAG_MAP[key]); }
          });

          // 4. 날짜
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

          // 5. HLTB
          let playTime = "정보 없음";
          try {
             const hltbRes = await hltbService.search(cleanGameName(cleanName));
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
          console.log(`[${count}] 저장: ${data.name} (트렌드: ${trendScore})`);

      } catch (err) {
          // console.error(`❌ 실패 (${appid})`);
      }
  }
  console.log(`✅ 수집 완료: 총 ${count}개`);
  process.exit(0);
}

collectGamesData();