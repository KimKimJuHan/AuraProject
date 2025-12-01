// backend/scripts/collector.js (Windows EBUSY 에러 방지 및 안정화 버전)

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
  MONGODB_URI,
  ITAD_API_KEY,
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
  CHZZK_CLIENT_ID,
  CHZZK_CLIENT_SECRET,
} = process.env;

if (!MONGODB_URI) { console.error('❌ MONGODB_URI 누락'); process.exit(1); }
if (!ITAD_API_KEY) { console.error('❌ ITAD_API_KEY 누락'); process.exit(1); }

const STEAM_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Cookie': 'birthtime=0; lastagecheckage=1-0-1900; wants_mature_content=1; timezoneOffset=32400,0;'
};

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
    const res = await axios.get(
      `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appId}`,
      { timeout: 5000 }
    );
    if (res.data?.response?.result === 1) {
      return res.data.response.player_count || 0;
    }
  } catch (e) {}
  return 0;
}

async function getSteamReviews(appId) {
  const result = {
    overall: { summary: "정보 없음", positive: 0, total: 0, percent: 0 },
    recent: { summary: "정보 없음", positive: 0, total: 0, percent: 0 }
  };

  try {
    const { data: html } = await axios.get(`https://store.steampowered.com/app/${appId}/?l=english`, {
      headers: STEAM_HEADERS,
      timeout: 8000
    });

    const recentMatch = html.match(/Recent Reviews:[\s\S]*?game_review_summary[^>]*?>([\s\S]*?)<[\s\S]*?responsive_hidden[^>]*?>\s*\(([\d,]+)\)/);
    if (recentMatch) {
      const summaryText = recentMatch[1].trim();
      const countText = recentMatch[2].replace(/,/g, '').trim();
      const total = parseInt(countText) || 0;
      result.recent = { summary: summaryText, positive: 0, total: total, percent: 0 };
    }

    const overallMatch = html.match(/All Reviews:[\s\S]*?game_review_summary[^>]*?>([\s\S]*?)<[\s\S]*?responsive_hidden[^>]*?>\s*\(([\d,]+)\)/);
    if (overallMatch) {
      const summaryText = overallMatch[1].trim();
      const countText = overallMatch[2].replace(/,/g, '').trim();
      const total = parseInt(countText) || 0;
      result.overall = { summary: summaryText, positive: 0, total: total, percent: 0 };
    }

    if (result.overall.total === 0) {
        const res = await axios.get(`https://store.steampowered.com/appreviews/${appId}?json=1&language=all`, { timeout: 5000 });
        const s = res.data?.query_summary;
        if (s) {
            result.overall = {
                summary: s.review_score_desc,
                total: s.total_reviews,
                positive: s.total_positive,
                percent: 0
            };
        }
    }
  } catch (e) {}
  return result;
}

