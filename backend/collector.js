require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('./models/Game');
const GameCategory = require('./models/GameCategory'); // 트렌드 족보
const GameMetadata = require('./models/GameMetadata'); // 가격 족보
const hltb = require('howlongtobeat');
const hltbService = new hltb.HowLongToBeatService();

const { MONGODB_URI, ITAD_API_KEY, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, CHZZK_CLIENT_ID, CHZZK_CLIENT_SECRET } = process.env;

if (!ITAD_API_KEY) { console.error("🚨 ITAD_API_KEY 누락"); process.exit(1); }

const sleep = (ms) => new Promise(r => setTimeout(r, 1500)); // Sleep 시간을 1500ms로 유지

// --- [트위치 토큰] ---
let twitchToken = null;
async function getTwitchToken() {
    if (!TWITCH_CLIENT_ID) return;
    try {
        const res = await axios.post('https://id.twitch.tv/oauth2/token', null, {
            params: { client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' }
        });
        twitchToken = res.data.access_token;
    } catch (e) { console.error("⚠️ Twitch Token Error"); }
}

// --- [태그 매핑] ---
const TAG_MAP = {
  'rpg': 'RPG', 'role-playing': 'RPG', 'action': '액션', 'fps': 'FPS', 'simulation': '시뮬레이션', 
  'strategy': '전략', 'sports': '스포츠', 'racing': '레이싱', 'puzzle': '퍼즐', 'survival': '생존', 
  'horror': '공포', 'adventure': '어드벤처', 'open world': '오픈 월드', 'co-op': '협동',
  'multiplayer': '멀티플레이', 'roguelike': '로그라이크', 'souls-like': '소울라이크', 'story rich': '스토리 중심'
};
function translateTags(tags) {
    if (!tags) return [];
    const myTags = new Set();
    tags.forEach(t => {
        const lower = t.toLowerCase();
        for (const key in TAG_MAP) { if (lower.includes(key)) myTags.add(TAG_MAP[key]); }
    });
    return Array.from(myTags);
}

// --- [A. 트렌드 조회] ---
async function getTrendStats(steamAppId) {
    const mapping = await GameCategory.findOne({ steamAppId });
    let twitch = { value: 0, status: 'fail' }; 
    let chzzk = { value: 0, status: 'fail' };

    // 트위치
    if (mapping?.twitch?.id) {
        if (!twitchToken) await getTwitchToken();
        try {
            const res = await axios.get('https://api.twitch.tv/helix/streams', {
                headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchToken}` },
                params: { game_id: mapping.twitch.id, first: 100 }
            });
            const viewers = res.data.data.reduce((acc, s) => acc + s.viewer_count, 0);
            twitch = { value: viewers, status: 'ok' };
        } catch (e) {}
    }

    // 치지직
    if (mapping?.chzzk?.categoryValue) {
        try {
            const keyword = encodeURIComponent(mapping.chzzk.categoryValue);
            const res = await axios.get(`https://api.chzzk.naver.com/service/v1/search/lives?keyword=${keyword}&offset=0&size=50&sortType=POPULAR`, {
                headers: { 
                    'User-Agent': 'Mozilla/5.0',
                    ...(CHZZK_CLIENT_ID && { 'Client-Id': CHZZK_CLIENT_ID, 'Client-Secret': CHZZK_CLIENT_SECRET })
                }
            });
            const lives = res.data?.content?.data || [];
            const target = mapping.chzzk.categoryValue.replace(/\s/g, ''); 
            let viewers = 0;
            lives.forEach(item => {
                const live = item.live;
                if (!live) return;
                const cat = (live.liveCategoryValue || "").replace(/\s/g, '');
                if (cat.includes(target) || target.includes(cat)) {
                    viewers += live.concurrentUserCount || 0;
                }
            });
            chzzk = { value: viewers, status: 'ok' };
        } catch (e) {}
    }
    return { twitch, chzzk };
}

function calculateWeightedScore(trends) {
    const { twitch, chzzk } = trends;
    if (twitch.status === 'ok' && chzzk.status === 'ok') return twitch.value + chzzk.value;
    if (twitch.status === 'ok') return twitch.value * 2;
    if (chzzk.status === 'ok') return chzzk.value * 2;
    return 0;
}

// --- [B. 가격 조회 Helpers (모듈화)] ---

