require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const axios = require('axios');
const puppeteer = require('puppeteer-core');
const os = require('os');
const fs = require('fs');

const Game = require('../models/Game');
const { mapSteamTags } = require('../utils/tagMapper');

try {
    const { setupAxiosRetry } = require('../utils/systemHelper');
    if (setupAxiosRetry) setupAxiosRetry();
} catch (e) {}

const { MONGODB_URI } = process.env;
if (!MONGODB_URI) process.exit(1);

const STEAM_HEADERS = { 'User-Agent': 'Mozilla/5.0', 'Cookie': 'birthtime=0; wants_mature_content=1; Steam_Language=korean;' };

function parseSafeDate(dateStr) {
    if (!dateStr) return undefined;
    const cleanStr = dateStr.replace(/년|월/g, '-').replace(/일/g, '').trim();
    const date = new Date(cleanStr);
    return isNaN(date.getTime()) ? undefined : date;
}

function findChromePath() {
    const paths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        '/usr/bin/google-chrome', '/usr/bin/chromium-browser'
    ];
    for (const p of paths) if (fs.existsSync(p)) return p;
    return null;
}

async function getTrendingAppIds() {
    try {
        const res = await axios.get('https://steamspy.com/api.php?request=top100in2weeks', { timeout: 8000 });
        if (res.data) return Object.values(res.data).map(game => ({ steamAppId: game.appid, title: game.name }));
    } catch(e) { }
    return [];
}

async function collectGameData() {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ DB Connected. [신규 메타데이터 및 가격] 수집기 시작...');

    const existingAppIds = new Set((await Game.find({}).select('steam_appid').lean()).map(g => g.steam_appid));
    const trendingGames = await getTrendingAppIds();
    
    const newGames = trendingGames.filter(g => !existingAppIds.has(g.steamAppId)).slice(0, 20);
    const missingGames = await Game.find({ play_time: null }).select('steam_appid title').limit(10).lean();
    const targetBatch = [...newGames, ...missingGames.map(g => ({ steamAppId: g.steam_appid, title: g.title }))];

    if (targetBatch.length === 0) {
        console.log("처리할 신규 데이터가 없습니다.");
        process.exit(0);
    }

    const chromePath = findChromePath();
    let browser = await puppeteer.launch({ 
        executablePath: chromePath, 
        headless: 'new', 
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] 
    });

    for (const item of targetBatch) {
        let page = null;
        try {
            const steamRes = await axios.get(`https://store.steampowered.com/api/appdetails`, { params: { appids: item.steamAppId, l: 'korean', cc: 'kr' }, headers: STEAM_HEADERS, timeout: 10000 }).catch(()=>({data:null}));
            const data = steamRes.data?.[item.steamAppId]?.data;
            
            // ★ 비게임 완벽 차단 로직: type 검사 및 장르명(소프트웨어, 유틸리티, 디자인 등) 검사
            const isSoftwareGenre = data?.genres?.some(g => ['Software', 'Utilities', 'Design & Illustration', 'Animation & Modeling', 'Audio Production', 'Video Production', 'Web Publishing'].includes(g.description));

            if (!data || data.type !== 'game' || isSoftwareGenre) {
                console.log(`⏩ [스킵] ${item.title || item.steamAppId} (사유: 게임이 아닌 소프트웨어로 판별됨)`);
                continue; 
            }

            let scrapedTags = [];
            let playTime = null;

            page = await browser.newPage();
            await page.setRequestInterception(true);
            page.on('request', (req) => { 
                ['image', 'stylesheet', 'media', 'font'].includes(req.resourceType()) ? req.abort() : req.continue(); 
            });

            try {
                await page.goto(`https://store.steampowered.com/app/${item.steamAppId}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
                const ageGate = await page.$('#ageYear');
                if (ageGate) { await page.select('#ageYear', '2000'); await page.click('.btnv6_blue_hoverfade_btn').catch(()=>{}); }
                scrapedTags = await page.evaluate(() => Array.from(document.querySelectorAll('.app_tag')).map(el => el.innerText.trim()));
            } catch(e) {}

            // 태그로 한 번 더 검사 (스토어 태그에 유틸리티 냄새가 나면 스킵)
            const isSoftwareTag = scrapedTags.some(t => ['Software', 'Utilities', 'Video Production', 'Audio Production', 'Design & Illustration', '유틸리티', '소프트웨어'].includes(t));
            if (isSoftwareTag) {
                console.log(`⏩ [스킵] ${item.title || item.steamAppId} (사유: 상점 태그에 소프트웨어가 포함됨)`);
                await page.close();
                continue;
            }

            try {
                const cleanName = data.name.replace(/[™®©]/g, '').split(':')[0].trim();
                await page.goto(`https://howlongtobeat.com/?q=${encodeURIComponent(cleanName)}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
                await page.waitForSelector('ul.search_list, .search_list_details', { timeout: 5000 }).catch(()=>{});
                const resultText = await page.evaluate(() => {
                    const cards = Array.from(document.querySelectorAll('li, div[class*="GameCard"]'));
                    const valid = cards.find(el => el.innerText.includes('Hours') || el.innerText.includes('Mins'));
                    return valid ? valid.innerText.replace(/\n/g, ' ') : null;
                });
                if (resultText) {
                    const match = resultText.match(/main story.*?([0-9]+(\.[0-9]+)?)/i);
                    if (match) playTime = { main: parseFloat(match[1]), raw: resultText };
                }
            } catch(e) {}

            let priceInfo = {
                isFree: data.is_free || false,
                current_price: 0,
                discount_percent: 0,
                store_name: 'Steam',
                store_url: `https://store.steampowered.com/app/${item.steamAppId}/`,
                deals: []
            };

            if (data.price_overview) {
                priceInfo.current_price = data.price_overview.final;
                priceInfo.discount_percent = data.price_overview.discount_percent;
                priceInfo.deals.push({
                    shopName: 'Steam',
                    price: data.price_overview.final,
                    regularPrice: data.price_overview.initial,
                    url: `https://store.steampowered.com/app/${item.steamAppId}/`
                });
            }

            try {
                await page.goto(`https://isthereanydeal.com/steam/app/${item.steamAppId}/`, { waitUntil: 'networkidle2', timeout: 15000 });
                
                const itadDeals = await page.evaluate(() => {
                    const deals = [];
                    const links = Array.from(document.querySelectorAll('a[href*="/out/"]'));
                    
                    links.forEach(link => {
                        const container = link.closest('div');
                        if (!container) return;
                        
                        const shopName = link.innerText.trim();
                        const textContent = container.innerText || '';
                        
                        const priceMatch = textContent.match(/[\$₩€£]?\s*([0-9,]+(\.[0-9]{1,2})?)/);
                        if (shopName && priceMatch) {
                            const priceVal = parseFloat(priceMatch[1].replace(/,/g, ''));
                            const finalPrice = textContent.includes('$') || priceVal < 500 ? priceVal * 1350 : priceVal;
                            
                            deals.push({
                                shopName: shopName,
                                price: Math.round(finalPrice),
                                url: link.href
                            });
                        }
                    });
                    return deals;
                });

                if (itadDeals.length > 0) {
                    itadDeals.forEach(deal => {
                        if (deal.shopName.toLowerCase() !== 'steam' && deal.price > 0) {
                            priceInfo.deals.push({
                                shopName: deal.shopName,
                                price: deal.price,
                                regularPrice: data.price_overview?.initial || deal.price,
                                url: deal.url
                            });
                        }
                    });

                    const lowestDeal = priceInfo.deals.reduce((min, d) => d.price < min.price ? d : min, priceInfo.deals[0]);
                    if (lowestDeal && lowestDeal.price < priceInfo.current_price) {
                        priceInfo.current_price = lowestDeal.price;
                        if (data.price_overview?.initial > 0) {
                            priceInfo.discount_percent = Math.round((1 - lowestDeal.price / data.price_overview.initial) * 100);
                        }
                    }
                }
            } catch(e) {
                console.log(`      ⚠️ ITAD 스크래핑 실패 (Steam 공식 가격으로 우회 적용됨)`);
            }

            const rawTags = scrapedTags.length > 0 ? scrapedTags : (data.genres || []).map(g => g.description);
            const updateData = {
                slug: `steam-${item.steamAppId}`, 
                steam_appid: item.steamAppId, 
                title: data.name,
                main_image: data.header_image, 
                description: data.short_description,
                smart_tags: mapSteamTags(rawTags),
                releaseDate: data.release_date?.date ? parseSafeDate(data.release_date.date) : undefined,
                play_time: playTime,
                price_info: priceInfo
            };

            await Game.findOneAndUpdate({ steam_appid: item.steamAppId }, updateData, { upsert: true });
            console.log(`✅ [신규/보강] ${data.name} 수집 및 업데이트 완료`);
            
        } catch(e) {
            console.log(`❌ 처리 중 에러: ${item.title} - ${e.message}`);
        } finally {
            if (page) await page.close().catch(()=>{});
        }
    }

    await browser.close();
    console.log(`\n🎉 메타데이터 수집 완료`);
    process.exit(0);
}

collectGameData();