require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('./models/Game'); 
const hltb = require('howlongtobeat');
const hltbService = new hltb.HowLongToBeatService();

// 1. 환경변수 확인
const { 
    MONGODB_URI, 
    STEAM_API_KEY, 
    TWITCH_CLIENT_ID, 
    TWITCH_CLIENT_SECRET,
    CHZZK_CLIENT_ID,
    CHZZK_CLIENT_SECRET
} = process.env;

if (!MONGODB_URI) { console.error("❌ MONGODB_URI가 없습니다."); process.exit(1); }

const AXIOS_CONF = {
    headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json'
    },
    timeout: 10000 
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const TAG_MAP = {
  'rpg': 'RPG', 'action': '액션', 'fps': 'FPS', 'simulation': '시뮬레이션', 'strategy': '전략',
  'adventure': '어드벤처', 'indie': '인디', 'casual': '캐주얼', 'open world': '오픈월드',
  'massively multiplayer': 'MMO', 'puzzle': '퍼즐', 'racing': '레이싱', 'sports': '스포츠'
};

// --- Twitch ---
let twitchToken = null;
async function getTwitchToken() {
    if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) return null;
    try {
        const res = await axios.post('https://id.twitch.tv/oauth2/token', null, {
            params: {
                client_id: TWITCH_CLIENT_ID,
                client_secret: TWITCH_CLIENT_SECRET,
                grant_type: 'client_credentials'
            }
        });
        twitchToken = res.data.access_token;
        // console.log("🟣 Twitch 토큰 발급 완료");
    } catch (e) { console.error("Twitch Token Error:", e.message); }
}

async function getTwitchViewers(gameName) {
    if (!twitchToken) return 0;
    try {
        const gameRes = await axios.get('https://api.twitch.tv/helix/games', {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchToken}` },
            params: { name: gameName }
        });
        const gameData = gameRes.data.data[0];
        if (!gameData) return 0;

        const streamRes = await axios.get('https://api.twitch.tv/helix/streams', {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchToken}` },
            params: { game_id: gameData.id, first: 100 }
        });
        
        return streamRes.data.data.reduce((sum, s) => sum + s.viewer_count, 0);
    } catch (e) { return 0; }
}

// --- Chzzk ---
async function getChzzkViewers(gameName) {
    if (!CHZZK_CLIENT_ID || !CHZZK_CLIENT_SECRET) return 0;
    try {
        const url = 'https://openapi.chzzk.naver.com/open/v1/categories/search';
        const res = await axios.get(url, {
            headers: {
                'Client-Id': CHZZK_CLIENT_ID,
                'Client-Secret': CHZZK_CLIENT_SECRET,
                'Content-Type': 'application/json'
            },
            params: { query: gameName, size: 1 }
        });
        if (res.data?.content?.data?.length > 0) return 1000; 
        return 0;
    } catch (e) { return 0; }
}

// --- Steam List ---
async function getSteamTopGames() {
    try {
        // Steam Featured API
        const res = await axios.get('https://store.steampowered.com/api/featuredcategories?l=korean&cc=kr');
        const ids = new Set();
        
        const categories = ['0', '1', '2']; 
        categories.forEach(key => {
            if(res.data[key]?.items) {
                res.data[key].items.forEach(item => {
                    if(item.id) ids.add(item.id); // ID 있는 것만 추가
                });
            }
        });
        
        // 비상용 하드코딩 ID (API 실패시 대비)
        [1091500, 2357570, 570, 730, 578080, 1172470, 1245620, 271590, 359550, 292030, 105600].forEach(id => ids.add(id));
        
        return Array.from(ids);
    } catch (e) {
        console.error("Steam List Error:", e.message);
        return [1091500, 2357570, 570, 730]; 
    }
}

// --- Main Collector ---
async function collectGamesData() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ DB 연결 성공. 수집 시작...");

  await getTwitchToken();

  const appIds = await getSteamTopGames();
  // undefined 제거
  const validAppIds = appIds.filter(id => id !== undefined && id !== null);
  
  console.log(`🎯 수집 대상: ${validAppIds.length}개`);

  let count = 0;
  for (const appid of validAppIds) {
      try {
          await sleep(1500); 

          const steamUrl = `https://store.steampowered.com/api/appdetails?appids=${appid}&l=korean&cc=kr`;
          const steamRes = await axios.get(steamUrl);
          
          if (!steamRes.data[appid]?.success) continue;
          const data = steamRes.data[appid].data;
          if (data.type !== 'game') continue;

          // 트렌드 수집
          const cleanName = data.name.replace(/[^a-zA-Z0-9가-힣\s]/g, '');
          const [twitchView, chzzkView] = await Promise.all([
              getTwitchViewers(cleanName),
              getChzzkViewers(cleanName)
          ]);

          // 가격 정보
          const priceOverview = data.price_overview;
          const isFree = data.is_free === true;
          let priceInfo = {
              regular_price: 0, current_price: 0, discount_percent: 0,
              store_url: `https://store.steampowered.com/app/${appid}`,
              store_name: 'Steam', isFree, deals: []
          };
          
          if (!isFree && priceOverview) {
              priceInfo.regular_price = priceOverview.initial / 100;
              priceInfo.current_price = priceOverview.final / 100;
              priceInfo.discount_percent = priceOverview.discount_percent;
          }

          // HLTB
          let playTime = "정보 없음";
          try {
            const hltbRes = await hltbService.search(cleanName);
            if(hltbRes.length > 0) playTime = `${hltbRes[0].gameplayMain} 시간`;
          } catch(e){}

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

          // ★ [수정] 날짜 파싱 안전장치
          let safeReleaseDate = new Date();
          if (data.release_date?.date) {
              const parsedDate = new Date(data.release_date.date);
              if (!isNaN(parsedDate.getTime())) {
                  safeReleaseDate = parsedDate;
              }
          }

          const gameDoc = {
              slug: `steam-${appid}`,
              steam_appid: appid,
              title: data.name,
              title_ko: data.name,
              main_image: data.header_image,
              description: data.short_description,
              smart_tags: Array.from(smartTags),
              twitch_viewers: twitchView,
              chzzk_viewers: chzzkView,
              trend_score: twitchView + (chzzkView * 2),
              
              pc_requirements: {
                  minimum: data.pc_requirements?.minimum || "정보 없음",
                  recommended: data.pc_requirements?.recommended || "권장 사양 정보 없음"
              },
              popularity: data.recommendations?.total || 0,
              releaseDate: safeReleaseDate, // 수정된 안전한 날짜 사용
              price_info: priceInfo,
              screenshots: data.screenshots?.map(s => s.path_full) || [],
              trailers: data.movies?.map(m => m.webm?.max) || [],
              play_time: playTime,
              metacritic_score: data.metacritic?.score || 0
          };

          await Game.findOneAndUpdate({ steam_appid: appid }, gameDoc, { upsert: true });
          count++;
          console.log(`[${count}] 저장 완료: ${data.name} (날짜: ${safeReleaseDate.toLocaleDateString()})`);

      } catch (err) {
          console.error(`❌ ${appid} 실패: ${err.message}`);
      }
  }
  console.log("✅ 수집 완료");
  process.exit(0);
}

collectGamesData();