// ITAD 가격 조회 헬퍼 함수 (최우선)
async function getITADPrice(steamAppId) {
    const metadata = await GameMetadata.findOne({ steamAppId });
    if (!metadata?.itad?.uuid) return null;

    try {
        const pricesRes = await axios.post(`https://api.isthereanydeal.com/games/prices/v3?key=${ITAD_API_KEY}&country=KR`, 
            [metadata.itad.uuid], { headers: { 'Content-Type': 'application/json' }, timeout: 5000 });
        
        const itadGame = pricesRes.data?.[0];
        if (itadGame) {
            const deals = (itadGame.deals || []).sort((a, b) => a.price.amount - b.price.amount);
            
            const dealsMapped = deals.map(d => ({ 
                shopName: d.shop?.name, price: d.price?.amount, regularPrice: d.regular?.amount, discount: d.cut, url: d.url 
            }));
            
            const historical_low = itadGame.historyLow?.price?.amount || 0;
            const bestDeal = deals[0];

            if (bestDeal) {
                return {
                    regular_price: bestDeal.regular.amount,
                    current_price: bestDeal.price.amount,
                    discount_percent: bestDeal.cut,
                    historical_low: historical_low,
                    deals: dealsMapped,
                };
            }
        }
    } catch (e) {
        // console.error(`⚠️ ITAD Price Error for ${steamAppId}: ${e.message}`); // 로깅은 주석 처리하여 깔끔하게 유지
    }
    return null;
}

// Steam 패키지 가격 조회 헬퍼 함수
async function getSteamPackagePrice(packageId) {
    try {
        const pkgRes = await axios.get(`https://store.steampowered.com/api/packagedetails?packageids=${packageId}&l=korean&cc=kr`);
        const pkgData = pkgRes.data[packageId]?.data;
        if (pkgData?.price) {
            return {
                regular_price: pkgData.price.initial / 100,
                current_price: pkgData.price.final / 100,
                discount_percent: pkgData.price.discount_percent,
            };
        }
    } catch (e) {
        // 패키지 조회 오류는 무시하고 null 반환
    }
    return null;
}


