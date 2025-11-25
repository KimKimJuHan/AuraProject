require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('./models/Game');
const GameCategory = require('./models/GameCategory'); // 트렌드 족보
const GameMetadata = require('./models/GameMetadata'); // 가격 족보
// ★ 추가된 History 모델 로드
const PriceHistory = require('./models/PriceHistory'); 
const TrendHistory = require('./models/TrendHistory');
const SaleHistory = require('./models/SaleHistory');

const hltb = require('howlongtobeat');
const hltbService = new hltb.HowLongToBeatService();

const { MONGODB_URI, ITAD_API_KEY, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, CHZZK_CLIENT_ID, CHZZK_CLIENT_SECRET } = process.env;

if (!ITAD_API_KEY) { console.error("🚨 ITAD_API_KEY 누락"); process.exit(1); }

const sleep = (ms) => new Promise(r => setTimeout(r, 1500)); 

// ★★★ [가격 수집 성공률 극대화] 강력한 User-Agent 정의 ★★★
const STEAM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
};

// GTA V Enhanced AppID (가격이 있는 ID)
const GTA_ENHANCED_APPID = 271590;
// GTA V Legacy AppID (가격이 없는 ID)
const GTA_LEGACY_APPID = 1221710; 
// GTA V Enhanced 버전의 ITAD UUID (ITAD를 통한 안정적 가격 조회)
const GTA_ITAD_UUID = 'game_v2_f80169116c4f877f24022421713d6d03f0b21a8d';

// 메타데이터가 없는 경우, 임시 Mock 데이터를 반환하는 헬퍼 함수
function getMockMetadata(appId) {
    if (appId === GTA_LEGACY_APPID) {
        return { 
            steamAppId: GTA_LEGACY_APPID, 
            aliasAppIds: [GTA_ENHANCED_APPID],
            itad: { uuid: GTA_ITAD_UUID } 
        };
    }
    if (appId === GTA_ENHANCED_APPID) {
         return { 
            steamAppId: GTA_ENHANCED_APPID, 
            aliasAppIds: [], 
            itad: { uuid: GTA_ITAD_UUID } 
        };
    }
    // 다른 기본 게임들을 위한 임시 ITAD UUID
    if (appId === 1623730) return { steamAppId: 1623730, aliasAppIds: [], itad: { uuid: 'game_v2_6a4f8a848c9d8a39c0f91753c1623730' } };
    if (appId === 1086940) return { steamAppId: 1086940, aliasAppIds: [], itad: { uuid: 'game_v2_f80169116c4f8a39c0f91753c1623730' } };

    return null;
}

// --- [트위치/치지직 로직 생략] ---

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

function calculateWeightedScore(trends) {
    const { twitch, chzzk } = trends;
    if (twitch.status === 'ok' && chzzk.status === 'ok') return twitch.value + chzzk.value;
    if (twitch.status === 'ok') return twitch.value * 2;
    if (chzzk.status === 'ok') return chzzk.value * 2;
    return 0;
}

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


// --- [B. 가격 조회 Helpers] ---

async function getITADPrice(steamAppId, metadata) {
    
    if (!metadata?.itad?.uuid) {
        return null;
    }

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
                console.log(`[ITAD] SUCCESS for ${steamAppId}: ${bestDeal.price.amount} KRW`);
                return {
                    regular_price: bestDeal.regular.amount,
                    current_price: bestDeal.price.amount,
                    discount_percent: bestDeal.cut,
                    historical_low: historical_low,
                    deals: dealsMapped,
                    store_name: bestDeal.shop?.name || 'ITAD Deal', // Deal Store Name 추가
                    store_url: bestDeal.url // Deal URL 추가
                };
            }
        }
    } catch (e) {
        // ITAD 오류는 무시하고 null 반환
    }
    return null;
}

async function getSteamPackagePrice(packageId) {
    try {
        const pkgRes = await axios.get(`https://store.steampowered.com/api/packagedetails`, {
            params: { packageids: packageId, l: 'korean', cc: 'kr' },
            headers: STEAM_HEADERS
        });
        const pkgData = pkgRes.data[packageId]?.data;
        if (pkgData?.price) {
            console.log(`[Package] SUCCESS for package ${packageId}`);
            return {
                regular_price: pkgData.price.initial / 100,
                current_price: pkgData.price.final / 100,
                discount_percent: pkgData.price.discount_percent,
                store_name: 'Steam',
                store_url: `https://store.steampowered.com/sub/${packageId}` // Package URL
            };
        }
    } catch (e) {
        // 패키지 조회 오류는 무시하고 null 반환
    }
    return null;
}


