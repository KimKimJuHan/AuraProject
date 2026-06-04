/**
 * add_specific_games.js
 * 특정 Steam AppID 게임을 강제로 수집/업데이트합니다.
 * 
 * 사용법: node add_specific_games.js
 * 옵션:  node add_specific_games.js --update  (이미 있는 게임도 업데이트)
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
const FORCE_UPDATE = process.argv.includes('--update');

if (!MONGODB_URI) { console.error('❌ MONGODB_URI 누락'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseSafeDate(dateStr) {
    if (!dateStr || dateStr === 'Coming soon' || dateStr === 'To be announced') return null;
    try {
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? null : d;
    } catch { return null; }
}

// ── 수집할 게임 목록 ──────────────────────────────────────────────────────────
// Steam AppID: https://store.steampowered.com/app/{AppID}
const TARGET_GAMES = [
  // 힐링 / 농장경영 / 캐주얼
  { appid: 413150,  name: 'Stardew Valley' },
  { appid: 1284210, name: 'Littlewood' },
  { appid: 1118690, name: 'Coral Island' },
  { appid: 1062090, name: 'Spiritfarer' },
  { appid: 1621690, name: 'Disney Dreamlight Valley' },
  { appid: 1599600, name: 'Dave the Diver' },
  { appid: 1061090, name: 'Slime Rancher 2' },
  { appid: 1931460, name: 'Palia' },
  { appid: 2379740, name: 'Fabledom' },
  { appid: 2141450, name: 'Dredge' },
  { appid: 1690800, name: 'Terra Nil' },
  { appid: 2139460, name: 'Aka' },
  { appid: 230230,  name: 'Slime Rancher' },
  { appid: 1658050, name: 'Potion Permit' },
  { appid: 1059400, name: 'My Time at Portia' },

  // 신작 (2024~2025)
  { appid: 2457220, name: 'Subnautica: Below Zero' },
  { appid: 264710,  name: 'Subnautica' },
  { appid: 1962700, name: 'Subnautica 2' },
  { appid: 2379780, name: 'Manor Lords' },
  { appid: 553850, name: 'Helldivers 2' },
  { appid: 1145360, name: 'Hades II' },
  { appid: 2357570, name: 'Path of Exile 2' },
  { appid: 2767030, name: 'Marvel Rivals' },
  { appid: 1623730, name: 'Palworld' },
  { appid: 2358720, name: 'Black Myth: Wukong' },
  { appid: 1091500, name: 'Cyberpunk 2077 (Phantom Liberty)' },
  { appid: 1086940, name: 'Baldurs Gate 3' },
  { appid: 1245620, name: 'Elden Ring' },
  { appid: 990080, name: 'Hogwarts Legacy' },
  { appid: 2246340, name: 'Monster Hunter Wilds' },

  // 2025~2026 신작
  
  { appid: 2379780, name: 'Manor Lords' },
  { appid: 2671170, name: 'Schedule I' },
  { appid: 3078800, name: 'Blue Prince' },
  { appid: 2457220, name: 'Avowed' },
  { appid: 1903340, name: 'Clair Obscur: Expedition 33' },
  { appid: 2767030, name: 'Marvel Rivals' },
  { appid: 2933620, name: 'Monster Hunter Wilds' },
  { appid: 2369390, name: 'Once Human' },
  { appid: 899770, name: 'Last Epoch' },
  { appid: 2835570, name: 'Deadlock' },

  // 유명 클래식/멀티
  { appid: 730,     name: 'Counter-Strike 2' },
  { appid: 570,     name: 'Dota 2' },
  { appid: 1172470, name: 'Apex Legends' },
  { appid: 2357570, name: 'Overwatch 2' },
  { appid: 252490,  name: 'Rust' },
  { appid: 1716740, name: 'Mirror Forge' },

  // 인디 명작 / 숨겨진 보석
  { appid: 105600,  name: 'Terraria' },
  { appid: 548430,  name: 'Deep Rock Galactic' },
  { appid: 1599550, name: 'Vampire Survivors' },
  { appid: 1942280, name: 'Brotato' },
  { appid: 2194060, name: 'Against the Storm' },
  { appid: 2475490, name: 'Balatro' },
  { appid: 1812820, name: 'Dome Keeper' },
  { appid: 291550,  name: 'Noita' },
  { appid: 1404720, name: 'Cassette Beasts' },
  { appid: 1794680, name: 'Venba' },
  { appid: 1677740, name: 'Tinykin' },
  { appid: 1637320, name: 'Roots of Pacha' },
];

// ── Steam API ─────────────────────────────────────────────────────────────────
async function getSteamDetails(appId, expectedName) {
  try {
    const res = await axios.get('https://store.steampowered.com/api/appdetails', {
      params: { appids: appId, cc: 'kr', l: 'korean' }, timeout: 10000
    });
    const data = res.data?.[appId];
    if (!data?.success || data.data?.type !== 'game') return null;
    const d = data.data;

    // 이름 검증 - 영문 이름 별도 조회 (한글 응답 vs 영문 기대값 오판 방지)
    if (expectedName) {
      let englishName = d.name || '';
      try {
        const enRes = await axios.get('https://store.steampowered.com/api/appdetails', {
          params: { appids: appId, l: 'english' }, timeout: 8000
        });
        englishName = enRes.data?.[appId]?.data?.name || englishName;
      } catch {}

      const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
      const gotEn = norm(englishName);
      const gotKo = norm(d.name);
      const exp = norm(expectedName);
      const firstWord = exp.split(/\s+/)[0] || exp;

      const match = firstWord.length > 2 &&
        (gotEn.includes(firstWord) || gotKo.includes(firstWord) ||
         exp.includes(gotEn.slice(0, 5)) || gotEn.includes(exp.slice(0, 5)));

      if (!match) {
        console.log(`  ⚠️  이름 불일치: 기대="${expectedName}" / Steam(en)="${englishName}" → 스킵`);
        return null;
      }
    }

    // KR 가격은 이미 원화 (cc=kr) → /100만 적용, ×1350 하면 안 됨
    d._isKrPrice = true;
    d._trailers = (d.movies || []).slice(0, 3).map(m => m.hls_h264 || m.dash_h264 || m.webm?.max || m.mp4?.max || '').filter(Boolean);
    return d;
  } catch { return null; }
}

async function getSteamReviews(appId) {
  try {
    const res = await axios.get(`https://store.steampowered.com/appreviews/${appId}?json=1&language=all`, { timeout: 8000 });
    const s = res.data?.query_summary;
    if (!s) return null;
    return { summary: s.review_score_desc || '정보 없음', total: s.total_reviews || 0, positive: s.total_positive || 0, percent: s.total_reviews > 0 ? Math.round(s.total_positive / s.total_reviews * 100) : 0 };
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
      { params: { key: ITAD_API_KEY, country: 'KR', shops: 'steam,fanatical,gog,epicgames,greenmanGaming' }, timeout: 10000 }
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
      store_name: best.shop?.name || 'Unknown',
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

// ── Puppeteer ─────────────────────────────────────────────────────────────────
let browser = null, puppeteerPage = null;

async function initBrowser() {
  const candidates = ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium'];
  const { existsSync } = require('fs');
  const chromePath = candidates.find(p => existsSync(p));
  if (!chromePath) { console.warn('⚠️ Chrome 없음 - 태그 스크래핑 비활성화'); return; }
  browser = await puppeteer.launch({ executablePath: chromePath, headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  puppeteerPage = await browser.newPage();
  await puppeteerPage.setRequestInterception(true);
  puppeteerPage.on('request', req => ['image','stylesheet','font','media'].includes(req.resourceType()) ? req.abort() : req.continue());
  await puppeteerPage.setCookie({ name: 'birthtime', value: '0', domain: 'store.steampowered.com' });
}

async function scrapeAppTags(appId) {
  if (!puppeteerPage) return [];
  try {
    await puppeteerPage.goto(`https://store.steampowered.com/app/${appId}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    return await puppeteerPage.evaluate(() =>
      Array.from(document.querySelectorAll('.app_tag')).map(el => el.innerText.trim()).filter(t => t && t !== '+')
    );
  } catch { return []; }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('✅ DB 연결 완료');

  try { await initBrowser(); } catch (e) { console.warn('⚠️ Puppeteer 실패:', e.message); }

  const existingMap = new Map(
    (await Game.find({}).select('steam_appid slug').lean()).map(g => [g.steam_appid, g.slug])
  );

  let added = 0, updated = 0, skipped = 0, errors = 0;

  for (const target of TARGET_GAMES) {
    const exists = existingMap.has(target.appid);

    if (exists && !FORCE_UPDATE) {
      console.log(`⏭  [SKIP] ${target.name} (이미 있음 - --update 옵션으로 강제 업데이트 가능)`);
      skipped++;
      continue;
    }

    console.log(`\n🎮 [${exists ? 'UPDATE' : 'NEW'}] ${target.name} (AppID: ${target.appid})`);

    try {
      const data = await getSteamDetails(target.appid, target.name);
      if (!data) { console.log(`  ❌ Steam 정보 없음`); errors++; await sleep(1000); continue; }

      const rawTags = await scrapeAppTags(target.appid);
      await sleep(800);
      const smartTags = mapSteamTags(rawTags.length ? rawTags : []);

      const reviews = await getSteamReviews(target.appid);
      await sleep(300);
      const ccu = await getSteamCCU(target.appid);
      await sleep(300);

      // ITAD 가격
      const meta = await GameMetadata.findOne({ steamAppId: target.appid }).lean();
      let priceInfo = { current_price: 0, regular_price: 0, discount_percent: 0, isFree: data.is_free || false, deals: [] };
      if (meta?.itad?.uuid) {
        const itad = await getITADPrice(meta.itad.uuid);
        if (itad) priceInfo = { ...priceInfo, ...itad };
      } else {
        // cc=kr 응답은 이미 원화이므로 /100만 적용 (×1350 하면 안 됨)
        priceInfo.current_price = Math.round((data.price_overview?.final || 0) / 100) || 0;
        priceInfo.regular_price = Math.round((data.price_overview?.initial || 0) / 100) || 0;
        priceInfo.discount_percent = data.price_overview?.discount_percent || 0;
        priceInfo.store_url = `https://store.steampowered.com/app/${target.appid}`;
        priceInfo.store_name = 'Steam';
      }

      const gameDoc = {
        steam_appid: target.appid,
        slug: `steam-${target.appid}`,
        title: data.name,
        title_ko: data.name,
        description: data.detailed_description || data.short_description || '',
        main_image: data.header_image || '',
        screenshots: (data.screenshots || []).slice(0, 10).map(s => s.path_full),
        trailers: data._trailers || [],
        releaseDate: parseSafeDate(data.release_date?.date),
        metacritic_score: data.metacritic?.score || 0,
        tags: rawTags,
        smart_tags: smartTags,
        difficulty: calcDifficulty(smartTags),
        price_info: priceInfo,
        steam_ccu: ccu,
        steam_reviews: {
          overall: reviews || { summary: '정보 없음', total: 0, positive: 0, percent: 0 },
          recent: { summary: '정보 없음', total: 0, positive: 0, percent: 0 }
        },
        isAdult: false,
        platforms: ['Steam'],
        lastUpdated: new Date()
      };

      await Game.findOneAndUpdate(
        { steam_appid: target.appid },
        { $set: gameDoc },
        { upsert: true, new: true }
      );

      console.log(`  ✅ ${data.name} | 태그:${smartTags.length}개 | 가격:${priceInfo.current_price}원 | CCU:${ccu}`);
      exists ? updated++ : added++;

    } catch (e) {
      console.error(`  ❌ 에러: ${e.message}`);
      errors++;
    }

    await sleep(1500);
  }

  if (browser) await browser.close();
  await mongoose.disconnect();

  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ 완료: 신규 ${added}개 추가 | ${updated}개 업데이트 | ${skipped}개 스킵 | ${errors}개 실패`);
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });