// backend/collector.js
// 역할: GameMetadata(족보)를 기준으로
//  - Steam 메타데이터
//  - ITAD 가격 정보
//  - Twitch / Chzzk 트렌드
//  - HLTB 플레이타임
// 을 모아서 Game 컬렉션에 upsert

require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const puppeteer = require('puppeteer-core');
const os = require('os');
const fs = require('fs');

const Game = require('./models/Game');
const GameCategory = require('./models/GameCategory');
const GameMetadata = require('./models/GameMetadata');

const {
  MONGODB_URI,
  ITAD_API_KEY,
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
  CHZZK_CLIENT_ID,
  CHZZK_CLIENT_SECRET,
} = process.env;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI 누락');
  process.exit(1);
}
if (!ITAD_API_KEY) {
  console.error('❌ ITAD_API_KEY 누락');
  process.exit(1);
}

const STEAM_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** ─────────────────────────────
 *  1. 크롬 경로 자동 탐색 (puppeteer-core)
 * ───────────────────────────── */
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

/** ─────────────────────────────
 *  2. HLTB 검색용 제목 정제
 *     (에디션/상표기호 제거, Legacy Edition 등)
 * ───────────────────────────── */
function cleanGameTitle(title) {
  if (!title) return '';
  let clean = title.replace(/[™®©]/g, ''); // 상표 기호 제거

  const removePatterns = [
    /Game of the Year Edition/gi,
    /GOTY Edition/gi,
    /GOTY/gi,
    /Definitive Edition/gi,
    /Enhanced Edition/gi,
    /Director's Cut/gi,
    /The Final Cut/gi,
    /Complete Edition/gi,
    /Anniversary Edition/gi,
    /Remastered/gi,
    /Digital Deluxe/gi,
    /Standard Edition/gi,
    /Legendary Edition/gi,
    /Special Edition/gi,
    /Collector's Edition/gi,
    // Legacy 관련 — "Legacy Edition/Version/(Legacy)" 만 제거
    /Legacy Edition/gi,
    /Legacy Version/gi,
    /\(Legacy\)/gi,
  ];

  removePatterns.forEach((regex) => {
    clean = clean.replace(regex, '');
  });

  // 끝에 남은 특수문자 및 공백 제거
  clean = clean.replace(/[\s:-]+$/g, '');
  // 끝이 " the" 인 경우 제거
  if (clean.toLowerCase().endsWith(' the')) {
    clean = clean.slice(0, -4);
  }

  return clean.trim();
}

/** 배열을 chunk로 나누기 (배치 처리용) */
function chunkArray(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) {
    out.push(array.slice(i, i + size));
  }
  return out;
}

/** ─────────────────────────────
 *  3. 태그 한글화 매핑 (smart_tags)
 * ───────────────────────────── */
function translateTags(tags) {
  const TAG_MAP = {
    rpg: 'RPG',
    action: '액션',
    fps: 'FPS',
    simulation: '시뮬레이션',
    strategy: '전략',
    sports: '스포츠',
    racing: '레이싱',
    puzzle: '퍼즐',
    survival: '생존',
    horror: '공포',
    adventure: '어드벤처',
    'open world': '오픈 월드',
    'open-world': '오픈 월드',
    'co-op': '협동',
    coop: '협동',
    multiplayer: '멀티플레이',
    roguelike: '로그라이크',
    'souls-like': '소울라이크',
    'soulslike': '소울라이크',
    'story rich': '스토리 중심',
  };

  if (!tags) return [];
  const myTags = new Set();
  tags.forEach((t) => {
    const lower = t.toLowerCase();
    for (const key in TAG_MAP) {
      if (lower.includes(key)) myTags.add(TAG_MAP[key]);
    }
  });
  return Array.from(myTags);
}

/** ─────────────────────────────
 *  4. Twitch / Chzzk 트렌드
 * ───────────────────────────── */
let twitchToken = null;

async function getTwitchToken() {
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) return;
  try {
    const res = await axios.post(
      'https://id.twitch.tv/oauth2/token',
      null,
      {
        params: {
          client_id: TWITCH_CLIENT_ID,
          client_secret: TWITCH_CLIENT_SECRET,
          grant_type: 'client_credentials',
        },
      }
    );
    twitchToken = res.data.access_token;
  } catch (e) {
    console.error('Twitch token error:', e.message);
  }
}

