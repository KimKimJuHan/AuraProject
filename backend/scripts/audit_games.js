// backend/scripts/hltb_fill_all.js
// 기능: HLTB 기준으로 play_time 비어있는 게임 최대한 채우기

require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const puppeteer = require('puppeteer-core');
const os = require('os');
const fs = require('fs');
const Game = require('../models/Game');

const { MONGODB_URI } = process.env;

// ---- Chrome 경로 탐색 (윈도우 + 리눅스 간단 대응) ----
function findChromePath() {
    const platform = os.platform();
    const candidates = [];

    if (platform === 'win32') {
        candidates.push(
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            `C:\\Users\\${process.env.USERNAME}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`
        );
    } else if (platform === 'linux') {
        candidates.push(
            '/usr/bin/google-chrome',
            '/usr/bin/chromium-browser'
        );
    } else if (platform === 'darwin') {
        candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    }

    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }

    console.error('❌ Chrome 경로 없음');
    process.exit(1);
}

// ---- 제목 정리 ----
function cleanTitle(title) {
    if (!title) return '';
    return title
        .replace(/[™®©]/g, '')          // 상표 기호 제거
        .replace(/\[[^\]]*\]/g, '')      // [ ... ] 제거
        .replace(/\([^)]*\)/g, '')       // ( ... ) 제거
        .replace(/Edition|Remastered|HD Remaster/gi, '')
        .replace(/[:\-–—]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// ---- HLTB 페이지에서 시간 추출 ----
const LABEL_PRIORITY = [
    'Main Story',
    'Main \\+ Extra',
    'Main Story \\+ Extra',
    'Main Story and Extra',
    'Completionist',
    'All Styles',
    'Single-Player',
    'Solo',
    'Co-Op'
];

// "12½ Hours", "4.5 Hours", "30 Mins" 등 패턴 공통 처리
function normalizeTimeMatch(numStr, unit) {
    const n = numStr.replace('½', '.5');
    if (/Hour/i.test(unit)) {
        return `${n} 시간`;
    }
    if (/Min/i.test(unit)) {
        return `${n} 분`;
    }
    // 혹시 다른 게 들어와도 안전하게 처리
    return `${n} ${unit}`;
}

async function extractPlaytimeFromPage() {
    return await page.evaluate((LABEL_PRIORITY, normalizeTimeMatchStr) => {
        const normalizeTimeMatch = new Function('numStr', 'unit', normalizeTimeMatchStr);

        const cards = Array.from(
            document.querySelectorAll(
                '.search_list_details, ul.search_list li, div[class*="GameCard"]'
            )
        );

        if (cards.length === 0) return null;

        // 카드들 돌면서 우선순위 라벨 기준으로 찾기
        for (const card of cards) {
            const raw = card.innerText.replace(/\n/g, ' ');
            const text = raw.replace(/\s+/g, ' ').trim();

            // 라벨 우선 검색
            for (const label of LABEL_PRIORITY) {
                const re = new RegExp(
                    `${label}[\\s\\S]*?([0-9½\\.]+)\\s*(Hours|Hour|Mins|Minutes|Hrs)`,
                    'i'
                );
                const m = text.match(re);
                if (m) {
                    return normalizeTimeMatch(m[1], m[2]);
                }
            }
        }

        // 라벨이 하나도 없으면: 첫 번째 시간 패턴이라도 뽑아서 사용 (fallback)
        const genericTimeRe = /([0-9½\\.]+)\s*(Hours|Hour|Mins|Minutes|Hrs)/i;
        for (const card of cards) {
            const raw = card.innerText.replace(/\n/g, ' ');
            const text = raw.replace(/\s+/g, ' ').trim();
            const m = text.match(genericTimeRe);
            if (m) {
                return normalizeTimeMatch(m[1], m[2]);
            }
        }

        return null;
    }, LABEL_PRIORITY, normalizeTimeMatch.toString());
}

// ---- 메인 로직 ----
async function fillHLTBAll() {
    if (!MONGODB_URI) {
        console.error('❌ MONGODB_URI 누락');
        process.exit(1);
    }

    await mongoose.connect(MONGODB_URI);
    console.log('✅ DB 연결됨. HLTB 정밀 보강 시작...\n');

    // play_time 비어있는 전체 대상
    const targets = await Game.find({
        $or: [
            { play_time: { $exists: false } },
            { play_time: '정보 없음' },
            { play_time: null },
            { play_time: '' }
        ]
    })
    .select('_id title steam_appid')
    .lean();

    console.log(`🎯 대상: ${targets.length}개\n`);
    if (targets.length === 0) {
        console.log('🎉 채울 게임이 없습니다. 이미 모두 완료되었습니다.');
        process.exit(0);
    }

    const chromePath = findChromePath();

    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: 'new',
        args: ['--no-sandbox', '--disable-dev-shm-usage']
    });

    global.page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0');

    let success = 0;
    let fail = 0;

    for (const game of targets) {
        console.log(`🔍 ${game.title}`);
        const base = game.title || '';
        const cleaned = cleanTitle(base);

        const queries = Array.from(
            new Set([
                base,
                cleaned,
                cleaned.toLowerCase()
            ].filter(q => q && q.length > 1))
        );

        let parsedPlaytime = null;

        for (const q of queries) {
            try {
                await page.goto(
                    `https://howlongtobeat.com/?q=${encodeURIComponent(q)}`,
                    { waitUntil: 'domcontentloaded', timeout: 25000 }
                );

                await page.waitForSelector(
                    '.search_list_details, ul.search_list, div[class*="GameCard"]',
                    { timeout: 6000 }
                ).catch(() => {});

                parsedPlaytime = await extractPlaytimeFromPage();

                if (parsedPlaytime) break;
            } catch (e) {
                // 타임아웃/네트워크 에러는 다음 쿼리로 넘김
            }
        }

        if (parsedPlaytime) {
            await Game.updateOne(
                { _id: game._id },
                {
                    play_time: parsedPlaytime,
                    hltb_status: 'ok',
                    hltb_updatedAt: new Date()
                }
            );
            success++;
            console.log(`   ✅ 정상 저장 → ${parsedPlaytime}\n`);
        } else {
            await Game.updateOne(
                { _id: game._id },
                {
                    hltb_status: 'fail',
                    hltb_updatedAt: new Date()
                }
            );
            fail++;
            console.log('   ❌ 실패 (시간 파싱 불가)\n');
        }

        // HLTB 차단 방지용 딜레이
        await new Promise(r => setTimeout(r, 900));
    }

    await browser.close();

    console.log(`🎯 결과: 성공 ${success} / 실패 ${fail}`);
    process.exit(0);
}

fillHLTBAll().catch(err => {
    console.error('🚨 스크립트 오류:', err);
    process.exit(1);
});
