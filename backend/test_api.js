// backend/test_api.js

require('dotenv').config();
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const os = require('os');

// 테스트 대상
const TEST_APPS = [
    { name: "Divinity: Original Sin 2 - Definitive Edition" },
    { name: "Sid Meier's Civilization® V" },
    { name: "BioShock Infinite: The Complete Edition" },
    { name: "Clair Obscur: Expedition 33" }, 
    { name: "Hades" },
    { name: "DOOM" },
    { name: "Subnautica" } // 실패했던 항목 다시 확인
];

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
    } else if (platform === 'darwin') {
        return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    }
    return null;
}

// 1. 이름 정제
function cleanGameTitle(title) {
    if (!title) return "";
    let clean = title;

    // 상표권 기호 제거
    clean = clean.replace(/[™®©]/g, '');

    // 부제/에디션 제거
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
    
    removePatterns.forEach(regex => {
        clean = clean.replace(regex, '');
    });

    // 끝에 남은 특수문자 및 공백 제거
    clean = clean.replace(/[\s\:\-]+$/g, '');

    // 관사 제거
    if (clean.toLowerCase().endsWith(' the')) {
        clean = clean.substring(0, clean.length - 4);
    }

    return clean.trim();
}

// 2. 유사도 계산
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

async function testHLTB_FinalCheck() {
    console.log("🔍 HLTB 데이터 수집 테스트 (로딩 대기 로직 강화)...\n");

    const chromePath = findChromePath();
    if (!chromePath) { console.error("❌ 크롬 경로 없음"); process.exit(1); }

    let browser;
    try {
        browser = await puppeteer.launch({ 
            executablePath: chromePath,
            headless: "new", 
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
    
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        for (const game of TEST_APPS) {
            const originalName = game.name;
            const searchName = cleanGameTitle(originalName); 

            console.log(`🎮 [Target] "${originalName}"`);
            console.log(`   📡 검색어: "${searchName}"`);

            const searchUrl = `https://howlongtobeat.com/?q=${encodeURIComponent(searchName)}`;
            await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // ★ [핵심 수정] 무작정 기다리는 대신, 데이터가 화면에 뜰 때까지 대기 (최대 5초)
            try {
                await page.waitForFunction(
                    () => {
                        const text = document.body.innerText;
                        // "Main Story"나 "We couldn't find anything" 둘 중 하나가 뜰 때까지 대기
                        return text.includes("Main Story") || text.includes("We couldn't find anything") || text.includes("No results");
                    },
                    { timeout: 5000 } 
                );
            } catch (e) {
                // 타임아웃 시 무시하고 진행 (아래 로직에서 처리)
            }
            
            // 렌더링 안정화를 위해 짧게 대기
            await sleep(500);

            const candidates = await page.evaluate(() => {
                const items = Array.from(document.querySelectorAll('li'));
                const results = [];
                
                const IGNORE_LIST = ["Forum", "Stats", "Submit", "Login", "Join", "Discord", "Facebook", "Twitter"];

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
                    const completionist = parseTime(['Completionist', '100%']);

                    if (main || extra || completionist) {
                        results.push({
                            title: title,
                            main: main || 'TBD',
                            extra: extra || 'TBD',
                            completionist: completionist || 'TBD'
                        });
                    }
                }
                return results;
            });

            if (candidates.length > 0) {
                let bestMatch = null;
                let maxScore = 0;

                for (const candidate of candidates) {
                    const score = getSimilarity(originalName, candidate.title);
                    if (score > maxScore) {
                        maxScore = score;
                        bestMatch = candidate;
                    }
                }

                if (bestMatch && maxScore > 0.5) { // 유사도 기준 50%
                    console.log(`   ✅ 매칭 성공! (유사도: ${Math.floor(maxScore * 100)}%)`);
                    console.log(`      - 게임명: ${bestMatch.title}`);
                    console.log(`      - 시간: Main ${bestMatch.main} / Extra ${bestMatch.extra} / 100% ${bestMatch.completionist}`);
                } else {
                    console.log(`   ⚠️ 매칭 실패 (최고 유사도: ${maxScore.toFixed(2)})`);
                }
            } else {
                console.log("   ❌ 검색 결과 없음 (데이터 로딩 실패 또는 결과 없음)");
            }
            console.log("-".repeat(50));
            await sleep(1000); 
        }

    } catch (e) {
        console.error("🚨 오류:", e);
    } finally {
        if (browser) await browser.close();
    }
}

testHLTB_FinalCheck();