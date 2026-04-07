// backend/scripts/game_collector.js
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const axios = require('axios');
const puppeteer = require('puppeteer-core');
const os = require('os');
const fs = require('fs');

const Game = require('../models/Game');
const GameCategory = require('../models/GameCategory');
const { mapSteamTags } = require('../utils/tagMapper');

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
    console.log('✅ DB Connected. [신규 메타데이터] 수집기 시작...');

    const existingAppIds = new Set((await Game.find({}).select('steam_appid').lean()).map(g => g.steam_appid));
    const trendingGames = await getTrendingAppIds();
    
    // 신규 게임 20개 + 기존 플탐 누락 게임 10개 = 최대 30개만 타겟팅 (OOM 방지)
    const newGames = trendingGames.filter(g => !existingAppIds.has(g.steamAppId)).slice(0, 20);
    const missingGames = await Game.find({ play_time: null }).select('steam_appid title').limit(10).lean();
    const targetBatch = [...newGames, ...missingGames.map(g => ({ steamAppId: g.steam_appid, title: g.title }))];

    if (targetBatch.length === 0) {
        console.log("처리할 신규 데이터가 없습니다.");
        process.exit(0);
    }

    const chromePath = findChromePath();
    let browser = await puppeteer.launch({ executablePath: chromePath, headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });

    for (const item of targetBatch) {
        let page = null;
        try {
            const steamRes = await axios.get(`https://store.steampowered.com/api/appdetails`, { params: { appids: item.steamAppId, l: 'korean', cc: 'kr' }, headers: STEAM_HEADERS, timeout: 10000 }).catch(()=>({data:null}));
            const data = steamRes.data?.[item.steamAppId]?.data;
            if (!data) continue;

            let scrapedTags = [];
            let playTime = null;

            page = await browser.newPage();
            await page.setRequestInterception(true);
            page.on('request', (req) => { ['image', 'stylesheet', 'media'].includes(req.resourceType()) ? req.abort() : req.continue(); });

            // 1. 태그 수집
            try {
                await page.goto(`https://store.steampowered.com/app/${item.steamAppId}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
                const ageGate = await page.$('#ageYear');
                if (ageGate) { await page.select('#ageYear', '2000'); await page.click('.btnv6_blue_hoverfade_btn').catch(()=>{}); }
                scrapedTags = await page.evaluate(() => Array.from(document.querySelectorAll('.app_tag')).map(el => el.innerText.trim()));
            } catch(e) {}

            // 2. 플레이타임 수집
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

            const rawTags = scrapedTags.length > 0 ? scrapedTags : (data.genres || []).map(g => g.description);
            const updateData = {
                slug: `steam-${item.steamAppId}`, steam_appid: item.steamAppId, title: data.name,
                main_image: data.header_image, description: data.short_description,
                smart_tags: mapSteamTags(rawTags),
                releaseDate: data.release_date?.date ? parseSafeDate(data.release_date.date) : undefined,
                play_time: playTime,
            };

            await Game.findOneAndUpdate({ steam_appid: item.steamAppId }, updateData, { upsert: true });
            console.log(`✅ [신규/보강] ${data.name} 수집 완료`);
            
        } catch(e) {} finally {
            if (page) await page.close().catch(()=>{});
        }
    }

    await browser.close();
    console.log(`\n🎉 메타데이터 수집 완료`);
    process.exit(0);
}

collectGameData();