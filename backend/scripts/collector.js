// backend/scripts/collector.js
// 기능: 스마트 업데이트 (신규 게임은 풀 수집, 기존 게임은 트렌드/가격/누락정보만 갱신)

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
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Cookie': 'birthtime=0; lastagecheckage=1-0-1900; wants_mature_content=1; timezoneOffset=32400,0; Steam_Language=english;'
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

// ==========================================
// ★ 메인 수집 함수 (스마트 업데이트 버전)
// ==========================================
async function collectGamesData() {
  await mongoose.connect(MONGODB_URI);
  console.log('✅ DB Connected. 스마트 수집/업데이트 시작...');

  // 1. 현재 DB에 존재하는 게임 목록 확인 (빠른 조회용 Map 생성)
  const existingGames = await Game.find({}).select('steam_appid play_time').lean();
  const existingGameMap = new Map();
  existingGames.forEach(g => existingGameMap.set(g.steam_appid, g));
  console.log(`📂 기존 DB 게임 수: ${existingGameMap.size}개`);

  // 2. 전체 메타데이터 가져오기
  const metadatas = await GameMetadata.find({});
  if (!metadatas.length) { console.log('⚠️ GameMetadata 비어 있음.'); process.exit(0); }

  console.log(`🚀 전체 처리 대상: ${metadatas.length}개`);

  const chromePath = findChromePath();
  if (!chromePath) { console.error('❌ Chrome 경로 없음'); process.exit(1); }

  const browser = await puppeteer.launch({
    executablePath: chromePath, headless: 'new', protocolTimeout: 240000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-first-run'],
  });

  const page = await browser.newPage();
  await page.setUserAgent(STEAM_HEADERS['User-Agent']);
  
  let hltbLoaded = false;
  try {
      await page.goto('https://howlongtobeat.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
      hltbLoaded = true;
      console.log("🌍 HLTB 접속 성공");
  } catch(e) { 
      console.error("⚠️ HLTB 초기 접속 실패");
  }

  const BATCH_SIZE = 5; 
  const batches = chunkArray(metadatas, BATCH_SIZE);
  let processedCount = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`\n🔄 Batch ${i + 1}/${batches.length} 진행 중...`);

    for (const metadata of batch) {
        try {
          const steamId = metadata.steamAppId;
          const existingData = existingGameMap.get(steamId);
          
          // ★ 판단 로직: 신규 게임인가? 아니면 플레이타임 누락인가?
          const isNewGame = !existingData;
          const isMissingPlaytime = existingData && (existingData.play_time === '정보 없음' || !existingData.play_time);
          
          // 스팀 API는 가격/기본정보 확인 위해 항상 호출 (단, 기존 게임은 딜레이 줄여도 됨)
          const delay = isNewGame ? (Math.floor(Math.random() * 2000) + 1500) : 1200; // 신규: 1.5~3.5초, 기존: 1.2초 고정
          await sleep(delay);
          
          const steamRes = await axios.get(
            'https://store.steampowered.com/api/appdetails',
            { params: { appids: steamId, l: 'korean', cc: 'kr' }, headers: STEAM_HEADERS, timeout: 10000 }
          );
          const data = steamRes.data?.[steamId]?.data;
          
          // 데이터가 없거나 유효하지 않으면 스킵 (단, 기존 데이터가 있으면 유지해야 하므로 주의)
          if (!data && !existingData) continue; 
          
          // ---------------------------------------------------------
          // 1. 스팀 상점 태그/이미지 크롤링 (Puppeteer)
          // -> 신규 게임일 때만 수행 (기존 게임은 태그가 잘 안 바뀌므로 패스)
          // ---------------------------------------------------------
          let scrapedTags = [];
          if (isNewGame && data) {
              const lowerName = (data.name || '').toLowerCase();
              if (lowerName.includes('soundtrack') || lowerName.includes('ost') || lowerName.includes('dlc')) continue;

              try {
                  await page.goto(`https://store.steampowered.com/app/${steamId}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
                  
                  const ageGate = await page.$('#ageYear');
                  if (ageGate) {
                      await page.select('#ageYear', '2000');
                      const btn = await page.$('.btnv6_blue_hoverfade_btn');
                      if (btn) { await btn.click(); await page.waitForNavigation(); }
                  }
                  scrapedTags = await page.evaluate(() => {
                      return Array.from(document.querySelectorAll('.app_tag')).map(el => el.innerText.trim());
                  });
              } catch (e) { }
          }

          // ---------------------------------------------------------
          // 2. 부가 정보 (트렌드, CCU, 가격) -> ★ 항상 업데이트 (핵심)
          // ---------------------------------------------------------
          const categoryData = await GameCategory.findOne({ steamAppId: steamId }).lean();
          const trends = await getTrendStats(steamId, categoryData);
          const steamCCU = await getSteamCCU(steamId);
          const trendScore = calculateTrendScore(trends, steamCCU);
          
          // 가격 정보는 스팀 데이터(data)가 없으면 기존 것 유지하거나 0 처리
          const priceInfo = data ? await fetchPriceInfo(steamId, data, metadata) : (existingData?.price_info || {});
          const steamReviews = await getSteamReviews(steamId);

          // ---------------------------------------------------------
          // 3. HLTB 플레이타임 (Puppeteer)
          // -> 신규 게임이거나, 기존 게임인데 플레이타임이 없을 때만 수행
          // ---------------------------------------------------------
          let playTime = existingData?.play_time || '정보 없음';
          
          if (hltbLoaded && (isNewGame || isMissingPlaytime)) {
              try {
                const targetName = data?.name || metadata.title;
                const cleanName = cleanGameTitle(targetName);
                
                let steamYear = null;
                if (data?.release_date?.date) {
                    const match = data.release_date.date.match(/(\d{4})/);
                    if (match) steamYear = parseInt(match[1]);
                }

                const searchQueries = [cleanName, targetName].filter(q => q && q.length > 1);
                const uniqueQueries = [...new Set(searchQueries)];

                for (const query of uniqueQueries) {
                    try {
                        await page.goto(`https://howlongtobeat.com/?q=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
                        
                        try {
                            await page.waitForSelector('ul.search_list, .search_list_details', { timeout: 10000 });
                        } catch (e) {
                            try { await page.waitForFunction(() => document.body.innerText.includes("We couldn't find anything"), { timeout: 2000 }); } catch {}
                        }
                        
                        const result = await page.evaluate((targetYear) => {
                            let candidates = Array.from(document.querySelectorAll('li'));
                            if (candidates.length < 2) candidates = Array.from(document.querySelectorAll('div[class*="GameCard"]'));

                            const validCards = candidates.filter(el => {
                                const text = el.innerText;
                                return (text.includes('Hours') || text.includes('Mins')) && !text.includes('We Found');
                            });
                            if (validCards.length === 0) return null;

                            let targetCard = validCards[0];
                            if (targetYear) {
                                const yearMatch = validCards.find(card => {
                                    const matches = card.innerText.match(/(\d{4})/g);
                                    return matches && matches.some(y => Math.abs(parseInt(y) - targetYear) <= 1);
                                });
                                if (yearMatch) targetCard = yearMatch;
                            }

                            const rawText = targetCard.innerText.replace(/\n/g, ' ');
                            function extractTime(label) {
                                const regex = new RegExp(`${label}.*?([0-9½\.]+)\\s*(Hours|Hour|Mins|h)`, 'i');
                                const m = rawText.match(regex);
                                if (m) return `${m[1].replace('½', '.5')} ${m[2]}`.replace('Hours', '시간').replace('Hour', '시간').replace('Mins', '분').replace('h', '시간');
                                return null;
                            }
                            return (extractTime('Main Story') || extractTime('Main + Extra') || extractTime('Co-Op') || extractTime('Multiplayer') || extractTime('Versus') || extractTime('All Styles'));
                        }, steamYear);

                        if (result) {
                            playTime = result;
                            break; 
                        }
                    } catch (e) { }
                    await sleep(500);
                }
              } catch (e) { }
          }

          // ---------------------------------------------------------
          // 4. DB 저장 / 업데이트
          // ---------------------------------------------------------
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

          // 신규 게임이거나 데이터가 있는 경우 기본 정보도 업데이트 (없으면 기존 유지)
          if (data) {
              const rawTags = scrapedTags.length > 0 ? scrapedTags : [...(data.genres || []).map((g) => g.description), ...(data.categories || []).map((c) => c.description)];
              const smart_tags = mapSteamTags(rawTags);
              
              Object.assign(updateData, {
                  slug: `steam-${steamId}`,
                  steam_appid: steamId,
                  title: data.name,
                  title_ko: (categoryData?.chzzk?.categoryValue || data.name).replace(/_/g, ' '),
                  main_image: data.header_image,
                  description: data.short_description,
                  smart_tags: smart_tags, // 태그는 스팀 API 데이터로도 충분
                  releaseDate: data.release_date?.date ? new Date(data.release_date.date.replace(/년|월/g, '-').replace(/일/g, '')) : undefined,
                  metacritic_score: data.metacritic?.score || 0,
                  screenshots: (data.screenshots || []).map(s => s.path_full),
                  pc_requirements: { 
                      minimum: data.pc_requirements?.minimum || "정보 없음", 
                      recommended: data.pc_requirements?.recommended || "정보 없음" 
                  }
              });
          }

          await Game.findOneAndUpdate(
            { steam_appid: steamId },
            updateData, 
            { upsert: true }
          );

          // 트렌드 히스토리는 항상 기록
          await new TrendHistory({
            steam_appid: steamId, trend_score: trendScore,
            twitch_viewers: trends.twitch.value || 0, chzzk_viewers: trends.chzzk.value || 0, steam_ccu: steamCCU,
            recordedAt: new Date()
          }).save();

          processedCount++;
          const status = isNewGame ? "✨ 신규" : (isMissingPlaytime ? "🔧 보강" : "🔄 갱신");
          console.log(`✅ [${status}] ${metadata.title} | Time=${playTime} | CCU=${steamCCU}`);
          
        } catch (e) { console.error(`❌ 처리 실패: ${metadata.steamAppId}`, e.message); }
      }
  }

  try {
      if (browser) await browser.close();
  } catch (e) {}

  console.log(`\n🎉 모든 작업 완료 (총 처리: ${processedCount}개)`);
  process.exit(0);
}

collectGamesData();