// --- [B. 가격 조회 (Alias + 3단계 폴백 시스템 적용)] ---
async function fetchPriceInfo(originalAppId, initialSteamData) {
    
    let metadata = await GameMetadata.findOne({ steamAppId: originalAppId });
    if (!metadata) {
        metadata = getMockMetadata(originalAppId);
    }
    
    const candidateIds = [originalAppId, ...(metadata?.aliasAppIds || [])].filter(id => id); 

    let steamData = initialSteamData;

    for (const currentAppId of candidateIds) {
        
        if (currentAppId !== originalAppId) {
            try {
                const res = await axios.get(`https://store.steampowered.com/api/appdetails`, {
                    params: { appids: currentAppId, l: 'korean', cc: 'kr' },
                    headers: STEAM_HEADERS
                });
                const fetchedData = res.data?.[currentAppId]?.data;
                if (!fetchedData) continue;
                steamData = fetchedData;
            } catch (e) {
                continue;
            }
        }
        
        let currentMetadata = metadata;
        if (currentAppId !== originalAppId) {
            currentMetadata = await GameMetadata.findOne({ steamAppId: currentAppId }) || getMockMetadata(currentAppId);
        }

        const itadPrice = await getITADPrice(currentAppId, currentMetadata);
        if (itadPrice) {
            return { 
                ...itadPrice,
                store_url: itadPrice.store_url || `https://store.steampowered.com/app/${originalAppId}`,
                store_name: itadPrice.store_name || 'ITAD Deal',
                isFree: false
            };
        }

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
        
        const pkgId = steamData.packages?.[0];
        if (pkgId) {
            const pkgPrice = await getSteamPackagePrice(pkgId);
            if (pkgPrice) {
                 return {
                    ...pkgPrice,
                    historical_low: 0, deals: [],
                    store_name: 'Steam',
                    store_url: pkgPrice.store_url || `https://store.steampowered.com/app/${originalAppId}`,
                    isFree: false
                };
            }
        }
    }
    
    // 3. 최종 폴백 
    return {
        regular_price: 0, current_price: 0, discount_percent: 0,
        store_name: 'Steam', store_url: `https://store.steampowered.com/app/${originalAppId}`,
        isFree: initialSteamData.is_free === true,
        deals: [], historical_low: 0
    };
}


// ★★★ 수정: ITAD API를 사용하여 인기 게임 목록을 가져와 DB에 시드 ★★★
async function fetchTopGamesFromITAD() {
    console.log("🚀 ITAD에서 인기 게임 목록 (상위 150개) 조회 시작...");
    const targetAppIds = [];
    const limit = 150;

    try {
        // 1. ITAD Most Popular 목록 조회 (UUID를 얻기 위함)
        const popularRes = await axios.get(`https://api.isthereanydeal.com/stats/most-popular/v1`, {
            params: { key: ITAD_API_KEY, limit: limit }
        });
        const popularList = popularRes.data || [];

        // 2. 각 게임의 Steam AppID 조회 및 메타데이터 시드
        for (const game of popularList) {
            await sleep(500); 

            try {
                // ITAD Game Info API를 사용하여 ITAD UUID로 Steam AppID 조회
                const infoRes = await axios.get(`https://api.isthereanydeal.com/games/info/v2`, {
                    params: { key: ITAD_API_KEY, id: game.id } // game.id는 ITAD UUID
                });

                const foundGame = infoRes.data;
                const steamAppId = foundGame?.appid; 
                const itadUuid = foundGame?.id;
                const gameTitle = foundGame?.title;
                
                if (steamAppId && itadUuid && gameTitle) {
                    // 3. Steam AppID와 ITAD UUID를 GameMetadata에 미리 저장
                    await GameMetadata.findOneAndUpdate({ steamAppId }, {
                        title: gameTitle,
                        itad: { uuid: itadUuid },
                        lastUpdated: Date.now()
                    }, { upsert: true });
                    targetAppIds.push(steamAppId);
                }
            } catch (e) {
                // console.error(`⚠️ ITAD Lookup Error for ${game.title}: ${e.message}`); // 디버그 로그 제거
            }
        }
        
    } catch (e) {
        console.error("🚨 ITAD Popular Games Fetch Error", e.message);
    }
    
    console.log(`✅ ITAD에서 ${targetAppIds.length}개의 게임 AppID를 DB에 저장 완료.`);
    return targetAppIds;
}

