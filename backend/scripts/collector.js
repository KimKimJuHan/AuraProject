// backend/scripts/collector.js
// 기능: 실무형 타겟팅 수집기 (인기 신작 탐지, 누락 데이터 보강, 전수 순환 갱신)

require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const axios = require('axios');
const puppeteer = require('puppeteer-core');
const os = require('os');
const fs = require('fs');

const Game = require('../models/Game');
const GameCategory = require('../models/GameCategory');
const GameMetadata = require('../models/GameMetadata');
const TrendHistory = require('../models/TrendHistory');
const { mapSteamTags } = require('../utils/tagMapper');

const {
  MONGODB_URI, ITAD_API_KEY, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, CHZZK_CLIENT_ID, CHZZK_CLIENT_SECRET,
} = process.env;

if (!MONGODB_URI) { console.error('❌ MONGODB_URI 누락'); process.exit(1); }
if (!ITAD_API_KEY) { console.error('❌ ITAD_API_KEY 누락'); process.exit(1); }

const STEAM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Cookie': 'birthtime=0; lastagecheckage=1-0-1900; wants_mature_content=1; timezoneOffset=32400,0; Steam_Language=korean;'
};

function parseHLTBTime(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const normalize = raw.replace('½', '.5').replace(/½/g, '.5').replace(/\s+/g, ' ').toLowerCase();
    const extract = (label) => {
        const regex = new RegExp(label + '.*?([0-9]+(\\.[0-9]+)?)');
        const match = normalize.match(regex);
        return match ? parseFloat(match[1]) : null;
    };
    return {
        main: extract('main story'),
        extra: extract('main \\+ extra'),
        completionist: extract('completionist'),
        raw: raw
    };
}

function parseSafeDate(dateStr) {
    if (!dateStr) return undefined;
    const cleanStr = dateStr.replace(/년|월/g, '-').replace(/일/g, '').trim();
    const date = new Date(cleanStr);
    if (isNaN(date.getTime())) return undefined;
    return date;
}

function checkIfAdult(data, tags) {
    if (data.required_age >= 18) return true;
    const adultKeywords = ['Nudity', 'Sexual Content', 'Hentai', 'NSFW', 'Mature', 'Adult', 'Sexual Violence'];
    const hasAdultTag = tags.some(tag => adultKeywords.some(keyword => tag.toLowerCase() === keyword.toLowerCase()));
    if (hasAdultTag) return true;
    const title = (data.name || "").toLowerCase();
    return title.includes("hentai") || title.includes("sex") || title.includes("nude");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

function cleanGameTitle(title) {
  if (!title) return '';
  let clean = title.replace(/[™®©]/g, '');
  const patterns = [
    /Game of the Year Edition/gi, /GOTY Edition/gi, /GOTY/gi,
    /Definitive Edition/gi, /Enhanced Edition/gi, /Director's Cut/gi,
    /The Final Cut/gi, /Complete Edition/gi, /Anniversary Edition/gi,
    /Remastered/gi, /Digital Deluxe/gi, /Standard Edition/gi,
    /Legendary Edition/gi, /Special Edition/gi, /Collector's Edition/gi,
    /Legacy Edition/gi, /Legacy Version/gi, /\(Legacy\)/gi,
  ];
  patterns.forEach((regex) => clean = clean.replace(regex, ''));
  clean = clean.replace(/[\s:-]+$/g, '');
  if (clean.toLowerCase().endsWith(' the')) clean = clean.slice(0, -4);
  return clean.trim();
}

function chunkArray(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) {
    out.push(array.slice(i, i + size));
  }
  return out;
}

