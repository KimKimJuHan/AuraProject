// backend/scripts/collector.js
// 역할: API(전체) + Cheerio(최근) 하이브리드 수집 (빠르고 정확함)

require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const axios = require('axios');
const cheerio = require('cheerio'); // ★ 테스트 성공의 핵심
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

// ★ 테스트에서 검증된 헤더 (성인인증 + 영어 강제)
const STEAM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Cookie': 'birthtime=568022401; lastagecheckage=1-0-1988; wants_mature_content=1; Steam_Language=english;',
  'Accept-Language': 'en-US,en;q=0.9'
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cleanGameTitle(title) {
  if (!title) return '';
  let clean = title.replace(/[™®©]/g, '');
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

// IGDB 평점
async function getIGDBRating(gameTitle) {
    if (!TWITCH_CLIENT_ID || !twitchToken) return 0;
    try {
        const cleanTitle = cleanGameTitle(gameTitle).replace(/"/g, '');
        const res = await axios.post(
            'https://api.igdb.com/v4/games',
            `fields name, rating, total_rating; search "${cleanTitle}"; limit 5;`,
            {
                headers: {
                    'Client-ID': TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${twitchToken}`,
                    'Content-Type': 'text/plain'
                }
            }
        );
        if (res.data && res.data.length > 0) {
            const match = res.data.find(g => (g.rating || g.total_rating) && g.name.toLowerCase() === cleanTitle.toLowerCase()) || res.data[0];
            return match.rating ? Math.round(match.rating) : (match.total_rating ? Math.round(match.total_rating) : 0);
        }
    } catch (e) {}
    return 0;
}

// ★ [핵심] Cheerio를 이용한 리뷰 수집 (테스트 성공 로직 이식)
async function getSteamReviews(appId) {
  const result = {
    overall: { summary: "정보 없음", positive: 0, total: 0, percent: 0 },
    recent: { summary: "정보 없음", positive: 0, total: 0, percent: 0 }
  };

  try {
    // 1. [API] 전체 리뷰 (API가 가장 정확함)
    const resApi = await axios.get(
      `https://store.steampowered.com/appreviews/${appId}?json=1&language=all&purchase_type=all`,
      { timeout: 5000 }
    );
    
    if (resApi.data?.query_summary) {
        const s = resApi.data.query_summary;
        result.overall = {
            summary: s.review_score_desc || "정보 없음",
            positive: s.total_positive,
            total: s.total_reviews, 
            percent: s.total_reviews > 0 ? Math.round((s.total_positive / s.total_reviews) * 100) : 0
        };
    }

    // 2. [Cheerio] 최근 리뷰 (테스트 파일에서 성공한 방식)
    const { data: html } = await axios.get(`https://store.steampowered.com/app/${appId}/?l=english`, {
      headers: STEAM_HEADERS, // 성인인증 쿠키 포함
      timeout: 5000
    });
    
    const $ = cheerio.load(html);
    const reviewRows = $('.user_reviews_summary_row');

    reviewRows.each((i, el) => {
        const label = $(el).find('.subtitle').text().trim(); // "Recent Reviews"
        const summary = $(el).find('.game_review_summary').text().trim(); // "Very Positive"
        
        // 괄호 안의 숫자 추출 (Row #1 성공 사례 적용)
        const countTagText = $(el).find('.responsive_hidden').text().trim();
        // 괄호와 콤마 제거: "(633)" -> "633"
        const countText = countTagText.replace(/[(),]/g, '');
        const total = parseInt(countText) || 0;

        // "Recent"가 포함된 행이고 숫자가 있으면 저장
        if ((label.includes('Recent') || label.includes('최근')) && total > 0) {
            result.recent = {
                summary: summary || "정보 없음",
                total: total,
                positive: 0, // 상세 긍정 수는 HTML에서 계산 불가하므로 0
                percent: 0
            };
        }
    });

  } catch (e) {
    // console.log(`Review Fetch Error: ${appId}`);
  }
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

  if (initialSteamData.price_overview) {
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
  console.log('✅ DB Connected. Cheerio 하이브리드 수집(최종) 시작...');

  const metadatas = await GameMetadata.find({});
  if (!metadatas.length) { console.log('⚠️ GameMetadata 비어 있음.'); process.exit(0); }

  const BATCH_SIZE = 10;
  const batches = chunkArray(metadatas, BATCH_SIZE);
  let totalCount = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`\n🔄 Batch ${i + 1}/${batches.length} 시작...`);

    await Promise.all(batch.map(async (metadata) => {
        try {
          const steamRes = await axios.get(
            'https://store.steampowered.com/api/appdetails',
            { params: { appids: metadata.steamAppId, l: 'korean', cc: 'kr' }, headers: STEAM_HEADERS }
          );
          const data = steamRes.data?.[metadata.steamAppId]?.data;
          if (!data) return;

          const lowerName = (data.name || '').toLowerCase();
          if (lowerName.includes('soundtrack') || lowerName.includes('ost') || lowerName.includes('dlc') || lowerName.includes('bundle')) return;

          const categoryData = await GameCategory.findOne({ steamAppId: metadata.steamAppId }).lean();

          const trends = await getTrendStats(metadata.steamAppId, categoryData);
          const steamCCU = await getSteamCCU(metadata.steamAppId);
          const trendScore = calculateTrendScore(trends, steamCCU);
          const priceInfo = await fetchPriceInfo(metadata.steamAppId, data, metadata);
          const steamReviews = await getSteamReviews(metadata.steamAppId);
          const igdbScore = await getIGDBRating(metadata.title || data.name);

          let finalTitle = data.name || metadata.title;
          const cleanedMetaTitle = cleanGameTitle(metadata.title || data.name);
          if (/legacy/i.test(finalTitle) || /bundle/i.test(finalTitle) || finalTitle.includes('_')) {
            finalTitle = cleanedMetaTitle || finalTitle;
          }

          // DB 저장
          await Game.findOneAndUpdate(
            { steam_appid: metadata.steamAppId },
            {
              slug: `steam-${metadata.steamAppId}`, steam_appid: metadata.steamAppId,
              title: finalTitle,
              title_ko: (categoryData?.chzzk?.categoryValue || data.name || finalTitle).replace(/_/g, ' '),
              main_image: data.header_image, description: data.short_description,
              smart_tags: mapSteamTags([...(data.genres || []).map((g) => g.description), ...(data.categories || []).map((c) => c.description)]),
              trend_score: trendScore, twitch_viewers: trends.twitch.value || 0, chzzk_viewers: trends.chzzk.value || 0, steam_ccu: steamCCU,
              steam_reviews: steamReviews, price_info: priceInfo, 
              play_time: "정보 없음", 
              releaseDate: data.release_date?.date ? new Date(data.release_date.date.replace(/년|월/g, '-').replace(/일/g, '')) : undefined,
              metacritic_score: data.metacritic?.score || 0,
              igdb_score: igdbScore
            }, { upsert: true }
          );

          await new TrendHistory({
            steam_appid: metadata.steamAppId, trend_score: trendScore,
            twitch_viewers: trends.twitch.value || 0, chzzk_viewers: trends.chzzk.value || 0, steam_ccu: steamCCU,
            recordedAt: new Date()
          }).save();

          totalCount++;
          console.log(`✅ [${totalCount}] ${finalTitle} | Reviews(All/Recent)=${steamReviews.overall.total}/${steamReviews.recent.total} | IGDB=${igdbScore}`);
        } catch (e) { console.error(`❌ 수집 실패: ${metadata.steamAppId}`, e.message); }
    }));
    await sleep(1000);
  }
  console.log('\n🎉 모든 수집 완료'); process.exit(0);
}

collectGamesData();