// --- [C. 메인 수집 루프] ---
async function collectGamesData() {
    if (!MONGODB_URI) return;
    await mongoose.connect(MONGODB_URI);
    console.log("✅ DB Connected. 수집 시작...");

    const metadatas = await GameMetadata.find({});
    let targetAppIds = metadatas.map(m => m.steamAppId);

    if (targetAppIds.length === 0) {
        // 하드코딩된 목록 대신 ITAD 인기 게임 목록을 가져오도록 변경
        targetAppIds = await fetchTopGamesFromITAD();
        
        if (targetAppIds.length === 0) {
             console.log("⚠️ ITAD에서 목록을 가져오지 못했습니다. 수집 중단.");
             process.exit(0); // 목록이 없으면 수집 중단
        }
    } 
    
    console.log(`🎯 수집 대상: ${targetAppIds.length}개`);

    let count = 0;
    for (const appid of targetAppIds) {
        try {
            await sleep(1500); 

            // 1. Steam API 호출
            const steamRes = await axios.get(`https://store.steampowered.com/api/appdetails`, {
                params: { appids: appid, l: 'korean', cc: 'kr' },
                headers: STEAM_HEADERS
            });
            const data = steamRes.data[appid]?.data; 

            if (!data) continue; 
            
            // 2. 동적 데이터 수집
            const trends = await getTrendStats(appid);
            const trendScore = calculateWeightedScore(trends);
            const priceInfo = await fetchPriceInfo(appid, data);
            
            let playTime = "정보 없음";
            try {
                const hltbRes = await hltbService.search(data.name.replace(/[™®©]/g,''));
                if(hltbRes.length > 0) playTime = `${hltbRes[0].gameplayMain} 시간`;
            } catch(e){}

            const categoryData = await GameCategory.findOne({ steamAppId: appid });

            // ★★★ 3. 메타데이터 (Game 컬렉션) Upsert: 정적 데이터만 업데이트 ★★★
            await Game.findOneAndUpdate({ steam_appid: appid }, {
                slug: `steam-${appid}`,
                steam_appid: appid,
                title: data.name,
                title_ko: categoryData?.chzzk?.categoryValue || data.name,
                main_image: data.header_image,
                description: data.short_description,
                smart_tags: translateTags([...(data.genres||[]).map(g=>g.description), ...(data.categories||[]).map(c=>c.description)]),
                
                pc_requirements: data.pc_requirements || { minimum: "", recommended: "" },
                releaseDate: data.release_date?.date ? new Date(data.release_date.date.replace(/년|월|일/g, '-')) : new Date(),
                screenshots: data.screenshots?.map(s=>s.path_full)||[],
                trailers: data.movies?.map(m=>m.webm?.max)||[],
                metacritic_score: data.metacritic?.score || 0,
                play_time: playTime,
                // 주의: trend_score, price_info는 Game 모델에서 제거되었으므로 여기에 포함하지 않음.

            }, { upsert: true });

            // ★★★ 4. 동적 데이터 History 컬렉션에 Insert (누적) ★★★
            
            // 4-1. Price History 기록
            await PriceHistory.create({
                steam_appid: appid,
                regular_price: priceInfo.regular_price,
                current_price: priceInfo.current_price,
                discount_percent: priceInfo.discount_percent,
                isFree: priceInfo.isFree,
                historical_low: priceInfo.historical_low,
            });

            // 4-2. Trend History 기록
            await TrendHistory.create({
                steam_appid: appid,
                trend_score: trendScore,
                twitch_viewers: trends.twitch.status === 'ok' ? trends.twitch.value : 0,
                chzzk_viewers: trends.chzzk.status === 'ok' ? trends.chzzk.value : 0,
            });

            // 4-3. Sale History 기록 (할인 중일 경우에만)
            if (priceInfo.discount_percent > 0) {
                await SaleHistory.create({
                    steam_appid: appid,
                    current_price: priceInfo.current_price,
                    regular_price: priceInfo.regular_price,
                    discount_percent: priceInfo.discount_percent,
                    store_url: priceInfo.store_url,
                    store_name: priceInfo.store_name,
                    // Steam API는 만료일(expiry) 정보를 정확히 제공하지 않으므로, ITAD deals에서 만료일을 가져오거나 (복잡) 일단 생략.
                    itad_deals: priceInfo.deals 
                });
            }

            count++;
            console.log(`✅ [${count}] ${data.name} (Price: ${priceInfo.current_price}원 | Trend: ${trendScore})`);

        } catch (e) { console.error(`❌ Error ${appid}: ${e.message}`); }
    }
    console.log("🎉 수집 완료");
    process.exit(0);
}

collectGamesData();