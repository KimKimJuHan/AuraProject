// backend/scripts/collector.js
// 기능: 브라우저 주기적 재시작 + 분할 수집(배치) + 트렌드/가격 업데이트

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
  'Cookie': 'birthtime=0; lastagecheckage=1-0-1900; wants_mature_content=1; timezoneOffset=32400,0; Steam_Language=english;'
};

// 안전한 날짜 파싱
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
    const { data: html } = await axios.get(`https://store.steampowered.com/app/${appId}/?l=english`, { headers: STEAM_HEADERS, timeout: 8000 });
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

// ----------------------------------------------------------------------------
// 메인 수집 로직
// ----------------------------------------------------------------------------
async function collectGamesData() {
  await mongoose.connect(MONGODB_URI);
  console.log('✅ DB Connected. 수집기 시작...');

  const existingGames = await Game.find({}).select('steam_appid play_time price_info').lean();
  const existingGameMap = new Map();
  existingGames.forEach(g => existingGameMap.set(g.steam_appid, g));

  // ★ [핵심 수정 1] 전체 2600개를 다 돌리지 않고, 업데이트가 가장 오래된 100개만 가져옴 (GitHub Actions 메모리 보호)
  // 처음에는 lastUpdated가 없는(undefined) 애들부터 가져오고, 그 다음엔 날짜가 오래된 순
  const metadatas = await GameMetadata.find({})
    .sort({ lastUpdated: 1 }) // 오름차순 (null or 과거 -> 최신)
    .limit(100);              // ★ 100개만 처리하고 종료

  console.log(`🚀 이번 실행 처리 대상: ${metadatas.length}개 (안정성을 위한 분할 처리)`);

  const chromePath = findChromePath();
  if (!chromePath) { console.error('❌ Chrome 경로 없음'); process.exit(1); }

  const BATCH_SIZE = 5; 
  const batches = chunkArray(metadatas, BATCH_SIZE);
  let processedCount = 0;

  let browser = null;
  let page = null;

  const launchBrowser = async () => {
      if (browser) await browser.close().catch(() => {});
      browser = await puppeteer.launch({
          executablePath: chromePath,
          headless: 'new',
          // ★ [핵심 수정 2] --single-process 제거 (불안정), 메모리 관련 옵션 강화
          args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage', 
            '--disable-gpu', 
            '--no-first-run',
            '--disable-extensions', // 확장 프로그램 비활성화로 메모리 절약
            '--mute-audio'          // 오디오 리소스 사용 방지
          ]
      });
      page = await browser.newPage();
      await page.setUserAgent(STEAM_HEADERS['User-Agent']);
      try {
          await page.goto('https://howlongtobeat.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch(e) {}
  };

  await launchBrowser();

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`\n🔄 Batch ${i + 1}/${batches.length} 진행 중...`);

    if (i > 0 && i % 20 === 0) {
        console.log("♻️ 메모리 정리를 위해 브라우저 재시작...");
        await launchBrowser();
    }

    for (const metadata of batch) {
        try {
          const steamId = metadata.steamAppId;
          const existingData = existingGameMap.get(steamId);
          const isNewGame = !existingData;
          const isMissingPlaytime = existingData && (existingData.play_time === '정보 없음' || !existingData.play_time);
          
          await sleep(isNewGame ? 1500 : 500);
          
          const steamRes = await axios.get(`https://store.steampowered.com/api/appdetails`, { params: { appids: steamId, l: 'korean', cc: 'kr' }, headers: STEAM_HEADERS, timeout: 10000 });
          const data = steamRes.data?.[steamId]?.data;
          
          // 데이터가 없어도 메타데이터 업데이트(시간)는 해줘야 다음에 또 시도 안함
          if (!data && !existingData) {
             await GameMetadata.updateOne({ _id: metadata._id }, { lastUpdated: new Date() });
             continue; 
          }
          
          let scrapedTags = [];
          if (isNewGame && data && page) {
              try {
                  const lowerName = (data.name || '').toLowerCase();
                  if (!lowerName.includes('soundtrack') && !lowerName.includes('dlc')) {
                      await page.goto(`https://store.steampowered.com/app/${steamId}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
                      const ageGate = await page.$('#ageYear');
                      if (ageGate) { await page.select('#ageYear', '2000'); await page.click('.btnv6_blue_hoverfade_btn').catch(()=>{}); await page.waitForNavigation({timeout:5000}).catch(()=>{}); }
                      scrapedTags = await page.evaluate(() => Array.from(document.querySelectorAll('.app_tag')).map(el => el.innerText.trim()));
                  }
              } catch (e) { } 
          }

          const categoryData = await GameCategory.findOne({ steamAppId: steamId }).lean();
          const trends = await getTrendStats(steamId, categoryData);
          const steamCCU = await getSteamCCU(steamId);
          const trendScore = calculateTrendScore(trends, steamCCU);
          const priceInfo = data ? await fetchPriceInfo(steamId, data, metadata) : (existingData?.price_info || {});
          const steamReviews = await getSteamReviews(steamId);

          let playTime = existingData?.play_time || '정보 없음';
          
          if (page && (isNewGame || isMissingPlaytime)) {
              try {
                const targetName = data?.name || metadata.title;
                const cleanName = cleanGameTitle(targetName);
                let steamYear = data?.release_date?.date ? parseInt(data.release_date.date.match(/(\d{4})/) || [0,0][1]) : null;

                const queries = [cleanName, targetName].filter(q => q && q.length > 1);
                for (const query of [...new Set(queries)]) {
                    try {
                        await page.goto(`https://howlongtobeat.com/?q=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
                        await page.waitForSelector('ul.search_list, .search_list_details', { timeout: 5000 }).catch(()=>{});
                        
                        const result = await page.evaluate((targetYear) => {
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
                            const raw = card.innerText.replace(/\n/g, ' ');
                            const extract = (label) => {
                                const m = raw.match(new RegExp(`${label}.*?([0-9½\.]+)\\s*(Hours|Hour|Mins|h)`, 'i'));
                                if (m) return `${m[1].replace('½', '.5')} ${m[2]}`.replace(/Hours|Hour|h/i, '시간').replace('Mins', '분');
                                return null;
                            };
                            return extract('Main Story') || extract('Main + Extra') || extract('Co-Op') || extract('All Styles');
                        }, steamYear);

                        if (result) { playTime = result; break; }
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

          await Game.findOneAndUpdate({ steam_appid: steamId }, updateData, { upsert: true });
          await new TrendHistory({ steam_appid: steamId, trend_score: trendScore, twitch_viewers: trends.twitch.value, chzzk_viewers: trends.chzzk.value, steam_ccu: steamCCU, recordedAt: new Date() }).save();
          
          // ★ [핵심] 메타데이터의 lastUpdated도 갱신하여, 다음번 실행 때 이 게임은 뒤로 밀리게 함
          await GameMetadata.updateOne({ _id: metadata._id }, { lastUpdated: new Date() });

          processedCount++;
          const status = isNewGame ? "✨ 신규" : (isMissingPlaytime ? "🔧 보강" : "🔄 갱신");
          console.log(`✅ [${status}] ${metadata.title} | Time=${playTime} | Trend=${trendScore}`);
          
        } catch (e) { 
            console.error(`❌ 처리 실패: ${metadata.steamAppId}`, e.message); 
            // 실패해도 업데이트 시간을 갱신해서 무한 반복 방지 (선택 사항)
            // await GameMetadata.updateOne({ _id: metadata._id }, { lastUpdated: new Date() });
        }
      }
  }

  if (browser) await browser.close();
  console.log(`\n🎉 부분 수집 완료 (총 처리: ${processedCount}개) - GitHub Actions 메모리 보호됨`);
  process.exit(0);
}

collectGamesData();