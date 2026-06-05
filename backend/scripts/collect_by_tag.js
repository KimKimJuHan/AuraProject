/**
 * collect_by_tag.js
 * SteamSpy 태그별 인기 게임을 수집합니다.
 * 힐링/인디/캐주얼 등 SteamSpy TOP 기반에서 누락된 장르를 보완합니다.
 *
 * 사용법: node collect_by_tag.js
 * 옵션:  node collect_by_tag.js --limit 30  (태그당 최대 수집 수)
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const axios = require('axios');
const puppeteer = require('puppeteer-core');

const Game = require('../models/Game');
const GameMetadata = require('../models/GameMetadata');
const { mapSteamTags } = require('../utils/tagMapper');

const MONGODB_URI = process.env.MONGODB_URI;
const ITAD_API_KEY = process.env.ITAD_API_KEY;

if (!MONGODB_URI) { console.error('❌ MONGODB_URI 누락'); process.exit(1); }

const args = process.argv.slice(2);
const LIMIT_PER_TAG = parseInt(args[args.indexOf('--limit') + 1]) || 20;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseSafeDate(dateStr) {
    if (!dateStr || dateStr === 'Coming soon' || dateStr === 'To be announced') return null;
    try {
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? null : d;
    } catch { return null; }
}

// ── 수집할 SteamSpy 태그 목록 ─────────────────────────────────────────────────
const TARGET_TAGS = [
  'Cozy',
  'Relaxing',
  'Wholesome',
  'Farming Sim',
  'Cute',
  'Indie',
  'Pixel Graphics',
  'Roguelite',
  'Tower Defense',
  'City Builder',
  'Turn-Based Strategy',
  'Visual Novel',
  'Rhythm',
  'Sports',
  'Racing',
  'Horror',
  'Psychological Horror',
  'Mystery',
  'Detective',
  'Metroidvania',
];

async function getSteamSpyByTag(tag) {
  try {
    const res = await axios.get('https://steamspy.com/api.php', {
      params: { request: 'tag', tag },
      timeout: 15000
    });
    return Object.values(res.data || {})
      .sort((a, b) => (b.positive + b.negative) - (a.positive + a.negative))
      .slice(0, LIMIT_PER_TAG)
      .map(g => ({ appid: parseInt(g.appid), name: g.name }));
  } catch (e) {
    console.error(`  SteamSpy 태그 [${tag}] 실패:`, e.message);
    return [];
  }
}

async function getSteamDetails(appId) {
  try {
    const res = await axios.get('https://store.steampowered.com/api/appdetails', {
      params: { appids: appId, cc: 'kr', l: 'korean' }, timeout: 10000
    });
    const data = res.data?.[appId];
    if (!data?.success || data.data?.type !== 'game') return null;
    const d = data.data;
    d._trailers = (d.movies || []).slice(0, 3).map(m => m.hls_h264 || m.dash_h264 || m.webm?.max || m.mp4?.max || '').filter(Boolean);
    return d;
  } catch { return null; }
}

async function getSteamReviews(appId) {
  try {
    const res = await axios.get(`https://store.steampowered.com/appreviews/${appId}?json=1&language=all`, { timeout: 8000 });
    const s = res.data?.query_summary;
    if (!s) return null;
    return {
      summary: s.review_score_desc || '정보 없음',
      total: s.total_reviews || 0,
      positive: s.total_positive || 0,
      percent: s.total_reviews > 0 ? Math.round(s.total_positive / s.total_reviews * 100) : 0
    };
  } catch { return null; }
}

async function getSteamCCU(appId) {
  try {
    const res = await axios.get(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appId}`, { timeout: 8000 });
    if (res.data?.response?.result === 1) return res.data.response.player_count || 0;
  } catch {}
  return 0;
}

async function getITADPrice(uuid) {
  if (!ITAD_API_KEY || !uuid) return null;
  try {
    const res = await axios.post('https://api.isthereanydeal.com/games/prices/v3',
      [uuid],
      { params: { key: ITAD_API_KEY, country: 'KR' }, timeout: 10000 }
    );
    const item = res.data?.[0];
    if (!item?.deals?.length) return null;
    const deals = item.deals.sort((a, b) => a.price.amount - b.price.amount);
    const best = deals[0];
    return {
      current_price: Math.round(best.price.amount),
      regular_price: Math.round(best.regular.amount),
      discount_percent: best.cut || 0,
      store_url: best.url,
      deals: deals.slice(0, 10).map(d => ({
        shopName: d.shop?.name || '',
        price: Math.round(d.price.amount),
        regularPrice: Math.round(d.regular.amount),
        discount: d.cut || 0,
        url: d.url
      }))
    };
  } catch { return null; }
}

function calcDifficulty(smartTags) {
  const tags = Array.isArray(smartTags) ? smartTags : [];
  if (['소울라이크', '고난이도', '로그라이크'].some(t => tags.includes(t))) return '심화';
  if (['귀여운', '힐링', '캐주얼', '리듬', '퍼즐', '비주얼노벨', '농장경영'].some(t => tags.includes(t))) return '초심자';
  return '보통';
}

// Puppeteer
let browser = null, page = null;

async function initBrowser() {
  const { existsSync } = require('fs');
  const candidates = ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium'];
  const chromePath = candidates.find(p => existsSync(p));
  if (!chromePath) { console.warn('⚠️ Chrome 없음 - 태그 스크래핑 비활성화'); return; }
  browser = await puppeteer.launch({ executablePath: chromePath, headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', req => ['image','stylesheet','font','media'].includes(req.resourceType()) ? req.abort() : req.continue());
  await page.setCookie({ name: 'birthtime', value: '0', domain: 'store.steampowered.com' });
}

async function scrapeAppTags(appId) {
  if (!page) return [];
  try {
    await page.goto(`https://store.steampowered.com/app/${appId}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    return await page.evaluate(() =>
      Array.from(document.querySelectorAll('.app_tag')).map(el => el.innerText.trim()).filter(t => t && t !== '+')
    );
  } catch { return []; }
}

async function collectGame(appId, name, existingSet) {
  if (existingSet.has(appId)) return 'skip';
  const data = await getSteamDetails(appId);
  if (!data) return 'fail';

  const rawTags = await scrapeAppTags(appId);
  await sleep(800);
  const smartTags = mapSteamTags(rawTags.length ? rawTags : []);
  const reviews = await getSteamReviews(appId);
  await sleep(300);
  const ccu = await getSteamCCU(appId);
  await sleep(300);

  const meta = await GameMetadata.findOne({ steamAppId: appId }).lean();
  let priceInfo = { current_price: 0, regular_price: 0, discount_percent: 0, isFree: data.is_free || false, deals: [] };
  if (meta?.itad?.uuid) {
    const itad = await getITADPrice(meta.itad.uuid);
    if (itad) priceInfo = { ...priceInfo, ...itad };
  } else {
    const krCalc = calcKrPrice(data);
    priceInfo.current_price = krCalc.current_price;
    priceInfo.regular_price = krCalc.regular_price;
    priceInfo.discount_percent = krCalc.discount_percent;
    priceInfo.store_url = `https://store.steampowered.com/app/${appId}`;
  }
  // steam_appid 있으면 store_url 항상 스팀 (itad.link 방지)
  priceInfo.store_url = `https://store.steampowered.com/app/${appId}`;

  await Game.findOneAndUpdate(
    { steam_appid: appId },
    { $set: {
      steam_appid: appId, slug: `steam-${appId}`,
      title: data.name, title_ko: data.name,
      description: data.detailed_description || data.short_description || '',
      main_image: data.header_image || '',
      screenshots: (data.screenshots || []).slice(0, 10).map(s => s.path_full),
      trailers: data._trailers || [],
      releaseDate: parseSafeDate(data.release_date?.date),
      metacritic_score: data.metacritic?.score || 0,
      tags: rawTags, smart_tags: smartTags,
      difficulty: calcDifficulty(smartTags),
      price_info: priceInfo,
      steam_ccu: ccu,
      steam_reviews: { overall: reviews || { summary: '정보 없음', total: 0, positive: 0, percent: 0 }, recent: { summary: '정보 없음', total: 0, positive: 0, percent: 0 } },
      isAdult: false, platforms: ['Steam'], lastUpdated: new Date()
    }},
    { upsert: true }
  );

  existingSet.add(appId);
  return 'add';
}

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('✅ DB 연결');

  try { await initBrowser(); } catch (e) { console.warn('⚠️ Puppeteer:', e.message); }

  const existingSet = new Set(
    (await Game.find({}).select('steam_appid').lean()).map(g => g.steam_appid)
  );
  console.log(`📊 기존 게임: ${existingSet.size}개\n`);

  let totalAdd = 0, totalSkip = 0, totalFail = 0;

  for (const tag of TARGET_TAGS) {
    console.log(`\n🏷  태그: [${tag}]`);
    const candidates = await getSteamSpyByTag(tag);
    console.log(`   후보: ${candidates.length}개`);
    await sleep(1000);

    let tagAdd = 0;
    for (const g of candidates) {
      const result = await collectGame(g.appid, g.name, existingSet);
      if (result === 'skip') { process.stdout.write('.'); totalSkip++; }
      else if (result === 'add') { process.stdout.write(`✅`); tagAdd++; totalAdd++; }
      else { process.stdout.write('❌'); totalFail++; }
      await sleep(1200);
    }
    console.log(`\n   신규 ${tagAdd}개 추가`);
  }

  if (browser) await browser.close();
  await mongoose.disconnect();

  console.log(`\n${'='.repeat(50)}`);
  console.log(`완료: 신규 ${totalAdd}개 | 스킵 ${totalSkip}개 | 실패 ${totalFail}개`);
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });