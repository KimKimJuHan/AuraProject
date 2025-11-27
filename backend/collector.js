// backend/collector.js (GitHub Actions 최적화: 리소스 차단 + 탭 재사용)

require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const os = require('os');

const Game = require('./models/Game');
const GameCategory = require('./models/GameCategory'); 
const GameMetadata = require('./models/GameMetadata'); 

const { MONGODB_URI, ITAD_API_KEY, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, CHZZK_CLIENT_ID, CHZZK_CLIENT_SECRET } = process.env;

if (!ITAD_API_KEY) { console.error("🚨 ITAD_API_KEY 누락"); process.exit(1); }

const STEAM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 1. 크롬 경로 찾기
function findChromePath() {
    const platform = os.platform();
    if (platform === 'win32') {
        const paths = [
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
            `C:\\Users\\${process.env.USERNAME}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`
        ];
        for (const p of paths) if (fs.existsSync(p)) return p;
    } else if (platform === 'linux') {
        // GitHub Actions 및 리눅스 환경
        const paths = ["/usr/bin/google-chrome", "/usr/bin/chromium-browser"];
        for (const p of paths) if (fs.existsSync(p)) return p;
    } else if (platform === 'darwin') {
        return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    }
    return null;
}

function cleanGameTitle(title) {
    if (!title) return "";
    let clean = title.replace(/[™®©]/g, '');
    const removePatterns = [
        /Game of the Year Edition/gi, /GOTY/gi, /Definitive Edition/gi, /Enhanced Edition/gi, 
        /Director's Cut/gi, /The Final Cut/gi, /Complete Edition/gi, /Bonus Edition/gi,
        /Anniversary Edition/gi, /Remastered/gi, /Digital Deluxe/gi, /Standard Edition/gi,
        /Legendary Edition/gi, /Special Edition/gi, /Collector's Edition/gi, /Legacy/gi
    ];
    removePatterns.forEach(regex => { clean = clean.replace(regex, ''); });
    clean = clean.replace(/[\s\:\-]+$/g, '');
    if (clean.toLowerCase().endsWith(' the')) clean = clean.substring(0, clean.length - 4);
    return clean.trim();
}

function chunkArray(array, size) {
    const chunked = [];
    for (let i = 0; i < array.length; i += size) {
        chunked.push(array.slice(i, i + size));
    }
    return chunked;
}

// --- [Twitch & Trends] ---
let twitchToken = null;
async function getTwitchToken() {
    if (!TWITCH_CLIENT_ID) return;
    try {
        const res = await axios.post('https://id.twitch.tv/oauth2/token', null, {
            params: { client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' }
        });
        twitchToken = res.data.access_token;
    } catch (e) {}
}

function translateTags(tags) {
    const TAG_MAP = { 'rpg': 'RPG', 'action': '액션', 'fps': 'FPS', 'simulation': '시뮬레이션', 'strategy': '전략', 'sports': '스포츠', 'racing': '레이싱', 'puzzle': '퍼즐', 'survival': '생존', 'horror': '공포', 'adventure': '어드벤처', 'open world': '오픈 월드', 'co-op': '협동', 'multiplayer': '멀티플레이', 'roguelike': '로그라이크', 'souls-like': '소울라이크', 'story rich': '스토리 중심' };
    if (!tags) return [];
    const myTags = new Set();
    tags.forEach(t => {
        const lower = t.toLowerCase();
        for (const key in TAG_MAP) { if (lower.includes(key)) myTags.add(TAG_MAP[key]); }
    });
    return Array.from(myTags);
}

async function getTrendStats(steamAppId, categoryData) {
    let twitch = { value: 0, status: 'fail' }; 
    let chzzk = { value: 0, status: 'fail' };

    if (categoryData?.twitch?.id) {
        if (!twitchToken) await getTwitchToken();
        try {
            const res = await axios.get('https://api.twitch.tv/helix/streams', {
                headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchToken}` },
                params: { game_id: categoryData.twitch.id, first: 100 }
            });
            const viewers = res.data.data.reduce((acc, s) => acc + s.viewer_count, 0);
            twitch = { value: viewers, status: 'ok' };
        } catch (e) {}
    }

    if (categoryData?.chzzk?.categoryValue) {
        try {
            const keyword = encodeURIComponent(categoryData.chzzk.categoryValue);
            const res = await axios.get(`https://api.chzzk.naver.com/service/v1/search/lives?keyword=${keyword}&offset=0&size=50&sortType=POPULAR`, {
                headers: { 'User-Agent': 'Mozilla/5.0', ...(CHZZK_CLIENT_ID && { 'Client-Id': CHZZK_CLIENT_ID, 'Client-Secret': CHZZK_CLIENT_SECRET }) }
            });
            const lives = res.data?.content?.data || [];
            const target = categoryData.chzzk.categoryValue.replace(/\s/g, ''); 
            let viewers = 0;
            lives.forEach(item => {
                const live = item.live;
                if (!live) return;
                const cat = (live.liveCategoryValue || "").replace(/\s/g, '');
                if (cat.includes(target) || target.includes(cat)) viewers += live.concurrentUserCount || 0;
            });
            chzzk = { value: viewers, status: 'ok' };
        } catch (e) {}
    }
    return { twitch, chzzk };
}

function calculateWeightedScore(trends) {
    const { twitch, chzzk } = trends;
    let score = 0;
    if (twitch.status === 'ok') score += twitch.value;
    if (chzzk.status === 'ok') score += chzzk.value * 2;
    return score;
}

// --- [Price Helpers] ---
async function getITADPrice(metadata) {
    if (!metadata?.itad?.uuid) return null;
    try {
        const pricesRes = await axios.post(`https://api.isthereanydeal.com/games/prices/v3?key=${ITAD_API_KEY}&country=KR`, 
            [metadata.itad.uuid], { headers: { 'Content-Type': 'application/json' }, timeout: 5000 });
        const itadGame = pricesRes.data?.[0];
        if (itadGame) {
            const deals = (itadGame.deals || []).sort((a, b) => a.price.amount - b.price.amount);
            const dealsMapped = deals.map(d => ({ shopName: d.shop?.name, price: d.price?.amount, regularPrice: d.regular?.amount, discount: d.cut, url: d.url }));
            const bestDeal = deals[0];
            if (bestDeal) {
                return {
                    regular_price: bestDeal.regular.amount,
                    current_price: bestDeal.price.amount,
                    discount_percent: bestDeal.cut,
                    historical_low: itadGame.historyLow?.price?.amount || 0,
                    deals: dealsMapped,
                    store_name: bestDeal.shop?.name || 'ITAD Deal',
                    store_url: bestDeal.url 
                };
            }
        }
    } catch (e) {}
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
            return {
                regular_price: pkgData.price.initial / 100,
                current_price: pkgData.price.final / 100,
                discount_percent: pkgData.price.discount_percent,
                store_name: 'Steam',
                store_url: `https://store.steampowered.com/sub/${packageId}`
            };
        }
    } catch (e) {}
    return null;
}

async function fetchPriceInfo(originalAppId, initialSteamData, metadata) {
    const candidateIds = [originalAppId, ...(metadata?.aliasAppIds || [])].filter(id => id); 
    let steamData = initialSteamData;

    for (const currentAppId of candidateIds) {
        if (currentAppId !== originalAppId) {
            try {
                const res = await axios.get(`https://store.steampowered.com/api/appdetails`, {
                    params: { appids: currentAppId, l: 'korean', cc: 'kr' },
                    headers: STEAM_HEADERS
                });
                steamData = res.data?.[currentAppId]?.data || steamData;
            } catch (e) {}
        }
        
        const itadPrice = await getITADPrice(metadata);
        if (itadPrice) return { ...itadPrice, store_url: itadPrice.store_url || `https://store.steampowered.com/app/${originalAppId}`, isFree: false };

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
            if (pkgPrice) return { ...pkgPrice, historical_low: 0, deals: [], store_name: 'Steam', store_url: `https://store.steampowered.com/app/${originalAppId}`, isFree: false };
        }
    }
    
    return {
        regular_price: 0, current_price: 0, discount_percent: 0,
        store_name: 'Steam', store_url: `https://store.steampowered.com/app/${originalAppId}`,
        isFree: initialSteamData.is_free === true,
        deals: [], historical_low: 0
    };
}

