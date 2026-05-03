/**
 * repatch_smart_tags.js
 *
 * Puppeteer로 Steam 스토어 .app_tag를 직접 스크래핑해서
 * tags(원본 전체) + smart_tags(한국어 매핑) 둘 다 저장합니다.
 *
 * - 이미 tags가 있는 게임은 smart_tags만 재매핑 (빠름)
 * - tags 없는 게임만 Puppeteer로 스크래핑
 *
 * 실행: node scripts/repatch_smart_tags.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const axios = require('axios');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const os = require('os');

const Game = require('../models/Game');
const { mapSteamTags } = require('../utils/tagMapper');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('❌ MONGODB_URI 없음'); process.exit(1); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Chrome 경로 탐색 ──────────────────────────────────────────────────────────
function findChromePath() {
    const candidates = [
        // Windows
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
        // macOS
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        // Linux
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/snap/bin/chromium',
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

// ── 브라우저 인스턴스 관리 ────────────────────────────────────────────────────
let browserInstance = null;
let pageInstance = null;

async function launchBrowser(chromePath) {
    if (browserInstance) {
        try { await browserInstance.close(); } catch {}
    }
    browserInstance = await puppeteer.launch({
        executablePath: chromePath,
        headless: 'new',
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-setuid-sandbox']
    });
    pageInstance = await browserInstance.newPage();

    await pageInstance.setRequestInterception(true);
    pageInstance.on('request', req => {
        if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
            req.abort();
        } else {
            req.continue();
        }
    });
    await pageInstance.setCookie(
        { name: 'birthtime', value: '0', domain: 'store.steampowered.com' },
        { name: 'wants_mature_content', value: '1', domain: 'store.steampowered.com' },
        { name: 'Steam_Language', value: 'korean', domain: 'store.steampowered.com' }
    );
    return pageInstance;
}

// ── Steam .app_tag 스크래핑 ───────────────────────────────────────────────────
async function scrapeAppTags(appId) {
    try {
        await pageInstance.goto(`https://store.steampowered.com/app/${appId}/`, {
            waitUntil: 'domcontentloaded',
            timeout: 15000
        });

        // 나이 인증 처리
        const ageGate = await pageInstance.$('#ageYear');
        if (ageGate) {
            await pageInstance.select('#ageYear', '2000');
            await pageInstance.click('.btnv6_blue_hoverfade_btn').catch(() => {});
            await sleep(1500);
        }

        const tags = await pageInstance.evaluate(() =>
            Array.from(document.querySelectorAll('.app_tag'))
                .map(el => el.innerText.trim())
                .filter(t => t && t !== '+')
        );

        return tags;
    } catch {
        return [];
    }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ DB 연결 완료');

    const allGames = await Game.find({
        steam_appid: { $exists: true, $ne: null }
    }).select('_id title steam_appid tags smart_tags').lean();

    // tags 있는 것 / 없는 것 분리
    const hasTags    = allGames.filter(g => Array.isArray(g.tags) && g.tags.length > 0);
    const missingTags = allGames.filter(g => !Array.isArray(g.tags) || g.tags.length === 0);

    console.log(`📋 전체: ${allGames.length}개`);
    console.log(`   tags 있음 (smart_tags 재매핑만): ${hasTags.length}개`);
    console.log(`   tags 없음 (Puppeteer 스크래핑): ${missingTags.length}개`);
    console.log(`⏱  예상 소요: 약 ${Math.ceil(missingTags.length * 3 / 60)}분\n`);

    // ── 1단계: tags 있는 게임 → smart_tags 즉시 재매핑 (벌크) ────────────────
    console.log('1단계: smart_tags 재매핑 중...');
    const bulkOps = [];
    let remapped = 0;

    for (const game of hasTags) {
        const newSmartTags = mapSteamTags(game.tags);
        const oldStr = Array.isArray(game.smart_tags) ? [...game.smart_tags].sort().join(',') : '';
        const newStr = [...newSmartTags].sort().join(',');
        if (oldStr === newStr) continue;
        bulkOps.push({
            updateOne: {
                filter: { _id: game._id },
                update: { $set: { smart_tags: newSmartTags } }
            }
        });
        remapped++;
    }

    if (bulkOps.length > 0) {
        for (let i = 0; i < bulkOps.length; i += 500) {
            await Game.bulkWrite(bulkOps.slice(i, i + 500));
        }
    }
    console.log(`   ✅ ${remapped}개 재매핑 완료\n`);

    // ── 2단계: tags 없는 게임 → Puppeteer 스크래핑 ───────────────────────────
    if (missingTags.length === 0) {
        console.log('2단계: 스크래핑 대상 없음. 완료!');
        process.exit(0);
    }

    console.log(`2단계: Puppeteer로 ${missingTags.length}개 스크래핑 시작...`);

    const chromePath = findChromePath();
    if (!chromePath) {
        console.error('❌ Chrome/Chromium을 찾을 수 없습니다.');
        console.error('   Windows: Chrome 설치 확인');
        console.error('   macOS: /Applications/Google Chrome.app 확인');
        console.error('   EC2: sudo apt-get install -y chromium-browser');
        process.exit(1);
    }
    console.log(`🌐 Chrome: ${chromePath}\n`);

    await launchBrowser(chromePath);

    let scraped = 0;
    let noTags = 0;
    let noMapping = 0;
    let failStreak = 0;
    const FAIL_THRESHOLD = 5;

    for (let i = 0; i < missingTags.length; i++) {
        const game = missingTags[i];
        const progress = `[${i + 1}/${missingTags.length}]`;

        const appTags = await scrapeAppTags(game.steam_appid);

        if (appTags.length === 0) {
            failStreak++;
            console.log(`${progress} ⚠️  태그 없음 (${failStreak}연속): ${game.title}`);

            if (failStreak >= FAIL_THRESHOLD) {
                console.log('  🔄 브라우저 재시작...');
                await launchBrowser(chromePath);
                failStreak = 0;
                await sleep(3000);
            }
            noTags++;
            await sleep(500);
            continue;
        }

        failStreak = 0;
        const newSmartTags = mapSteamTags(appTags);

        if (newSmartTags.length === 0) {
            // 원본은 저장, smart_tags 빈 채로
            await Game.updateOne({ _id: game._id }, { $set: { tags: appTags } });
            console.log(`${progress} ⚠️  매핑 없음: ${game.title}`);
            console.log(`     원본: [${appTags.slice(0, 5).join(', ')}]`);
            noMapping++;
            await sleep(1000);
            continue;
        }

        await Game.updateOne(
            { _id: game._id },
            { $set: { tags: appTags, smart_tags: newSmartTags } }
        );

        console.log(`${progress} ✅ ${game.title}`);
        console.log(`     원본: [${appTags.slice(0, 6).join(', ')}]`);
        console.log(`     변환: [${newSmartTags.join(', ')}]`);
        scraped++;

        await sleep(1500);
    }

    if (browserInstance) await browserInstance.close();

    console.log('\n════════════════════════════════════');
    console.log('🎉 완료!');
    console.log(`   1단계 재매핑:  ${remapped}개`);
    console.log(`   2단계 스크래핑: ${scraped}개`);
    console.log(`   태그 없음:     ${noTags}개`);
    console.log(`   매핑 없음:     ${noMapping}개`);
    console.log('════════════════════════════════════');
    process.exit(0);
}

run().catch(err => {
    console.error('💥 크래시:', err);
    if (browserInstance) browserInstance.close().catch(() => {});
    process.exit(1);
});