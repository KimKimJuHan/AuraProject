// backend/collector.js (최종 통합 버전: Steam + ITAD + Twitch + HLTB 완벽 대응)

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
    } else if (platform === 'darwin') {
        return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    } else if (platform === 'linux') {
        return "/usr/bin/google-chrome";
    }
    return null;
}

// 2. 이름 정제 (HLTB 검색용)
function cleanGameTitle(title) {
    if (!title) return "";
    let clean = title;

    clean = clean.replace(/[™®©]/g, ''); // 상표권 제거

    // 에디션 제거
    const removePatterns = [
        /Game of the Year Edition/gi, /GOTY/gi,
        /Definitive Edition/gi, /Enhanced Edition/gi, 
        /Director's Cut/gi, /The Final Cut/gi, 
        /Complete Edition/gi, /Bonus Edition/gi,
        /Anniversary Edition/gi, /Remastered/gi, 
        /Digital Deluxe/gi, /Standard Edition/gi,
        /Legendary Edition/gi, /Special Edition/gi,
        /Collector's Edition/gi, /Legacy/gi
    ];
    removePatterns.forEach(regex => { clean = clean.replace(regex, ''); });

    // 끝에 남은 특수문자 정리
    clean = clean.replace(/[\s\:\-]+$/g, '');

    // 관사 제거
    if (clean.toLowerCase().endsWith(' the')) {
        clean = clean.substring(0, clean.length - 4);
    }

    return clean.trim();
}

// 3. 유사도 계산
function getSimilarity(s1, s2) {
    const cleanS1 = cleanGameTitle(s1).toLowerCase().replace(/[:\-]/g, '');
    const cleanS2 = cleanGameTitle(s2).toLowerCase().replace(/[:\-]/g, '');

    if (cleanS1 === cleanS2) return 1.0;
    if (cleanS1.includes(cleanS2) || cleanS2.includes(cleanS1)) return 0.9;

    const longer = cleanS1.length > cleanS2.length ? cleanS1 : cleanS2;
    const shorter = cleanS1.length > cleanS2.length ? cleanS2 : cleanS1;
    if (longer.length === 0) return 1.0;

    const editDistance = (a, b) => {
        const costs = new Array();
        for (let i = 0; i <= a.length; i++) {
            let lastValue = i;
            for (let j = 0; j <= b.length; j++) {
                if (i == 0) costs[j] = j;
                else {
                    if (j > 0) {
                        let newValue = costs[j - 1];
                        if (a.charAt(i - 1) != b.charAt(j - 1)) newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                        costs[j - 1] = lastValue;
                        lastValue = newValue;
                    }
                }
            }
            if (i > 0) costs[b.length] = lastValue;
        }
        return costs[b.length];
    }
    return (longer.length - editDistance(longer, shorter)) / longer.length;
}


// --- [Twitch & Tag Logic] ---
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

// --- [Trend Stats] ---
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
                headers: { 
                    'User-Agent': 'Mozilla/5.0',
                    ...(CHZZK_CLIENT_ID && { 'Client-Id': CHZZK_CLIENT_ID, 'Client-Secret': CHZZK_CLIENT_SECRET })
                }
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