async function getTrendStats(steamAppId, categoryData) {
  let twitch = { value: 0, status: 'fail' };
  let chzzk = { value: 0, status: 'fail' };

  // Twitch
  if (categoryData?.twitch?.id && TWITCH_CLIENT_ID && TWITCH_CLIENT_SECRET) {
    if (!twitchToken) await getTwitchToken();
    if (twitchToken) {
      try {
        const res = await axios.get('https://api.twitch.tv/helix/streams', {
          headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            Authorization: `Bearer ${twitchToken}`,
          },
          params: { game_id: categoryData.twitch.id, first: 100 },
        });
        const viewers = res.data.data.reduce(
          (acc, s) => acc + (s.viewer_count || 0),
          0
        );
        twitch = { value: viewers, status: 'ok' };
      } catch (e) {
        // ignore
      }
    }
  }

  // Chzzk (치지직)
  if (categoryData?.chzzk?.categoryValue) {
    try {
      const keyword = encodeURIComponent(categoryData.chzzk.categoryValue);
      const res = await axios.get(
        `https://api.chzzk.naver.com/service/v1/search/lives?keyword=${keyword}&offset=0&size=50&sortType=POPULAR`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0',
            ...(CHZZK_CLIENT_ID && {
              'Client-Id': CHZZK_CLIENT_ID,
              'Client-Secret': CHZZK_CLIENT_SECRET,
            }),
          },
        }
      );
      const lives = res.data?.content?.data || [];
      const target = categoryData.chzzk.categoryValue.replace(/\s/g, '');
      let viewers = 0;
      lives.forEach((item) => {
        const live = item.live;
        if (!live) return;
        const cat = (live.liveCategoryValue || '').replace(/\s/g, '');
        if (cat.includes(target) || target.includes(cat)) {
          viewers += live.concurrentUserCount || 0;
        }
      });
      chzzk = { value: viewers, status: 'ok' };
    } catch (e) {
      // ignore
    }
  }

  return { twitch, chzzk };
}

function calculateTrendScore(trends) {
  const { twitch, chzzk } = trends;
  let score = 0;
  if (twitch.status === 'ok') score += twitch.value;
  if (chzzk.status === 'ok') score += chzzk.value * 2; // 한국 비중 ↑
  return score;
}

/** ─────────────────────────────
 *  5. 가격 로직 (ITAD → Steam → 패키지)
 * ───────────────────────────── */
async function getSteamPackagePrice(packageId) {
  try {
    const res = await axios.get(
      'https://store.steampowered.com/api/packagedetails',
      {
        params: { packageids: packageId, l: 'korean', cc: 'kr' },
      }
    );
    const data = res.data?.[packageId]?.data;
    if (data?.price) {
      return {
        regular_price: data.price.initial / 100,
        current_price: data.price.final / 100,
        discount_percent: data.price.discount_percent,
        store_name: 'Steam',
        store_url: `https://store.steampowered.com/sub/${packageId}`,
      };
    }
  } catch (e) {
    // ignore
  }
  return null;
}

async function fetchPriceInfo(originalAppId, initialSteamData, metadata) {
  // metadata.steam.isFree 가 true면 우선시
  const forcedFree = metadata?.steam?.isFree === true;
  let isFree = forcedFree || initialSteamData.is_free === true;

  // 1️⃣ ITAD 가격 (있으면 최우선)
  try {
    if (metadata?.itad?.uuid) {
      const pricesRes = await axios.post(
        `https://api.isthereanydeal.com/games/prices/v3?key=${ITAD_API_KEY}&country=KR`,
        [metadata.itad.uuid],
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 6000,
        }
      );
      const itadGame = pricesRes.data?.[0];
      if (itadGame && itadGame.deals && itadGame.deals.length > 0) {
        const bestDeal = itadGame.deals.sort(
          (a, b) => a.price.amount - b.price.amount
        )[0];

        return {
          regular_price: bestDeal.regular.amount,
          current_price: isFree ? 0 : bestDeal.price.amount,
          discount_percent: bestDeal.cut,
          historical_low: itadGame.historyLow?.price?.amount || 0,
          deals: itadGame.deals.map((d) => ({
            shopName: d.shop?.name,
            price: d.price?.amount,
            regularPrice: d.regular?.amount,
            discount: d.cut,
            url: d.url,
          })),
          store_name: bestDeal.shop?.name,
          store_url: bestDeal.url,
          isFree,
        };
      }
    }
  } catch (e) {
    // ITAD 실패 시 아래로 fallback
  }

  // 2️⃣ Steam 단품 가격
  if (initialSteamData.price_overview && !forcedFree) {
    return {
      regular_price: initialSteamData.price_overview.initial / 100,
      current_price: initialSteamData.price_overview.final / 100,
      discount_percent: initialSteamData.price_overview.discount_percent,
      historical_low: 0,
      deals: [],
      store_name: 'Steam',
      store_url: `https://store.steampowered.com/app/${originalAppId}`,
      isFree: false,
    };
  }

  // 3️⃣ Steam 패키지 가격 (Metadata.steam.usePackageId 우선)
  const packages = initialSteamData.packages || [];
  const preferredPkg = metadata?.steam?.usePackageId;
  if (preferredPkg) {
    const pkgPrice = await getSteamPackagePrice(preferredPkg);
    if (pkgPrice) {
      return {
        ...pkgPrice,
        historical_low: 0,
        deals: [],
        isFree: false,
      };
    }
  }
  for (const pkgId of packages) {
    const pkgPrice = await getSteamPackagePrice(pkgId);
    if (pkgPrice) {
      return {
        ...pkgPrice,
        historical_low: 0,
        deals: [],
        isFree: false,
      };
    }
  }

  // 4️⃣ 정말 가격 정보가 없으면 0 처리
  return {
    regular_price: 0,
    current_price: 0,
    discount_percent: 0,
    historical_low: 0,
    deals: [],
    store_name: 'Steam',
    store_url: `https://store.steampowered.com/app/${originalAppId}`,
    isFree,
  };
}

