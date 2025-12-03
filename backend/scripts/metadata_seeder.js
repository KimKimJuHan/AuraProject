// backend/scripts/metadata_seeder.js
// 기능: Puppeteer로 스팀 '최고 인기 제품' 페이지를 순회하며 2500개 게임 확보

require("dotenv").config({ path: '../.env' }); 
const mongoose = require("mongoose");
const puppeteer = require('puppeteer-core');
const os = require('os');
const fs = require('fs');
const GameMetadata = require("../models/GameMetadata");

const { MONGODB_URI } = process.env;

if (!MONGODB_URI) {
  console.error("🚨 MONGODB_URI 누락");
  process.exit(1);
}

// 크롬 경로 찾기
function findChromePath() {
  const platform = os.platform();
  if (platform === 'win32') {
    const paths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      `C:\\Users\\${process.env.USERNAME}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`,
    ];
    for (const p of paths) if (fs.existsSync(p)) return p;
  } else if (platform === 'linux') {
    const paths = ['/usr/bin/google-chrome', '/usr/bin/chromium-browser'];
    for (const p of paths) if (fs.existsSync(p)) return p;
  } else if (platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  }
  return null;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 불필요한 키워드 필터링
function isBadSteamName(name) {
  if (!name) return true;
  const x = name.toLowerCase();
  const badWords = [
    "legacy", "soundtrack", "ost", "pack", "demo", "test", "beta", "server", "tool", "artwork", "wallpaper", "artbook"
  ];
  return badWords.some(w => x.includes(w));
}

async function seedMetadata() {
  await mongoose.connect(MONGODB_URI);
  console.log("📌 DB 연결됨. Puppeteer로 스팀 인기 게임 2500개 확보 시작...");

  const chromePath = findChromePath();
  if (!chromePath) { console.error('❌ Chrome 경로 없음'); process.exit(1); }

  // 브라우저 실행
  const browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  // 봇 탐지 방지
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
  
  // 이미지/CSS 차단 (속도 향상)
  await page.setRequestInterception(true);
  page.on('request', (req) => {
      if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
          req.abort();
      } else {
          req.continue();
      }
  });

  // ★ [핵심] 스팀 상점 페이지네이션 (Page 1 ~ 100)
  const MAX_PAGES = 100; // 25개 * 100페이지 = 2500개
  let totalSaved = 0;
  let totalSkipped = 0;
  let totalExists = 0;

  try {
      for (let p = 1; p <= MAX_PAGES; p++) {
          console.log(`\n📡 스팀 상점 페이지 조회 중... (Page ${p}/${MAX_PAGES})`);
          
          // 스팀 인기 순위 페이지 URL
          const url = `https://store.steampowered.com/search/?filter=topsellers&category1=998&page=${p}`;

          try {
              await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
              
              // 페이지 내 게임 목록 추출
              const games = await page.evaluate(() => {
                  const rows = document.querySelectorAll('#search_resultsRows a');
                  const data = [];
                  rows.forEach(row => {
                      const titleEl = row.querySelector('.title');
                      const idAttr = row.getAttribute('data-ds-appid');
                      
                      if (titleEl && idAttr) {
                          // 번들인 경우 첫 번째 ID만 사용
                          const appId = idAttr.split(',')[0];
                          const title = titleEl.innerText.trim();
                          data.push({ appId, title });
                      }
                  });
                  return data;
              });

              if (games.length === 0) {
                  console.log("⚠️ 게임을 찾지 못했습니다. (페이지 끝 또는 로딩 실패)");
                  // 연속 실패 방지를 위해 잠시 대기 후 재시도하지 않고 다음 페이지로
                  await sleep(2000);
                  continue;
              }

              console.log(`   => ${games.length}개 항목 발견. 저장 중...`);

              for (const game of games) {
                  const { appId, title } = game;

                  if (isBadSteamName(title)) {
                      totalSkipped++;
                      continue;
                  }

                  const exists = await GameMetadata.findOne({ steamAppId: appId });
                  if (exists) {
                      totalExists++;
                      await GameMetadata.updateOne({ steamAppId: appId }, { lastUpdated: Date.now() });
                      continue;
                  }

                  await GameMetadata.create({
                      steamAppId: appId,
                      title: title,
                      itad: { uuid: null }, 
                      lastUpdated: Date.now()
                  });
                  
                  totalSaved++;
                  console.log(`   ✅ 신규 저장: ${title} (ID: ${appId})`);
              }
              
              // 페이지 넘김 딜레이 (차단 방지)
              const delay = Math.floor(Math.random() * 1000) + 1500;
              await sleep(delay);

          } catch (err) {
              console.error(`   ❌ 페이지 로딩 에러 (Page ${p}):`, err.message);
              await sleep(3000);
          }
      }
  } catch (err) {
      console.error("❌ 전체 프로세스 에러:", err);
  } finally {
      if (browser) await browser.close();
      await mongoose.disconnect();
  }

  console.log(`\n\n🎉 시딩 완료!`);
  console.log(`   - 신규 저장: ${totalSaved}개`);
  console.log(`   - 이미 존재(갱신): ${totalExists}개`);
  console.log(`   - 필터링됨: ${totalSkipped}개`);
  
  process.exit(0);
}

seedMetadata();