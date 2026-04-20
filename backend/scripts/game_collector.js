require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const axios = require('axios');
const puppeteer = require('puppeteer-core');
const os = require('os');
const fs = require('fs');

const Game = require('../models/Game');
const { mapSteamTags } = require('../utils/tagMapper');

// 시스템 유틸리티 예외 처리
try {
    const { setupAxiosRetry } = require('../utils/systemHelper');
    if (setupAxiosRetry) setupAxiosRetry();
} catch (e) {}

const { MONGODB_URI } = process.env;
if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI가 설정되지 않았습니다.");
    process.exit(1);
}

const STEAM_HEADERS = { 
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 
    'Cookie': 'birthtime=0; wants_mature_content=1; Steam_Language=korean;' 
};

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
    } catch(e) { console.log("⚠️ SteamSpy 호출 실패, 수집 대상을 제한합니다."); }
    return [];
}

async function collectGameData() {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ DB Connected. 수집기(v2.0 - 태그 백업 기능 포함) 시작...');

    const existingAppIds = new Set((await Game.find({}).select('steam_appid').lean()).map(g => g.steam_appid));
    const trendingGames = await getTrendingAppIds();
    
    // 신규 20개 + 누락 보강 10개 (안정성을 위한 배치 처리)
    const newGames = trendingGames.filter(g => !existingAppIds.has(g.steamAppId)).slice(0, 20);
    const missingGames = await Game.find({ play_time: null }).select('steam_appid title').limit(10).lean();
    const targetBatch = [...newGames, ...missingGames.map(g => ({ steamAppId: g.steam_appid, title: g.title }))];

    if (targetBatch.length === 0) {
        console.log("처리할 데이터가 없습니다.");
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
            // 1. Steam Store API 기본 데이터
            const steamRes = await axios.get(`https://store.steampowered.com/api/appdetails`, { 
                params: { appids: item.steamAppId, l: 'korean', cc: 'kr' }, 
                headers: STEAM_HEADERS, 
                timeout: 10000 
            }).catch(()=>({data:null}));
            
            const data = steamRes.data?.[item.steamAppId]?.data;
            
            // ★ [필터링 고도화] 비게임(유틸리티/소프트웨어) 필터링
            const isSoftware = data?.genres?.some(g => 
                ['Software', 'Utilities', 'Design & Illustration', 'Animation & Modeling', 'Video Production'].includes(g.description)
            );

            if (!data || data.type !== 'game' || isSoftware) {
                console.log(`⏩ [스킵] ${item.title || item.steamAppId} (게임 아님/소프트웨어)`);
                continue; 
            }

            let scrapedTags = [];
            let playTime = null;

            page = await browser.newPage();
            await page.setRequestInterception(true);
            page.on('request', (req) => { 
                ['image', 'stylesheet', 'media', 'font'].includes(req.resourceType()) ? req.abort() : req.continue(); 
            });

            // 2. 스팀 페이지 태그 스크래핑
            try {
                await page.goto(`https://store.steampowered.com/app/${item.steamAppId}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
                const ageGate = await page.$('#ageYear');
                if (ageGate) { await page.select('#ageYear', '2000'); await page.click('.btnv6_blue_hoverfade_btn').catch(()=>{}); }
                scrapedTags = await page.evaluate(() => Array.from(document.querySelectorAll('.app_tag')).map(el => el.innerText.trim()));
            } catch(e) {}

            // 3. HLTB 플레이타임 스크래핑
            try {
                const cleanName = data.name.replace(/[™®©]/g, '').split(':')[0].trim();
                await page.goto(`https://howlongtobeat.com/?q=${encodeURIComponent(cleanName)}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
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

            // 4. 가격 정보 수집 (Steam + ITAD 최저가)
            let priceInfo = {
                isFree: data.is_free || false,
                current_price: data.price_overview?.final || 0,
                discount_percent: data.price_overview?.discount_percent || 0,
                store_name: 'Steam',
                store_url: `https://store.steampowered.com/app/${item.steamAppId}/`,
                deals: []
            };

            // ITAD 가격 스크래핑 로직 (생략 가능하지만 정확도를 위해 포함)
            try {
                await page.goto(`https://isthereanydeal.com/steam/app/${item.steamAppId}/`, { waitUntil: 'networkidle2', timeout: 15000 });
                const itadDeals = await page.evaluate(() => {
                    const deals = [];
                    const links = Array.from(document.querySelectorAll('a[href*="/out/"]'));
                    links.forEach(link => {
                        const shopName = link.innerText.trim();
                        const priceMatch = link.closest('div')?.innerText.match(/[\$₩]?\s*([0-9,]+(\.[0-9]{1,2})?)/);
                        if (shopName && priceMatch) {
                            let priceVal = parseFloat(priceMatch[1].replace(/,/g, ''));
                            if (priceVal < 1000 && !link.closest('div')?.innerText.includes('₩')) priceVal *= 1350; // USD 변환
                            deals.push({ shopName, price: Math.round(priceVal), url: link.href });
                        }
                    });
                    return deals;
                });
                if (itadDeals.length > 0) priceInfo.deals = itadDeals;
            } catch(e) {}

            // ★ 핵심: 태그 데이터 정규화 및 백업
            const rawTags = scrapedTags.length > 0 ? scrapedTags : (data.genres || []).map(g => g.description);
            
            const updateData = {
                slug: `steam-${item.steamAppId}`, 
                steam_appid: item.steamAppId, 
                title: data.name,
                main_image: data.header_image, 
                description: data.short_description,
                
                // ★ [복구 완료] 원본 태그를 tags에 백업하고, 정제된 태그를 smart_tags에 저장
                tags: rawTags, 
                smart_tags: mapSteamTags(rawTags), 
                
                releaseDate: data.release_date?.date ? parseSafeDate(data.release_date.date) : undefined,
                play_time: playTime,
                price_info: priceInfo,
                lastUpdated: new Date()
            };

            await Game.findOneAndUpdate({ steam_appid: item.steamAppId }, updateData, { upsert: true });
            console.log(`✅ [수집완료] ${data.name} (태그: ${updateData.smart_tags.length}개 정제됨)`);
            
        } catch(e) {
            console.log(`❌ 에러: ${item.title} - ${e.message}`);
        } finally {
            if (page) await page.close().catch(()=>{});
        }
    }

    await browser.close();
    console.log(`🎉 수집 완료`);
    process.exit(0);
}

collectGameData();