async function getTrendStats(steamAppId, categoryData) {
  let twitch = { value: 0, status: 'fail' };
  let chzzk = { value: 0, status: 'fail' };
  
  if (categoryData?.twitch?.id && TWITCH_CLIENT_ID && TWITCH_CLIENT_SECRET) {
    if (!twitchToken) await getTwitchToken();
    if (twitchToken) {
      try {
        const res = await axios.get('https://api.twitch.tv/helix/streams', {
          headers: { 'Client-ID': TWITCH_CLIENT_ID, Authorization: `Bearer ${twitchToken}` },
          params: { game_id: categoryData.twitch.id, first: 100 },
        });
        twitch = { value: res.data.data.reduce((acc, s) => acc + (s.viewer_count || 0), 0), status: 'ok' };
      } catch {}
    }
  }
  
  if (categoryData?.chzzk?.categoryValue) {
    try {
      const keyword = encodeURIComponent(categoryData.chzzk.categoryValue);
      const res = await axios.get(
        `https://api.chzzk.naver.com/service/v1/search/lives?keyword=${keyword}&offset=0&size=50&sortType=POPULAR`,
        { headers: { 'User-Agent': 'Mozilla/5.0', ...(CHZZK_CLIENT_ID && { 'Client-Id': CHZZK_CLIENT_ID, 'Client-Secret': CHZZK_CLIENT_SECRET }) } }
      );
      const lives = res.data?.content?.data || [];
      const target = categoryData.chzzk.categoryValue.replace(/\s/g, '');
      let viewers = 0;
      lives.forEach((item) => {
        const live = item.live;
        if (!live) return;
        const cat = (live.liveCategoryValue || '').replace(/\s/g, '');
        if (cat.includes(target) || target.includes(cat)) { viewers += live.concurrentUserCount || 0; }
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

async function getSteamPackagePrice(packageId) {
  try {
    const res = await axios.get(
      'https://store.steampowered.com/api/packagedetails', { params: { packageids: packageId, l: 'korean', cc: 'kr' } }
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
  } catch {}
  return null;
}

async function fetchPriceInfo(originalAppId, initialSteamData, metadata) {
  const forcedFree = metadata?.steam?.isFree === true;
  let isFree = forcedFree || initialSteamData.is_free === true;

  if (isFree) {
    return {
        regular_price: 0, current_price: 0, discount_percent: 0, historical_low: 0, deals: [],
        store_name: 'Steam', store_url: `https://store.steampowered.com/app/${originalAppId}`, isFree: true,
    };
  }

  try {
    if (metadata?.itad?.uuid) {
      const pricesRes = await axios.post(
        `https://api.isthereanydeal.com/games/prices/v3?key=${ITAD_API_KEY}&country=KR`,
        [metadata.itad.uuid],
        { headers: { 'Content-Type': 'application/json' }, timeout: 6000 }
      );
      const itadGame = pricesRes.data?.[0];
      if (itadGame?.deals?.length > 0) {
        const bestDeal = itadGame.deals.sort((a, b) => a.price.amount - b.price.amount)[0];
        return {
          regular_price: bestDeal.regular.amount,
          current_price: isFree ? 0 : bestDeal.price.amount,
          discount_percent: bestDeal.cut,
          historical_low: itadGame.historyLow?.price?.amount || 0,
          deals: itadGame.deals.map((d) => ({
            shopName: d.shop?.name, price: d.price?.amount, regularPrice: d.regular?.amount, discount: d.cut, url: d.url,
          })),
          store_name: bestDeal.shop?.name,
          store_url: bestDeal.url,
          isFree,
        };
      }
    }
  } catch {}

  if (initialSteamData.price_overview && !forcedFree) {
    return {
      regular_price: initialSteamData.price_overview.initial / 100,
      current_price: initialSteamData.price_overview.final / 100,
      discount_percent: initialSteamData.price_overview.discount_percent,
      historical_low: 0, deals: [], store_name: 'Steam',
      store_url: `https://store.steampowered.com/app/${originalAppId}`,
      isFree: false,
    };
  }
  
  return {
    regular_price: 0, current_price: 0, discount_percent: 0, historical_low: 0, deals: [],
    store_name: 'Steam', store_url: `https://store.steampowered.com/app/${originalAppId}`, isFree,
  };
}

async function collectGamesData() {
  await mongoose.connect(MONGODB_URI);
  console.log('✅ DB Connected. 수집 시작...');

  const metadatas = await GameMetadata.find({});
  if (!metadatas.length) { console.log('⚠️ GameMetadata 비어 있음.'); process.exit(0); }

  const chromePath = findChromePath();
  if (!chromePath) { console.error('❌ Chrome 경로 없음'); process.exit(1); }

  const BATCH_SIZE = 3; 
  const batches = chunkArray(metadatas, BATCH_SIZE);
  let totalCount = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`\n🔄 Batch ${i + 1}/${batches.length} 시작...`);

    const browser = await puppeteer.launch({
      executablePath: chromePath, headless: 'new', protocolTimeout: 240000,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setUserAgent(STEAM_HEADERS['User-Agent']);
      
      let hltbLoaded = false;
      for(let k=0; k<3; k++) {
          try {
              await page.goto('https://howlongtobeat.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
              hltbLoaded = true;
              break;
          } catch(e) { console.log(`⚠️ HLTB 접속 재시도 ${k+1}...`); await sleep(3000); }
      }

      for (const metadata of batch) {
        try {
          await sleep(2000); 
          const steamRes = await axios.get(
            'https://store.steampowered.com/api/appdetails',
            { params: { appids: metadata.steamAppId, l: 'korean', cc: 'kr' }, headers: STEAM_HEADERS, timeout: 10000 }
          );
          const data = steamRes.data?.[metadata.steamAppId]?.data;
          if (!data) continue;

          const lowerName = (data.name || '').toLowerCase();
          if (lowerName.includes('soundtrack') || lowerName.includes('ost') || lowerName.includes('dlc') || lowerName.includes('bundle')) continue;

          const categoryData = await GameCategory.findOne({ steamAppId: metadata.steamAppId }).lean();
          const trends = await getTrendStats(metadata.steamAppId, categoryData);
          const steamCCU = await getSteamCCU(metadata.steamAppId);
          const trendScore = calculateTrendScore(trends, steamCCU);
          const priceInfo = await fetchPriceInfo(metadata.steamAppId, data, metadata);
          const steamReviews = await getSteamReviews(metadata.steamAppId);

          let playTime = '정보 없음';
          if (hltbLoaded) {
              try {
                const searchName = cleanGameTitle(metadata.title || data.name || '');
                if (searchName) {
                  await page.goto(`https://howlongtobeat.com/?q=${encodeURIComponent(searchName)}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
                  try {
                    await page.waitForFunction(() => document.body.innerText.includes('Main Story') || document.body.innerText.includes('No results'), { timeout: 15000 });
                  } catch {}
                  
                  const hltbText = await page.evaluate(() => {
                    const items = Array.from(document.querySelectorAll('li'));
                    function pickScore(label) {
                      for (const li of items) {
                        const text = li.innerText || '';
                        if (text.includes(label) && (text.includes('Hours') || text.includes('Mins'))) {
                          const m = text.match(/([0-9½\.]+)\s*(Hours|Hour|Mins|h)/i);
                          if (m) return `${m[1]} ${m[2]}`.replace('Hours', '시간').replace('Hour', '시간');
                        }
                      } return null;
                    }
                    return (pickScore('Main Story') || pickScore('Main + Extra') || pickScore('All Styles'));
                  });
                  if (hltbText) playTime = hltbText;
                }
              } catch (e) { 
                  // HLTB 에러는 전체 프로세스를 멈추지 않도록 로그만 찍고 넘어감
                  // console.log(`⚠️ HLTB 검색 실패 (${metadata.title})`); 
              }
          }

          let finalTitle = data.name || metadata.title;
          const cleanedMetaTitle = cleanGameTitle(metadata.title || data.name);
          if (/legacy/i.test(finalTitle) || /bundle/i.test(finalTitle) || finalTitle.includes('_')) {
            finalTitle = cleanedMetaTitle || finalTitle;
          }

          const screenshots = (data.screenshots || []).map(s => s.path_full);
          const trailers = [];
          if (data.movies && Array.isArray(data.movies)) {
              data.movies.forEach(m => {
                  if (m.mp4) {
                      const bestMp4 = m.mp4['max'] || m.mp4['480'] || Object.values(m.mp4).find(val => typeof val === 'string' && val.startsWith('http'));
                      if (bestMp4) trailers.push(bestMp4);
                  } 
                  else if (m.webm) {
                      const bestWebm = m.webm['max'] || m.webm['480'] || Object.values(m.webm).find(val => typeof val === 'string' && val.startsWith('http'));
                      if (bestWebm) trailers.push(bestWebm);
                  }
                  else if (m.hls_h264) {
                      const fallbackMp4 = m.hls_h264.replace(/hls_264_master\.m3u8.*$/, 'movie480.mp4');
                      trailers.push(fallbackMp4);
                  }
              });
          }
          
          let pcRequirements = { minimum: "정보 없음", recommended: "정보 없음" };
          if (data.pc_requirements && typeof data.pc_requirements === 'object' && !Array.isArray(data.pc_requirements)) {
              pcRequirements.minimum = data.pc_requirements.minimum || "정보 없음";
              pcRequirements.recommended = data.pc_requirements.recommended || "정보 없음";
          }

          await Game.findOneAndUpdate(
            { steam_appid: metadata.steamAppId },
            {
              slug: `steam-${metadata.steamAppId}`, steam_appid: metadata.steamAppId,
              title: finalTitle,
              title_ko: (categoryData?.chzzk?.categoryValue || data.name || finalTitle).replace(/_/g, ' '),
              main_image: data.header_image, description: data.short_description,
              smart_tags: mapSteamTags([...(data.genres || []).map((g) => g.description), ...(data.categories || []).map((c) => c.description)]),
              trend_score: trendScore, twitch_viewers: trends.twitch.value || 0, chzzk_viewers: trends.chzzk.value || 0, steam_ccu: steamCCU,
              steam_reviews: steamReviews, price_info: priceInfo, play_time: playTime,
              releaseDate: data.release_date?.date ? new Date(data.release_date.date.replace(/년|월/g, '-').replace(/일/g, '')) : undefined,
              metacritic_score: data.metacritic?.score || 0,
              screenshots: screenshots,
              trailers: trailers,
              pc_requirements: pcRequirements
            }, { upsert: true }
          );

          await new TrendHistory({
            steam_appid: metadata.steamAppId, trend_score: trendScore,
            twitch_viewers: trends.twitch.value || 0, chzzk_viewers: trends.chzzk.value || 0, steam_ccu: steamCCU,
            recordedAt: new Date()
          }).save();

          totalCount++;
          const hasMovies = data.movies && data.movies.length > 0 ? "O" : "X";
          console.log(`✅ [${totalCount}] ${finalTitle} | All=${steamReviews.overall.summary} | Recent=${steamReviews.recent.summary} | Trailer=${trailers.length}개`);
        } catch (e) { console.error(`❌ 개별 게임 수집 실패: ${metadata.steamAppId}`, e.message); }
      }
    } catch (e) { 
        console.error('❌ Batch 에러:', e.message); 
    } finally { 
        // ★ [핵심] 브라우저 종료 시 에러 무시 및 대기 (Windows EBUSY 해결)
        try {
            await sleep(2000); // 파일 잠금 해제 대기
            if (browser) await browser.close();
        } catch (e) {
            // 종료 중 에러는 무시 (이미 닫혔거나 파일 잠금 등)
        }
    }
  }
  console.log('\n🎉 모든 수집 완료'); process.exit(0);
}

collectGamesData();