/** ─────────────────────────────
 *  6. 메인 수집 루프
 * ───────────────────────────── */
async function collectGamesData() {
  await mongoose.connect(MONGODB_URI);
  console.log('✅ DB Connected. 수집 시작...');

  const metadatas = await GameMetadata.find({});
  if (!metadatas || metadatas.length === 0) {
    console.log('⚠️ GameMetadata 비어 있음. metadata_seeder 먼저 실행 필요.');
    process.exit(0);
  }

  const chromePath = findChromePath();
  if (!chromePath) {
    console.error('❌ 크롬 경로를 찾지 못했습니다. Chrome / Chromium 설치 확인 필요');
    process.exit(1);
  }

  const BATCH_SIZE = 5;
  const batches = chunkArray(metadatas, BATCH_SIZE);

  console.log(
    `🎯 총 ${metadatas.length}개 게임을 ${batches.length}개 배치로 나누어 수집합니다.`
  );

  let totalCount = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`\n🔄 Batch ${i + 1}/${batches.length} 시작...`);

    const browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: 'new',
      protocolTimeout: 180000,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setUserAgent(STEAM_HEADERS['User-Agent']);

      // HLTB 메인 접속 (쿠키/Cloudflare 통과 목적)
      try {
        await page.goto('https://howlongtobeat.com', {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        });
      } catch (e) {
        console.warn('⚠️ HLTB 초기 접속 실패 (무시 후 개별 게임에서 재시도)');
      }

      for (const metadata of batch) {
        try {
          await sleep(500);

          // 1️⃣ Steam 메타데이터
          const steamRes = await axios.get(
            'https://store.steampowered.com/api/appdetails',
            {
              params: {
                appids: metadata.steamAppId,
                l: 'korean',
                cc: 'kr',
              },
              headers: STEAM_HEADERS,
            }
          );
          const data = steamRes.data?.[metadata.steamAppId]?.data;
          if (!data) {
            console.log(
              `⚠️ Steam appdetails 데이터 없음: ${metadata.steamAppId} (${metadata.title})`
            );
            continue;
          }

          // DLC / Legacy / 번들 / 사운드트랙 등은 여기서 한 번 더 방어적으로 필터
          const lowerName = (data.name || '').toLowerCase();
          if (
            lowerName.includes('soundtrack') ||
            lowerName.includes('ost') ||
            lowerName.includes('dlc') ||
            lowerName.includes('bundle') ||
            lowerName.includes('pack') ||
            lowerName.includes('demo') ||
            lowerName.includes('test')
          ) {
            console.log(
              `⛔ Skip 비정상 게임 타입 추정: ${data.name} (${metadata.steamAppId})`
            );
            continue;
          }

          // 2️⃣ 트렌드 (Twitch / Chzzk)
          const categoryData = await GameCategory.findOne({
            steamAppId: metadata.steamAppId,
          }).lean();
          const trends = await getTrendStats(metadata.steamAppId, categoryData);
          const trendScore = calculateTrendScore(trends);

          // 3️⃣ 가격 정보
          const priceInfo = await fetchPriceInfo(
            metadata.steamAppId,
            data,
            metadata
          );

          // 4️⃣ HLTB 플레이타임
          let playTime = '정보 없음';
          try {
            const searchName = cleanGameTitle(
              metadata.title || data.name || ''
            );
            if (searchName) {
              await page.goto(
                `https://howlongtobeat.com/?q=${encodeURIComponent(
                  searchName
                )}`,
                { waitUntil: 'domcontentloaded', timeout: 30000 }
              );

              // HLTB 페이지 로딩 대기 — 텍스트 기반
              try {
                await page.waitForFunction(
                  () =>
                    document.body.innerText.includes('Main Story') ||
                    document.body.innerText.includes('All Styles') ||
                    document.body.innerText.includes('Co-Op') ||
                    document.body.innerText.includes('No results') ||
                    document.body.innerText.includes('Main + Extra'),
                  { timeout: 8000 }
                );
              } catch (e) {
                // 타임아웃 무시
              }

              const hltbText = await page.evaluate(() => {
                const items = Array.from(document.querySelectorAll('li'));
                let best = null;

                function pickScore(priorityLabel) {
                  for (const li of items) {
                    const text = li.innerText || '';
                    if (
                      text.includes(priorityLabel) &&
                      (text.includes('Hours') ||
                        text.includes('Hour') ||
                        text.includes('Mins'))
                    ) {
                      const m = text.match(
                        /([0-9½\.]+)\s*(Hours|Hour|Mins|h)/i
                      );
                      if (m) return `${m[1]} ${m[2]}`;
                    }
                  }
                  return null;
                }

                // 우선순위: Main Story → Main + Extra → All Styles → Co-Op
                return (
                  pickScore('Main Story') ||
                  pickScore('Main + Extra') ||
                  pickScore('All Styles') ||
                  pickScore('Co-Op')
                );
              });

              if (hltbText) playTime = hltbText;
            }
          } catch (e) {
            // HLTB 실패시 그냥 "정보 없음"
          }

          // 5️⃣ 제목 결정 (Steam 이름 기준 + Legacy/에디션 정리)
          let finalTitle = data.name || metadata.title;
          const cleanedMetaTitle = cleanGameTitle(metadata.title || data.name);

          // Steam 이름에 Legacy/언더바 등 이상한 패턴 있으면 정제된 제목 사용
          if (
            /legacy/i.test(finalTitle) ||
            /bundle/i.test(finalTitle) ||
            /soundtrack/i.test(finalTitle) ||
            /ost/i.test(finalTitle) ||
            finalTitle.includes('_')
          ) {
            finalTitle = cleanedMetaTitle || finalTitle;
          }

          // 6️⃣ Game 컬렉션 upsert
          await Game.findOneAndUpdate(
            { steam_appid: metadata.steamAppId },
            {
              slug: `steam-${metadata.steamAppId}`,
              steam_appid: metadata.steamAppId,

              title: finalTitle,
              title_ko: (
                categoryData?.chzzk?.categoryValue || data.name || finalTitle
              ).replace(/_/g, ' '),

              main_image: data.header_image,
              description: data.short_description,

              smart_tags: translateTags(
                (data.genres || []).map((g) => g.description)
              ),

              trend_score: trendScore,
              twitch_viewers: trends.twitch.value || 0,
              chzzk_viewers: trends.chzzk.value || 0,

              price_info: priceInfo,

              play_time: playTime,

              releaseDate: data.release_date?.date
                ? new Date(
                    // "2024년 10월 11일" 같은 한글 포맷 대충 변환
                    data.release_date.date
                      .replace(/년|월/g, '-')
                      .replace(/일/g, '')
                  )
                : undefined,

              metacritic_score: data.metacritic?.score || 0,
            },
            { upsert: true }
          );

          totalCount++;
          console.log(
            `✅ [${totalCount}] ${finalTitle} | ₩${
              priceInfo.current_price
            } | Trend=${trendScore} | HLTB=${playTime}`
          );
        } catch (e) {
          console.error(
            `❌ 개별 게임 수집 실패: ${metadata.steamAppId} (${metadata.title})`,
            e.message
          );
          continue;
        }
      }
    } catch (e) {
      console.error('❌ Batch 에러:', e.message);
    } finally {
      await browser.close();
    }
  }

  console.log('\n🎉 모든 수집 완료');
  process.exit(0);
}

collectGamesData();