let twitchToken = null;
async function getTwitchToken() {
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) return;
  try {
    const res = await axios.post(
      'https://id.twitch.tv/oauth2/token', null,
      { params: { client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' } }
    );
    twitchToken = res.data.access_token;
  } catch {}
}

async function getSteamCCU(appId) {
  try {
    const res = await axios.get(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appId}`, { timeout: 5000 });
    if (res.data?.response?.result === 1) return res.data.response.player_count || 0;
  } catch (e) {}
  return 0;
}

async function getSteamReviews(appId) {
  const result = { overall: { summary: "정보 없음", positive: 0, total: 0, percent: 0 }, recent: { summary: "정보 없음", positive: 0, total: 0, percent: 0 } };
  try {
    const { data: html } = await axios.get(`https://store.steampowered.com/app/${appId}/?l=koreana`, { headers: STEAM_HEADERS, timeout: 8000 });
    const recentMatch = html.match(/Recent Reviews:[\s\S]*?game_review_summary[^>]*?>([\s\S]*?)<[\s\S]*?responsive_hidden[^>]*?>\s*\(([\d,]+)\)/);
    if (recentMatch) result.recent = { summary: recentMatch[1].trim(), positive: 0, total: parseInt(recentMatch[2].replace(/,/g, '')) || 0, percent: 0 };
    const overallMatch = html.match(/All Reviews:[\s\S]*?game_review_summary[^>]*?>([\s\S]*?)<[\s\S]*?responsive_hidden[^>]*?>\s*\(([\d,]+)\)/);
    if (overallMatch) result.overall = { summary: overallMatch[1].trim(), positive: 0, total: parseInt(overallMatch[2].replace(/,/g, '')) || 0, percent: 0 };
    if (result.overall.total === 0) {
        const res = await axios.get(`https://store.steampowered.com/appreviews/${appId}?json=1&language=all`, { timeout: 5000 });
        if (res.data?.query_summary) {
            result.overall = { summary: res.data.query_summary.review_score_desc, total: res.data.query_summary.total_reviews, positive: res.data.query_summary.total_positive, percent: 0 };
        }
    }
  } catch (e) {}
  return result;
}

async function getTrendStats(steamAppId, categoryData) {
  let twitch = { value: 0, status: 'fail' };
  let chzzk = { value: 0, status: 'fail' };
  if (categoryData?.twitch?.id && TWITCH_CLIENT_ID) {
    if (!twitchToken) await getTwitchToken();
    if (twitchToken) {
      try {
        const res = await axios.get('https://api.twitch.tv/helix/streams', { headers: { 'Client-ID': TWITCH_CLIENT_ID, Authorization: `Bearer ${twitchToken}` }, params: { game_id: categoryData.twitch.id, first: 100 } });
        twitch = { value: res.data.data.reduce((acc, s) => acc + (s.viewer_count || 0), 0), status: 'ok' };
      } catch {}
    }
  }
  if (categoryData?.chzzk?.categoryValue) {
    try {
      const keyword = encodeURIComponent(categoryData.chzzk.categoryValue);
      const res = await axios.get(`https://api.chzzk.naver.com/service/v1/search/lives?keyword=${keyword}&offset=0&size=50&sortType=POPULAR`, { headers: { 'User-Agent': 'Mozilla/5.0', ...(CHZZK_CLIENT_ID && { 'Client-Id': CHZZK_CLIENT_ID, 'Client-Secret': CHZZK_CLIENT_SECRET }) } });
      const lives = res.data?.content?.data || [];
      const target = categoryData.chzzk.categoryValue.replace(/\s/g, '');
      let viewers = 0;
      lives.forEach((item) => {
        const live = item.live;
        if (!live) return;
        const cat = (live.liveCategoryValue || '').replace(/\s/g, '');
        if (cat.includes(target) || target.includes(cat)) viewers += live.concurrentUserCount || 0;
      });
      chzzk = { value: viewers, status: 'ok' };
    } catch {}
  }
  return { twitch, chzzk };
}

function calculateTrendScore(trends, steamCCU = 0) {
  const { twitch, chzzk } = trends;
  let score = 0;
  if (twitch.status === 'ok') score += twitch.value;
  if (chzzk.status === 'ok') score += chzzk.value * 2;
  score += Math.round(steamCCU * 0.1); 
  return score;
}

async function fetchPriceInfo(originalAppId, initialSteamData, metadata) {
  const forcedFree = metadata?.steam?.isFree === true;
  let isFree = forcedFree || initialSteamData.is_free === true;
  if (isFree) return { regular_price: 0, current_price: 0, discount_percent: 0, historical_low: 0, deals: [], store_name: 'Steam', store_url: `https://store.steampowered.com/app/${originalAppId}`, isFree: true };
  try {
    if (metadata?.itad?.uuid) {
      const pricesRes = await axios.post(`https://api.isthereanydeal.com/games/prices/v3?key=${ITAD_API_KEY}&country=KR`, [metadata.itad.uuid], { headers: { 'Content-Type': 'application/json' }, timeout: 6000 });
      const itadGame = pricesRes.data?.[0];
      if (itadGame?.deals?.length > 0) {
        const bestDeal = itadGame.deals.sort((a, b) => a.price.amount - b.price.amount)[0];
        return { regular_price: bestDeal.regular.amount, current_price: isFree ? 0 : bestDeal.price.amount, discount_percent: bestDeal.cut, historical_low: itadGame.historyLow?.price?.amount || 0, deals: itadGame.deals.map((d) => ({ shopName: d.shop?.name, price: d.price?.amount, regularPrice: d.regular?.amount, discount: d.cut, url: d.url })), store_name: bestDeal.shop?.name, store_url: bestDeal.url, isFree };
      }
    }
  } catch {}
  if (initialSteamData.price_overview && !forcedFree) return { regular_price: initialSteamData.price_overview.initial / 100, current_price: initialSteamData.price_overview.final / 100, discount_percent: initialSteamData.price_overview.discount_percent, historical_low: 0, deals: [], store_name: 'Steam', store_url: `https://store.steampowered.com/app/${originalAppId}`, isFree: false };
  return { regular_price: 0, current_price: 0, discount_percent: 0, historical_low: 0, deals: [], store_name: 'Steam', store_url: `https://store.steampowered.com/app/${originalAppId}`, isFree };
}

async function getTrendingAppIds() {
    try {
        const res = await axios.get('https://steamspy.com/api.php?request=top100in2weeks', { timeout: 8000 });
        if (res.data) {
            return Object.values(res.data).map(game => ({ steamAppId: game.appid, title: game.name, source: 'Trending' }));
        }
    } catch(e) { console.error("SteamSpy 가져오기 실패"); }
    return [];
}

async function collectGamesData() {
  await mongoose.connect(MONGODB_URI);
  console.log('✅ DB Connected. 스마트 타겟팅 수집기 시작...');

  const existingGames = await Game.find({}).select('steam_appid play_time price_info trend_score updatedAt').lean();
  const existingGameMap = new Map();
  const existingAppIds = new Set();
  
  existingGames.forEach(g => {
      existingGameMap.set(g.steam_appid, g);
      existingAppIds.add(g.steam_appid);
  });

  // 1. 신규 인기 게임 탐지 (최대 10개)
  const trendingGames = await getTrendingAppIds();
  const newHotGames = trendingGames.filter(g => !existingAppIds.has(g.steamAppId)).slice(0, 10);

  // 2. 누락 데이터 보강 (플탐 없는 게임 중 점수 높은 순 15개)
  const missingDataGames = existingGames
    .filter(g => !g.play_time || (typeof g.play_time === 'object' && !g.play_time.main && !g.play_time.raw))
    .sort((a, b) => (b.trend_score || 0) - (a.trend_score || 0))
    .slice(0, 15)
    .map(g => ({ steamAppId: g.steam_appid, title: g.title, source: 'MissingData' }));

  // 3. 트렌드 전수 순환 갱신 (가장 오래전에 업데이트된 게임부터 50개 우선 처리)
  // 이전 로직의 맹점(점수 높은 것만 무한 반복 갱신)을 해결하여 모든 게임의 생방송 기록이 끊기지 않도록 수정
  const outdatedGames = existingGames
    .sort((a, b) => new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0))
    .slice(0, 50)
    .map(g => ({ steamAppId: g.steam_appid, title: g.title, source: 'TrendUpdate' }));

  const combinedQueue = [...newHotGames, ...missingDataGames, ...outdatedGames];
  const uniqueQueueMap = new Map();
  combinedQueue.forEach(item => uniqueQueueMap.set(item.steamAppId, item));
  const targetMetadatas = Array.from(uniqueQueueMap.values());

  console.log(`🚀 타겟팅 완료: 총 ${targetMetadatas.length}개 처리 예정 (신규: ${newHotGames.length}, 보강: ${missingDataGames.length}, 순환갱신: ${outdatedGames.length})`);

  if (targetMetadatas.length === 0) {
      console.log("처리할 항목이 없습니다. 종료합니다.");
      process.exit(0);
  }

  const chromePath = findChromePath();
  if (!chromePath) { console.error('❌ Chrome 경로 없음'); process.exit(1); }

  const BATCH_SIZE = 5; 
  const batches = chunkArray(targetMetadatas, BATCH_SIZE);
  let processedCount = 0;

  // Puppeteer 초기화 (타임아웃 대폭 상향 설정)
  let browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: 'new',
      protocolTimeout: 120000, // 통신 타임아웃 2분으로 확장 (이전 에러 원인 차단)
      args: [
          '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', 
          '--disable-gpu', '--no-first-run', '--disable-extensions', '--mute-audio'
      ]
  });

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`\n🔄 Batch ${i + 1}/${batches.length} 진행 중...`);

    for (const metadata of batch) {
        let page = null; // 메모리 누수 방지를 위한 개별 페이지 인스턴스
        try {
          const steamId = metadata.steamAppId;
          const existingData = existingGameMap.get(steamId);
          const isNewGame = !existingData;
          const isMissingPlaytime = existingData && (!existingData.play_time || (typeof existingData.play_time === 'object' && !existingData.play_time.main && !existingData.play_time.raw));
          
          await sleep(isNewGame ? 1500 : 500);
          
          const steamRes = await axios.get(`https://store.steampowered.com/api/appdetails`, { params: { appids: steamId, l: 'korean', cc: 'kr' }, headers: STEAM_HEADERS, timeout: 10000 }).catch(()=>({data:null}));
          const data = steamRes.data?.[steamId]?.data;
          
          if (!data && !existingData) continue;
          
          let scrapedTags = [];
          const needsPuppeteer = isNewGame || isMissingPlaytime;

          // Puppeteer가 꼭 필요한 경우에만 새 탭 열기 (메모리 최적화)
          if (needsPuppeteer && browser) {
              page = await browser.newPage();
              await page.setUserAgent(STEAM_HEADERS['User-Agent']);
              // 불필요한 리소스 로드 차단 (크래시 주원인 제거)
              await page.setRequestInterception(true);
              page.on('request', (req) => {
                  if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) req.abort();
                  else req.continue();
              });

              if (isNewGame && data) {
                  try {
                      const lowerName = (data.name || '').toLowerCase();
                      if (!lowerName.includes('soundtrack') && !lowerName.includes('dlc')) {
                          await page.goto(`https://store.steampowered.com/app/${steamId}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
                          const ageGate = await page.$('#ageYear');
                          if (ageGate) { await page.select('#ageYear', '2000'); await page.click('.btnv6_blue_hoverfade_btn').catch(()=>{}); await page.waitForNavigation({timeout:5000}).catch(()=>{}); }
                          scrapedTags = await page.evaluate(() => Array.from(document.querySelectorAll('.app_tag')).map(el => el.innerText.trim()));
                      }
                  } catch (e) { } 
              }
          }

          const categoryData = await GameCategory.findOne({ steamAppId: steamId }).lean();
          const trends = await getTrendStats(steamId, categoryData);
          const steamCCU = await getSteamCCU(steamId);
          const trendScore = calculateTrendScore(trends, steamCCU);
          const priceInfo = data ? await fetchPriceInfo(steamId, data, metadata) : (existingData?.price_info || {});
          const steamReviews = await getSteamReviews(steamId);

          let playTime = existingData?.play_time || null;
          
          // 플탐 탐지 로직 (새 탭 활용)
          if (page && needsPuppeteer) {
              try {
                const targetName = data?.name || metadata.title;
                const cleanName = cleanGameTitle(targetName);
                let steamYear = data?.release_date?.date ? parseInt(data.release_date.date.match(/(\d{4})/) || [0,0][1]) : null;

                const queries = [cleanName, targetName].filter(q => q && q.length > 1);
                for (const query of [...new Set(queries)]) {
                    try {
                        await page.goto(`https://howlongtobeat.com/?q=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
                        await page.waitForSelector('ul.search_list, .search_list_details', { timeout: 5000 }).catch(()=>{});
                        
                        const resultText = await page.evaluate((targetYear) => {
                            let cards = Array.from(document.querySelectorAll('li'));
                            if (cards.length < 2) cards = Array.from(document.querySelectorAll('div[class*="GameCard"]'));
                            const validCards = cards.filter(el => {
                                const t = el.innerText;
                                return (t.includes('Hours') || t.includes('Mins')) && !t.includes('We Found');
                            });
                            if (validCards.length === 0) return null;
                            let card = validCards[0];
                            if (targetYear) {
                                const match = validCards.find(c => {
                                    const y = c.innerText.match(/(\d{4})/g);
                                    return y && y.some(val => Math.abs(parseInt(val) - targetYear) <= 1);
                                });
                                if (match) card = match;
                            }
                            return card.innerText.replace(/\n/g, ' ');
                        }, steamYear);

                        if (resultText) {
                            playTime = parseHLTBTime(resultText);
                            break; 
                        }
                    } catch (e) {}
                    await sleep(500);
                }
              } catch (e) {}
          }

          const updateData = {
              trend_score: trendScore,
              twitch_viewers: trends.twitch.value || 0,
              chzzk_viewers: trends.chzzk.value || 0,
              steam_ccu: steamCCU,
              steam_reviews: steamReviews,
              price_info: priceInfo,
              play_time: playTime,
              lastUpdated: new Date()
          };

          if (data) {
              const rawTags = scrapedTags.length > 0 ? scrapedTags : [...(data.genres || []).map(g => g.description), ...(data.categories || []).map(c => c.description)];
              Object.assign(updateData, {
                  slug: `steam-${steamId}`, steam_appid: steamId, title: data.name,
                  title_ko: (categoryData?.chzzk?.categoryValue || data.name).replace(/_/g, ' '),
                  main_image: data.header_image, description: data.short_description,
                  smart_tags: mapSteamTags(rawTags), isAdult: checkIfAdult(data, rawTags),
                  releaseDate: data.release_date?.date ? parseSafeDate(data.release_date.date) : undefined,
                  metacritic_score: data.metacritic?.score || 0,
                  screenshots: (data.screenshots || []).map(s => s.path_full),
                  pc_requirements: { minimum: data.pc_requirements?.minimum || "정보 없음", recommended: data.pc_requirements?.recommended || "정보 없음" }
              });
          }

          // DB 저장 및 갱신 강제 수행
          await Game.findOneAndUpdate({ steam_appid: steamId }, updateData, { upsert: true });
          await new TrendHistory({ steam_appid: steamId, trend_score: trendScore, twitch_viewers: trends.twitch.value, chzzk_viewers: trends.chzzk.value, steam_ccu: steamCCU, recordedAt: new Date() }).save();
          
          processedCount++;
          const status = metadata.source === 'Trending' ? "✨ 핫신작" : (metadata.source === 'MissingData' ? "🔧 보강" : "🔄 순환갱신");
          const timeLog = playTime?.main ? `${playTime.main}H` : 'N/A';
          console.log(`✅ [${status}] ${metadata.title} | Time=${timeLog} | Trend=${trendScore}`);
          
        } catch (e) { 
            console.error(`❌ 처리 실패: ${metadata.steamAppId}`, e.message); 
        } finally {
            // 가장 중요한 메모리 회수 작업: 1개 게임 스크래핑 완료 후 브라우저 탭 강제 종료
            if (page) await page.close().catch(() => {});
        }
    }
  }

  if (browser) await browser.close();
  console.log(`\n🎉 스마트 수집 완료 (총 처리: ${processedCount}개)`);
  process.exit(0);
}

collectGamesData();