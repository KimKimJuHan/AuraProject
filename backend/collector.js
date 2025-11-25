require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('./models/Game');
// GameCategory 모델 파일이 필요합니다. (없으면 아래에서 생성)
const GameCategory = require('./models/GameCategory'); 
const hltb = require('howlongtobeat');
const hltbService = new hltb.HowLongToBeatService();

const { MONGODB_URI, ITAD_API_KEY, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, CHZZK_CLIENT_ID, CHZZK_CLIENT_SECRET } = process.env;

// 환경변수 체크
if (!ITAD_API_KEY) {
    console.error("🚨 ITAD_API_KEY 누락. 수집을 중단합니다.");
    process.exit(1);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 트위치 토큰 관리
let twitchToken = null;
async function getTwitchToken() {
    if (!TWITCH_CLIENT_ID) return;
    try {
        const res = await axios.post('https://id.twitch.tv/oauth2/token', null, {
            params: { client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' }
        });
        twitchToken = res.data.access_token;
    } catch (e) { console.error("⚠️ Twitch Token 갱신 실패"); }
}

// 태그 매핑 (기존 유지)
const TAG_MAP = {
  'rpg': 'RPG', 'role-playing': 'RPG', 'action': '액션', 'fps': 'FPS', 'simulation': '시뮬레이션', 
  'strategy': '전략', 'sports': '스포츠', 'racing': '레이싱', 'puzzle': '퍼즐', 'survival': '생존', 
  'horror': '공포', 'adventure': '어드벤처', 'open world': '오픈 월드', 'co-op': '협동',
  'multiplayer': '멀티플레이', 'roguelike': '로그라이크', 'souls-like': '소울라이크', 'story rich': '스토리 중심'
};

function translateTags(tags) {
    if (!tags || !Array.isArray(tags)) return [];
    const myTags = new Set();
    tags.forEach(t => {
        const lower = t.toLowerCase();
        for (const key in TAG_MAP) { if (lower.includes(key)) myTags.add(TAG_MAP[key]); }
    });
    return Array.from(myTags);
}

// ---------------------------------------------------------
// [A] 트렌드 데이터 (DB 매핑 기반)
// ---------------------------------------------------------
async function getTrendStats(steamAppId) {
    // 1. DB에서 미리 저장된 매핑 정보 조회
    const mapping = await GameCategory.findOne({ steamAppId });
    
    let twitchView = 0;
    let chzzkView = 0;

    // 2. 트위치 조회 (ID가 있으면 검색 없이 바로 조회)
    if (mapping?.twitch?.id) {
        if (!twitchToken) await getTwitchToken();
        try {
            const res = await axios.get('https://api.twitch.tv/helix/streams', {
                headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchToken}` },
                params: { game_id: mapping.twitch.id, first: 100 }
            });
            twitchView = res.data.data.reduce((acc, s) => acc + s.viewer_count, 0);
        } catch (e) { /* 조용히 넘어감 */ }
    }

    // 3. 치지직 조회 (저장된 정확한 키워드로 검색)
    if (mapping?.chzzk?.categoryValue) {
        try {
            const keyword = encodeURIComponent(mapping.chzzk.categoryValue);
            // 검색 API 사용 (이미 검증된 키워드라 정확도 높음)
            const res = await axios.get(`https://api.chzzk.naver.com/service/v1/search/lives?keyword=${keyword}&offset=0&size=50&sortType=POPULAR`, {
                headers: { 
                    'User-Agent': 'Mozilla/5.0',
                    ...(CHZZK_CLIENT_ID && { 'Client-Id': CHZZK_CLIENT_ID, 'Client-Secret': CHZZK_CLIENT_SECRET })
                }
            });
            
            const lives = res.data?.content?.data || [];
            const target = mapping.chzzk.categoryValue.replace(/\s/g, ''); // 공백 제거 비교
            
            lives.forEach(item => {
                const live = item.live;
                if (!live) return;
                const cat = (live.liveCategoryValue || "").replace(/\s/g, '');
                // 카테고리가 매핑된 키워드와 일치하거나 포함되면 집계
                if (cat.includes(target) || target.includes(cat)) {
                    chzzkView += live.concurrentUserCount || 0;
                }
            });
        } catch (e) { /* 조용히 넘어감 */ }
    }

    return { twitch: twitchView, chzzk: chzzkView };
}

// ---------------------------------------------------------
// [B] ITAD 로직 (기존 유지)
// ---------------------------------------------------------
async function fetchITADData(steamAppId) {
    try {
        const lookupRes = await axios.get(`https://api.isthereanydeal.com/games/lookup/v1?key=${ITAD_API_KEY}&appid=${steamAppId}`, { timeout: 5000 });
        if (!lookupRes.data?.found) return null;
        
        const pricesRes = await axios.post(`https://api.isthereanydeal.com/games/prices/v3?key=${ITAD_API_KEY}&country=KR`, 
            [lookupRes.data.game.id], 
            { headers: { 'Content-Type': 'application/json' }, timeout: 5000 }
        );
        
        const gameData = pricesRes.data?.[0];
        if (!gameData) return null;
        
        const deals = (gameData.deals || []).sort((a, b) => a.price.amount - b.price.amount);
        const best = deals[0] || {};

        return {
            current_price: best.price?.amount ?? 0,
            regular_price: best.regular?.amount ?? 0,
            discount_percent: best.cut ?? 0,
            deals: deals.map(d => ({ shopName: d.shop?.name, price: d.price?.amount, url: d.url })),
            historical_low: gameData.historyLow?.price?.amount || 0
        };
    } catch (e) { return null; }
}

// ---------------------------------------------------------
// [C] 메인 수집 로직
// ---------------------------------------------------------
async function collectGamesData() {
    if (!MONGODB_URI) return;
    await mongoose.connect(MONGODB_URI);
    console.log("✅ DB Connected. 수집 시작...");

    // 1. 수집 대상 선정 (GameCategory에 등록된 게임들 우선)
    // (처음엔 데이터가 없을 수 있으니 Steam Top Chart도 병행 가능하지만, 여기선 매핑된 것 위주로)
    const mappings = await GameCategory.find({});
    let targetAppIds = mappings.map(m => m.steamAppId);

    // 만약 매핑된 게 하나도 없다면? -> 안전장치로 기본 목록 사용
    if (targetAppIds.length === 0) {
        console.log("⚠️ 매핑된 게임 없음. 기본 목록 사용");
        targetAppIds = [1623730, 578080, 570, 730, 271590, 359550, 1086940]; 
    }
    
    console.log(`🎯 수집 대상: ${targetAppIds.length}개`);

    let count = 0;
    for (const appid of targetAppIds) {
        try {
            await sleep(1500); // 딜레이

            // 스팀 정보
            const steamRes = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=korean&cc=kr`);
            const data = steamRes.data[appid]?.data;
            if (!data) continue;

            // 트렌드 조회 (DB 매핑 활용 -> 속도/정확도 UP)
            const trends = await getTrendStats(appid);
            const trendScore = trends.twitch + trends.chzzk;

            // 가격 정보
            let priceInfo = {
                regular_price: data.price_overview?.initial / 100 || 0,
                current_price: data.price_overview?.final / 100 || 0,
                discount_percent: data.price_overview?.discount_percent || 0,
                store_name: 'Steam', store_url: `https://store.steampowered.com/app/${appid}`,
                isFree: data.is_free, deals: []
            };
            const itadData = await fetchITADData(appid);
            if (itadData) {
                if (!data.is_free && (itadData.current_price < priceInfo.current_price || priceInfo.current_price === 0)) {
                    priceInfo = { ...priceInfo, ...itadData };
                } else {
                    priceInfo.deals = itadData.deals;
                    priceInfo.historical_low = itadData.historical_low;
                }
            }

            // HLTB
            let playTime = "정보 없음";
            // (선택) HLTB 검색도 너무 자주 실패하면 빼거나 try-catch 강화
            try {
                const hltbRes = await hltbService.search(data.name.replace(/[™®©]/g,''));
                if(hltbRes.length > 0) playTime = `${hltbRes[0].gameplayMain} 시간`;
            } catch(e){}

            // DB 저장
            await Game.findOneAndUpdate({ steam_appid: appid }, {
                slug: `steam-${appid}`,
                steam_appid: appid,
                title: data.name,
                // 한글 이름이 매핑되어 있으면 그걸 우선 사용 (치지직 검색어 등 활용)
                title_ko: (mappings.find(m=>m.steamAppId===appid)?.chzzk?.categoryValue) || data.name,
                main_image: data.header_image,
                description: data.short_description,
                smart_tags: translateTags([...(data.genres||[]).map(g=>g.description), ...(data.categories||[]).map(c=>c.description)]),
                trend_score: trendScore,
                twitch_viewers: trends.twitch,
                chzzk_viewers: trends.chzzk,
                price_info: priceInfo,
                releaseDate: data.release_date?.date ? new Date(data.release_date.date.replace(/년|월|일/g, '-')) : new Date(),
                screenshots: data.screenshots?.map(s=>s.path_full)||[],
                trailers: data.movies?.map(m=>m.webm?.max)||[],
                metacritic_score: data.metacritic?.score || 0,
                play_time: playTime
            }, { upsert: true });

            count++;
            console.log(`✅ [${count}] ${data.name} (Tw: ${trends.twitch} | Chzzk: ${trends.chzzk})`);

        } catch (e) { 
            console.error(`❌ Error ${appid}: ${e.message}`); 
        }
    }
    console.log("🎉 수집 완료");
    process.exit(0);
}

collectGamesData();