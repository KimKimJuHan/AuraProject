// backend/collector.js

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

const STEAM_HEADERS = { 'User-Agent': 'Mozilla/5.0' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function findChromePath() {
    const platform = os.platform();
    if (platform === 'win32') {
        const paths = [
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
            `C:\\Users\\${process.env.USERNAME}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`
        ];
        for (const p of paths) if (fs.existsSync(p)) return p;
    } else if (platform === 'darwin') return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    else if (platform === 'linux') return "/usr/bin/google-chrome";
    return null;
}

// 이름 정제 (HLTB 검색용)
function cleanGameTitle(title) {
    if (!title) return "";
    let clean = title.replace(/_/g, ' ').replace(/[™®©]/g, '');
    const removePatterns = [
        /Game of the Year/gi, /GOTY/gi, /Definitive Edition/gi, /Enhanced Edition/gi, 
        /Director's Cut/gi, /The Final Cut/gi, /Complete Edition/gi, /Legacy/gi, /Remastered/gi
    ];
    removePatterns.forEach(regex => { clean = clean.replace(regex, ''); });
    clean = clean.replace(/[\s\:\-]+$/g, '');
    if (clean.toLowerCase().endsWith(' the')) clean = clean.substring(0, clean.length - 4);
    return clean.trim();
}

function chunkArray(array, size) {
    const chunked = [];
    for (let i = 0; i < array.length; i += size) chunked.push(array.slice(i, i + size));
    return chunked;
}

async function fetchSteamAppDetails(appId) {
    try {
        const res = await axios.get(`https://store.steampowered.com/api/appdetails`, { params: { appids: appId, l: 'korean', cc: 'kr' }, headers: STEAM_HEADERS });
        return res.data?.[appId]?.data || null;
    } catch (e) {
        return null;
    }
}

async function findBestSteamAppId(term) {
    try {
        const encodedTerm = encodeURIComponent(term);
        const res = await axios.get(`https://store.steampowered.com/api/storesearch/?term=${encodedTerm}&l=english&cc=us`);
        if (res.data?.items?.length) {
            const bestMatch = res.data.items.find(item => item.type === 'app' || item.type === 'game');
            if (bestMatch) return { id: bestMatch.id, name: bestMatch.name };
        }
    } catch (e) {}
    return null;
}

function isLegacyTitle(title = '') {
    return title.toLowerCase().includes('legacy');
}

function isPlayableSteamGame(data) {
    if (!data || data.type !== 'game') return false;
    return data.is_free === true || !!data.price_overview || (Array.isArray(data.packages) && data.packages.length > 0);
}

async function resolveSteamApp(metadata) {
    let appid = metadata.steamAppId;
    let steamData = await fetchSteamAppDetails(appid);

    if (!isPlayableSteamGame(steamData) || isLegacyTitle(steamData?.name)) {
        const searchName = cleanGameTitle(metadata.title || steamData?.name || '');
        const bestMatch = await findBestSteamAppId(searchName);
        if (bestMatch && bestMatch.id !== appid) {
            const replacementData = await fetchSteamAppDetails(bestMatch.id);
            if (isPlayableSteamGame(replacementData) && !isLegacyTitle(replacementData.name)) {
                appid = bestMatch.id;
                steamData = replacementData;
                metadata.steamAppId = appid;
                try { await metadata.save(); } catch (e) {}
            }
        }
    }

    return { appid, steamData };
}

// --- [Twitch & Trend Logic] ---
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
async function getTrendStats(steamAppId, categoryData) {
    let twitch = { value: 0, status: 'fail' }; 
    let chzzk = { value: 0, status: 'fail' };
    // (기존 로직 생략 - 동일함)
    if (categoryData?.twitch?.id) {
        if (!twitchToken) await getTwitchToken();
        try {
            const res = await axios.get('https://api.twitch.tv/helix/streams', { headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchToken}` }, params: { game_id: categoryData.twitch.id, first: 100 } });
            twitch = { value: res.data.data.reduce((acc, s) => acc + s.viewer_count, 0), status: 'ok' };
        } catch (e) {}
    }
    if (categoryData?.chzzk?.categoryValue) {
        try {
            const keyword = encodeURIComponent(categoryData.chzzk.categoryValue);
            const res = await axios.get(`https://api.chzzk.naver.com/service/v1/search/lives?keyword=${keyword}&offset=0&size=50&sortType=POPULAR`, { headers: { 'User-Agent': 'Mozilla/5.0', ...(CHZZK_CLIENT_ID && { 'Client-Id': CHZZK_CLIENT_ID, 'Client-Secret': CHZZK_CLIENT_SECRET }) } });
            const lives = res.data?.content?.data || [];
            const target = categoryData.chzzk.categoryValue.replace(/\s/g, ''); 
            let viewers = 0;
            lives.forEach(item => { if (item.live && item.live.liveCategoryValue.replace(/\s/g, '').includes(target)) viewers += item.live.concurrentUserCount || 0; });
            chzzk = { value: viewers, status: 'ok' };
        } catch (e) {}
    }
    return { twitch, chzzk };
}
function calculateWeightedScore(trends) {
    let score = 0;
    if (trends.twitch.status === 'ok') score += trends.twitch.value;
    if (trends.chzzk.status === 'ok') score += trends.chzzk.value * 2;
    return score;
}
function translateTags(tags) { return tags || []; }

// ★ [가격 처리 강화] 패키지 가격 조회 함수
async function getSteamPackagePrice(packageId) {
    try {
        const res = await axios.get(`https://store.steampowered.com/api/packagedetails`, {
            params: { packageids: packageId, l: 'korean', cc: 'kr' }
        });
        const data = res.data[packageId]?.data;
        if (data?.price) {
            return {
                regular_price: data.price.initial / 100,
                current_price: data.price.final / 100,
                discount_percent: data.price.discount_percent,
                store_name: 'Steam',
                store_url: `https://store.steampowered.com/sub/${packageId}`
            };
        }
    } catch (e) {}
    return null;
}

async function fetchPriceInfo(originalAppId, initialSteamData, metadata) {
    const isFree = initialSteamData.is_free === true;
    
    // 1. ITAD 가격
    try {
        if (metadata?.itad?.uuid) {
            const pricesRes = await axios.post(`https://api.isthereanydeal.com/games/prices/v3?key=${ITAD_API_KEY}&country=KR`, 
                [metadata.itad.uuid], { headers: { 'Content-Type': 'application/json' }, timeout: 5000 });
            const itadGame = pricesRes.data?.[0];
            if (itadGame && itadGame.deals && itadGame.deals.length > 0) {
                const bestDeal = itadGame.deals.sort((a, b) => a.price.amount - b.price.amount)[0];
                return {
                    regular_price: bestDeal.regular.amount,
                    current_price: isFree ? 0 : bestDeal.price.amount,
                    discount_percent: bestDeal.cut,
                    deals: itadGame.deals.map(d => ({ shopName: d.shop?.name, price: d.price?.amount, url: d.url })),
                    store_name: bestDeal.shop?.name,
                    store_url: bestDeal.url,
                    isFree: isFree
                };
            }
        }
    } catch (e) {}

    // 2. Steam 가격 (단품)
    if (initialSteamData.price_overview) {
        return {
            regular_price: initialSteamData.price_overview.initial / 100,
            current_price: initialSteamData.price_overview.final / 100,
            discount_percent: initialSteamData.price_overview.discount_percent,
            store_name: 'Steam',
            store_url: `https://store.steampowered.com/app/${originalAppId}`,
            isFree: false, deals: []
        };
    }

    // 3. Steam 가격 (패키지) - GTA 5 같은 경우
    if (initialSteamData.packages && initialSteamData.packages.length > 0) {
        const pkgPrice = await getSteamPackagePrice(initialSteamData.packages[0]);
        if (pkgPrice) return { ...pkgPrice, isFree: false, deals: [] };
    }

    // 4. 무료
    return {
        regular_price: 0, current_price: 0, discount_percent: 0,
        store_name: 'Steam', store_url: `https://store.steampowered.com/app/${originalAppId}`,
        isFree: isFree, deals: []
    };
}

async function collectGamesData() {
    if (!MONGODB_URI) return;
    await mongoose.connect(MONGODB_URI);
    
    const metadatas = await GameMetadata.find({});
    const chromePath = findChromePath();
    const batches = chunkArray(metadatas, 5); // 5개씩 처리
    let totalCount = 0;

    for (const batch of batches) {
        // Puppeteer 실행 (헤드리스 모드)
        const browser = await puppeteer.launch({ executablePath: chromePath, headless: "new", protocolTimeout: 180000, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        try {
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
            await page.goto('https://howlongtobeat.com', { waitUntil: 'domcontentloaded', timeout: 60000 });

            for (const metadata of batch) {
                try {
                    const { appid, steamData: data } = await resolveSteamApp(metadata);
                    await sleep(500);

                    if (!data) continue;

                    const categoryData = await GameCategory.findOne({ steamAppId: appid });
                    const trends = await getTrendStats(appid, categoryData);
                    const trendScore = calculateWeightedScore(trends);
                    const priceInfo = await fetchPriceInfo(appid, data, metadata);

                    // HLTB (스마트 매칭 적용)
                    let playTime = "정보 없음";
                    try {
                        const searchName = cleanGameTitle(metadata.title || data.name);
                        await page.goto(`https://howlongtobeat.com/?q=${encodeURIComponent(searchName)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
                        
                        try {
                            // 결과 뜰 때까지 대기 (Main Story 또는 No results)
                            await page.waitForFunction(
                                () => document.body.innerText.includes("Main Story") || document.body.innerText.includes("All Styles") || document.body.innerText.includes("Co-Op") || document.body.innerText.includes("No results"),
                                { timeout: 10000 }
                            );
                        } catch(e) {}

                        const hltbData = await page.evaluate(() => {
                            const items = Array.from(document.querySelectorAll('li'));
                            for(const li of items) {
                                const text = li.innerText;
                                const title = li.querySelector('h3')?.innerText || li.querySelector('a')?.innerText;
                                if (!title || title.length < 2) continue;

                                // 시간 정보가 있는지 확인
                                if((text.includes('Hours') || text.includes('Mins')) && (text.includes('Main') || text.includes('Co-Op') || text.includes('All Styles'))) {
                                    // 시간 파싱
                                    const match = text.match(/([0-9½\.]+)\s*(Hours|Mins|h)/i);
                                    if(match) return { title, time: `${match[1]} ${match[2]}` };
                                }
                            }
                            return null;
                        });

                        // 유사도 체크 (검색어와 결과 제목 비교)
                        if (hltbData) {
                            // 간단한 포함 여부 확인 (정교한 알고리즘 대신 효율성 선택)
                            const s1 = searchName.toLowerCase().replace(/[:\- ]/g, '');
                            const s2 = hltbData.title.toLowerCase().replace(/[:\- ]/g, '');
                            if (s1.includes(s2) || s2.includes(s1)) {
                                playTime = hltbData.time;
                            }
                        }
                    } catch(e) {}

                    // 제목 저장 (Legacy 제거, 언더바 제거)
                    let finalTitle = data.name;
                    if (finalTitle.toLowerCase().includes('legacy') || finalTitle.includes('_')) {
                        finalTitle = cleanGameTitle(metadata.title || data.name);
                    }
                    let koTitle = (categoryData?.chzzk?.categoryValue || data.name).replace(/_/g, ' ');

                    await Game.findOneAndUpdate({ steam_appid: appid }, {
                        slug: `steam-${appid}`,
                        steam_appid: appid,
                        title: finalTitle,
                        title_ko: koTitle,
                        main_image: data.header_image,
                        description: data.short_description,
                        smart_tags: data.genres?.map(g=>g.description) || [],
                        trend_score: trendScore,
                        twitch_viewers: trends.twitch.status === 'ok' ? trends.twitch.value : 0,
                        chzzk_viewers: trends.chzzk.status === 'ok' ? trends.chzzk.value : 0,
                        price_info: priceInfo, 
                        releaseDate: data.release_date?.date ? new Date(data.release_date.date.replace(/년|월|일/g, '-')) : new Date(),
                        metacritic_score: data.metacritic?.score || 0,
                        play_time: playTime, 
                    }, { upsert: true });

                    totalCount++;
                    console.log(`✅ [${totalCount}] ${finalTitle} | ${priceInfo.isFree ? "FREE" : priceInfo.current_price} | ${playTime}`);
                } catch(e) { console.error(`Item Error: ${e.message}`); }
            }
        } catch(e) { console.error("Batch Error", e); } 
        finally { await browser.close(); }
    }
    console.log("🎉 수집 완료");
    process.exit(0);
}
collectGamesData();