// --- [4. 메인 수집 루프] ---
async function collectGamesData() {
    if (!MONGODB_URI) return;
    await mongoose.connect(MONGODB_URI);
    console.log("✅ DB Connected. 수집 시작...");

    const metadatas = await GameMetadata.find({});
    const targetAppIds = metadatas.map(m => m.steamAppId);
    
    console.log(`🎯 수집 대상: ${targetAppIds.length}개`);

    // ★ Puppeteer (HLTB용 브라우저) 시작
    const chromePath = findChromePath();
    if (!chromePath) { console.error("❌ 크롬 경로 없음"); process.exit(1); }

    const browser = await puppeteer.launch({ 
        executablePath: chromePath,
        headless: "new", // 백그라운드 실행
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (['image', 'stylesheet', 'font'].includes(req.resourceType())) req.abort();
        else req.continue();
    });
    // HLTB 쿠키 생성용 접속
    await page.goto('https://howlongtobeat.com', { waitUntil: 'domcontentloaded' });

    let count = 0;
    for (const metadata of metadatas) {
        const appid = metadata.steamAppId;

        try {
            await sleep(1000); 

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
            
            // 3. HLTB Playtime (검증된 로직 적용)
            let playTime = "정보 없음";
            try {
                const searchName = cleanGameTitle(metadata.title || data.name); // 정제된 이름 사용
                const searchUrl = `https://howlongtobeat.com/?q=${encodeURIComponent(searchName)}`;
                
                await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                
                // 로딩 대기 (Main Story가 뜰 때까지)
                try {
                    await page.waitForFunction(
                        () => document.body.innerText.includes("Main Story") || document.body.innerText.includes("No results"),
                        { timeout: 5000 }
                    );
                } catch(e) {}

                const hltbData = await page.evaluate(() => {
                    const items = Array.from(document.querySelectorAll('li'));
                    const results = [];
                    const IGNORE_LIST = ["Forum", "Stats", "Submit", "Login", "Join"];

                    for (const li of items) {
                        const titleEl = li.querySelector('h3') || li.querySelector('a[title]') || li.querySelector('a');
                        if (!titleEl) continue;

                        const title = titleEl.innerText.trim();
                        if (IGNORE_LIST.includes(title) || title.length < 2) continue;

                        const text = li.innerText;
                        const lines = text.split('\n').map(l => l.trim()).filter(l => l);

                        // 파싱 로직
                        const parseTime = (labels) => {
                            for (let i = 0; i < lines.length; i++) {
                                if (labels.some(label => lines[i].includes(label))) {
                                    if (lines[i+1] && /[0-9]/.test(lines[i+1])) return lines[i+1];
                                    const match = lines[i].match(/([0-9½\.]+)\s*(Hours|Mins|h)/i);
                                    if (match) return `${match[1]} ${match[2]}`;
                                }
                            }
                            return null;
                        };

                        const main = parseTime(['Main Story', 'Main']);
                        const extra = parseTime(['Main + Extra', 'Main + Sides']);
                        
                        if (main || extra) {
                            results.push({ title, main: main || 'TBD' });
                        }
                    }
                    return results;
                });

                // 유사도 매칭
                if (hltbData && hltbData.length > 0) {
                    // Node.js 환경에서 유사도 함수 실행
                    // (getSimilarity 함수는 위쪽에 정의되어 있어야 함)
                    let bestMatch = null;
                    let maxScore = 0;
                    for (const candidate of hltbData) {
                        // collector.js 내부에는 getSimilarity가 없으므로 여기서는 간단 비교 또는 함수 추가 필요
                        // 여기서는 searchName(정제된 이름)과 가장 비슷한 것을 찾음
                        const s1 = searchName.toLowerCase().replace(/[:\-]/g, '');
                        const s2 = candidate.title.toLowerCase().replace(/[:\-]/g, '');
                        
                        // 간단 유사도: 포함 여부 및 길이 비교
                        let score = 0;
                        if (s1 === s2) score = 1.0;
                        else if (s1.includes(s2) || s2.includes(s1)) score = 0.8;
                        
                        if (score > maxScore) {
                            maxScore = score;
                            bestMatch = candidate;
                        }
                    }
                    
                    if (bestMatch && maxScore > 0.5) {
                        playTime = `${bestMatch.main} (Main)`;
                    }
                }
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

            count++;
            console.log(`✅ [${count}/${targetAppIds.length}] ${data.name} | Time: ${playTime}`);

        } catch (e) { console.error(`❌ Error ${appid}: ${e.message}`); }
    }

    await browser.close();
    console.log("🎉 수집 완료");
    process.exit(0);
}

collectGamesData();