// --- [4. 메인 수집 루프 (최적화 적용)] ---
async function collectGamesData() {
    if (!MONGODB_URI) return;
    await mongoose.connect(MONGODB_URI);
    console.log("✅ DB Connected. 수집 시작...");

    const metadatas = await GameMetadata.find({});
    const chromePath = findChromePath();
    if (!chromePath) { console.error("❌ 크롬 경로 없음"); process.exit(1); }

    // ★ [최적화 1] 배치 사이즈를 10개로 축소 (안정성 확보)
    const BATCH_SIZE = 10; 
    const batches = chunkArray(metadatas, BATCH_SIZE);

    console.log(`🎯 총 ${metadatas.length}개 게임을 ${batches.length}개 배치로 나누어 수집합니다.`);

    let totalCount = 0;

    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(`\n🔄 Batch ${i + 1}/${batches.length} 시작...`);

        // ★ [최적화 2] 브라우저 실행 옵션 강화 (메모리/GPU 제한)
        const browser = await puppeteer.launch({ 
            executablePath: chromePath,
            headless: "new", 
            protocolTimeout: 180000, // 3분 타임아웃
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-features=site-per-process',
                '--disable-dev-shm-usage', // 메모리 부족 방지
                '--disable-gpu',           // GPU 사용 안 함
                '--single-process',        // 단일 프로세스로 실행 (가볍게)
                '--no-zygote'
            ] 
        });

        try {
            const page = await browser.newPage();
            
            // ★ [최적화 3] 이미지/CSS/폰트 로딩 차단 (속도 향상)
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                const type = req.resourceType();
                if (['image', 'stylesheet', 'font', 'media', 'other'].includes(type)) {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
            
            // HLTB 쿠키 획득용 접속
            await page.goto('https://howlongtobeat.com', { waitUntil: 'domcontentloaded', timeout: 60000 });

            for (const metadata of batch) {
                const appid = metadata.steamAppId;
                try {
                    await sleep(500); 

                    // 1. Steam Data
                    const steamRes = await axios.get(`https://store.steampowered.com/api/appdetails`, {
                        params: { appids: appid, l: 'korean', cc: 'kr' },
                        headers: STEAM_HEADERS 
                    });
                    const data = steamRes.data[appid]?.data; 
                    if (!data) continue; 
                    
                    // 2. Trend & Price
                    const categoryData = await GameCategory.findOne({ steamAppId: appid });
                    const trends = await getTrendStats(appid, categoryData);
                    const trendScore = calculateWeightedScore(trends);
                    const priceInfo = await fetchPriceInfo(appid, data, metadata);
                    
                    // 3. HLTB Playtime (단일 탭 재사용)
                    let playTime = "정보 없음";
                    try {
                        const searchName = cleanGameTitle(metadata.title || data.name);
                        const searchUrl = `https://howlongtobeat.com/?q=${encodeURIComponent(searchName)}`;
                        
                        // 같은 탭에서 이동
                        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
                        
                        try {
                            // 로딩 대기 (Main Story 또는 No results가 뜰 때까지)
                            await page.waitForFunction(
                                () => document.body.innerText.includes("Main Story") || 
                                      document.body.innerText.includes("All Styles") || 
                                      document.body.innerText.includes("Co-Op") ||
                                      document.body.innerText.includes("No results"),
                                { timeout: 5000 }
                            );
                        } catch(e) {}

                        const hltbData = await page.evaluate(() => {
                            const items = Array.from(document.querySelectorAll('li'));
                            const IGNORE = ["Forum", "Stats", "Submit", "Login", "Join", "Discord", "Facebook", "Twitter"];

                            for (const li of items) {
                                const title = li.querySelector('h3')?.innerText.trim() || li.querySelector('a[title]')?.innerText.trim();
                                if (!title || IGNORE.includes(title) || title.length < 2) continue;

                                const text = li.innerText;
                                if (!text.includes('Hours') && !text.includes('Mins')) continue;

                                const lines = text.split('\n').map(l => l.trim()).filter(l => l);
                                const parseTime = (labels) => {
                                    for (let i = 0; i < lines.length; i++) {
                                        if (labels.some(l => lines[i].includes(l))) {
                                            if (lines[i+1] && /[0-9]/.test(lines[i+1])) return lines[i+1];
                                            const match = lines[i].match(/([0-9½\.]+)\s*(Hours|Mins|h)/i);
                                            if (match) return `${match[1]} ${match[2]}`;
                                        }
                                    }
                                    return null;
                                };

                                // 우선순위: Main -> All Styles -> Co-Op
                                const time = parseTime(['Main Story', 'Main']) || 
                                             parseTime(['Main + Extra', 'Main + Sides']) || 
                                             parseTime(['All Styles', 'All PlayStyles']) || 
                                             parseTime(['Co-Op', 'Multiplayer']) ||
                                             parseTime(['Single-Player', 'Solo']) ||
                                             parseTime(['Completionist']);
                                
                                if (time) return time;
                            }
                            return null;
                        });

                        if (hltbData) playTime = hltbData;

                    } catch(e) {}

                    // 4. DB Save
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
                        pc_requirements: data.pc_requirements || { minimum: "", recommended: "" },
                        releaseDate: data.release_date?.date ? new Date(data.release_date.date.replace(/년|월|일/g, '-')) : new Date(),
                        screenshots: data.screenshots?.map(s=>s.path_full)||[],
                        trailers: data.movies?.map(m=>m.webm?.max)||[],
                        metacritic_score: data.metacritic?.score || 0,
                        play_time: playTime, 
                    }, { upsert: true });

                    totalCount++;
                    console.log(`✅ [${totalCount}/${metadatas.length}] ${data.name} | Time: ${playTime}`);

                } catch (e) { console.error(`❌ Error ${appid}: ${e.message}`); }
            }
        } catch (err) {
            console.error("🚨 Batch Error:", err);
        } finally {
            await browser.close(); // 배치 끝날 때마다 확실하게 메모리 해제
        }
    }

    console.log("🎉 수집 완료");
    process.exit(0);
}

collectGamesData();