// --- [B. 가격 조회 (Alias + 3단계 폴백 시스템 적용)] ---
async function fetchPriceInfo(originalAppId, initialSteamData) {
    
    // 1. 메타데이터 조회 및 후보 AppID 목록 구성
    const metadata = await GameMetadata.findOne({ steamAppId: originalAppId });
    // 원래 AppID를 포함하고, aliasAppIds를 순차적으로 포함하는 후보 목록
    const candidateIds = [originalAppId, ...(metadata?.aliasAppIds || [])].filter(id => id); 

    let steamData = initialSteamData;

    // 2. 후보 AppID 순회하며 가격 조회 시도 (ITAD -> Price Overview -> Package)
    for (const currentAppId of candidateIds) {
        
        // (A) alias AppID인 경우 Steam API로 최신 데이터 다시 조회
        if (currentAppId !== originalAppId) {
            try {
                // alias AppID로 스팀 API를 호출하여 최신 steamData를 가져옴
                const res = await axios.get(`https://store.steampowered.com/api/appdetails`, {
                    params: { appids: currentAppId, l: 'korean', cc: 'kr' },
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                const fetchedData = res.data?.[currentAppId]?.data;
                if (!fetchedData) continue; // 데이터 없으면 다음 ID 시도
                steamData = fetchedData;
            } catch (e) {
                console.error(`⚠️ Steam alias fetch error for ${currentAppId}: ${e.message}`);
                continue; // 오류 발생해도 다음 ID 시도
            }
        }
        
        // (B) 1단계: ITAD 가격 조회 (가장 정확)
        const itadPrice = await getITADPrice(currentAppId);
        if (itadPrice) {
            // 가격 상속 시에도 store_url은 originalAppId를 따름
            return { 
                regular_price: itadPrice.regular_price,
                current_price: itadPrice.current_price,
                discount_percent: itadPrice.discount_percent,
                historical_low: itadPrice.historical_low,
                deals: itadPrice.deals,
                store_name: 'Steam',
                store_url: `https://store.steampowered.com/app/${originalAppId}`,
                isFree: false
            };
        }

        // (C) 2단계: Steam price_overview 조회 (스팀 정가/할인)
        if (steamData.price_overview) {
            return {
                regular_price: steamData.price_overview.initial / 100,
                current_price: steamData.price_overview.final / 100,
                discount_percent: steamData.price_overview.discount_percent,
                historical_low: 0, deals: [], 
                store_name: 'Steam',
                store_url: `https://store.steampowered.com/app/${originalAppId}`,
                isFree: false
            };
        } 
        
        // (D) 3단계: Steam Package 가격 조회 (단품 가격 없을 때)
        const pkgId = steamData.packages?.[0];
        if (pkgId) {
            const pkgPrice = await getSteamPackagePrice(pkgId);
            if (pkgPrice) {
                 return {
                    regular_price: pkgPrice.regular_price,
                    current_price: pkgPrice.current_price,
                    discount_percent: pkgPrice.discount_percent,
                    historical_low: 0, deals: [],
                    store_name: 'Steam',
                    store_url: `https://store.steampowered.com/app/${originalAppId}`,
                    isFree: false
                };
            }
        }

        // 이 AppID에서 가격을 찾지 못했다면 다음 candidateIds로 넘어감
        // originalAppId에 대해서는 steamData를 유지해야 하므로, 루프가 끝나기 전에 steamData를 초기값으로 복원할 필요는 없음.
        // 현재 로직은 다음 루프에서 if (currentAppId !== originalAppId) 블록이 실행되어 steamData를 업데이트하므로 안전함.
    }
    
    // 3. 최종 폴백 (후보 ID 전체에서 가격을 못 찾은 경우)
    return {
        regular_price: 0, current_price: 0, discount_percent: 0,
        store_name: 'Steam', store_url: `https://store.steampowered.com/app/${originalAppId}`,
        isFree: initialSteamData.is_free === true, // 원래 데이터를 기준으로 무료 여부 판단
        deals: [], historical_low: 0
    };
}

// --- [C. 메인 수집 루프] ---
async function collectGamesData() {
    if (!MONGODB_URI) return;
    await mongoose.connect(MONGODB_URI);
    console.log("✅ DB Connected. 수집 시작...");

    const metadatas = await GameMetadata.find({});
    let targetAppIds = metadatas.map(m => m.steamAppId);

    if (targetAppIds.length === 0) {
        console.log("⚠️ 메타데이터 없음. 기본 목록 사용");
        targetAppIds = [271590, 1623730, 1086940]; 
    }
    
    console.log(`🎯 수집 대상: ${targetAppIds.length}개`);

    let count = 0;
    for (const appid of targetAppIds) {
        try {
            await sleep(1500); 

            // App details를 한 번만 가져옵니다. alias 처리 중에는 fetchPriceInfo 내부에서 다시 호출됩니다.
            const steamRes = await axios.get(`https://store.steampowered.com/api/appdetails`, {
                params: { appids: appid, l: 'korean', cc: 'kr' },
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
            });
            const data = steamRes.data[appid]?.data;
            if (!data) continue;

            const trends = await getTrendStats(appid);
            const trendScore = calculateWeightedScore(trends);
            // 수정된 fetchPriceInfo 호출 (Alias 처리 및 폴백 포함)
            const priceInfo = await fetchPriceInfo(appid, data);

            let playTime = "정보 없음";
            try {
                const hltbRes = await hltbService.search(data.name.replace(/[™®©]/g,''));
                if(hltbRes.length > 0) playTime = `${hltbRes[0].gameplayMain} 시간`;
            } catch(e){}

            const categoryData = await GameCategory.findOne({ steamAppId: appid });

            await Game.findOneAndUpdate({ steam_appid: appid }, {
                slug: `steam-${appid}`,
                steam_appid: appid,
                title: data.name,
                title_ko: categoryData?.chzzk?.categoryValue || data.name,
                main_image: data.header_image,
                description: data.short_description,
                smart_tags: translateTags([...(data.genres||[]).map(g=>g.description), ...(data.categories||[]).map(c=>c.description)]),
                
                trend_score: trendScore,
                twitch_viewers: trends.twitch.status === 'ok' ? trends.twitch.value : 0,
                chzzk_viewers: trends.chzzk.status === 'ok' ? trends.chzzk.value : 0,
                
                price_info: priceInfo,
                releaseDate: data.release_date?.date ? new Date(data.release_date.date.replace(/년|월|일/g, '-')) : new Date(),
                screenshots: data.screenshots?.map(s=>s.path_full)||[],
                trailers: data.movies?.map(m=>m.webm?.max)||[],
                metacritic_score: data.metacritic?.score || 0,
                play_time: playTime
            }, { upsert: true });

            count++;
            console.log(`✅ [${count}] ${data.name} (Price: ${priceInfo.current_price}원 | Trend: ${trendScore})`);

        } catch (e) { console.error(`❌ Error ${appid}: ${e.message}`); }
    }
    console.log("🎉 수집 완료");
    process.exit(0);
}

collectGamesData();