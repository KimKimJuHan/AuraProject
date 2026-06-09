const axios = require('axios');
const Game = require('../models/Game');
const cache = require('../utils/simpleCache');
const { escapeRegex } = require('../utils/gameDictionary');

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
};

const isJunkTitle = (title = '') => {
    const t = title.toLowerCase().trim();
    if (!t) return true;
    const junkPatterns = [
        /mystery game/i, /unknown game/i, /^mystery/i,
        /week \d+ game/i, /coming soon/i, /^tbd$/i, /placeholder/i,
        /to be announced/i, /\bunannounced\b/i,
    ];
    return junkPatterns.some(p => p.test(title));
};

const parseWorth = (worth = '') => {
    const m = String(worth).replace(/[^0-9.]/g, '');
    return m ? parseFloat(m) : 0;
};

const isQualityGiveaway = (platforms = '', worth = '') => {
    const p = String(platforms).toLowerCase();
    const isMajor = /epic|steam|gog|ubisoft|origin|ea/.test(p);
    const price = parseWorth(worth);
    if (price < 3) return false;          // $3 미만 듣보 제외
    if (isMajor) return true;             // 메이저 플랫폼은 통과
    return price >= 10;                   // 마이너(itch/indiegala/stove)는 $10 이상만
};

async function fetchGiveaways() {
    try {
        const results = [];
        const seen = new Set();

        // 1. GamerPower (인기순)
        try {
            const gpRes = await axios.get(
                'https://www.gamerpower.com/api/giveaways?platform=pc&type=game&sort-by=popularity',
                { headers, timeout: 10000 }
            );
            for (const g of (gpRes.data || [])) {
                const worth = g.worth || 'N/A';
                const isPaidGame = worth !== 'N/A' && worth !== '$0.00' && worth !== '0';
                if (!isPaidGame || (g.status && g.status !== 'Active') || isJunkTitle(g.title) || !isQualityGiveaway(g.platforms, worth)) continue;

                const key = (g.title || '').toLowerCase().trim();
                if (seen.has(key)) continue;
                seen.add(key);

                results.push({
                    title: g.title || '',
                    title_ko: g.title || '',
                    main_image: g.image || '',
                    slug: null,
                    giveaway_url: g.open_giveaway_url || g.giveaway_url || '',
                    shop_name: (g.platforms || 'PC').split(',')[0].trim(),
                    expiry: g.end_date && g.end_date !== 'N/A' ? g.end_date : null,
                    description: g.description || '',
                    original_worth: worth,
                    popularity: Number(g.users || 0),
                    is_giveaway: true,
                    source: 'gamerpower',
                });
            }
        } catch (e) { console.error('GamerPower 오류:', e.message); }

        // 2. Epic Games 공식
        try {
            const epicRes = await axios.get(
                'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=ko&country=KR&allowCountries=KR',
                { headers, timeout: 10000 }
            );
            const games = epicRes.data?.data?.Catalog?.searchStore?.elements || [];
            for (const g of games) {
                const offers = g.promotions?.promotionalOffers?.[0]?.promotionalOffers;
                if (!offers || offers.length === 0) continue;
                const isFreeNow = g?.price?.totalPrice?.discountPrice === 0;
                if (!isFreeNow || isJunkTitle(g.title)) continue;

                const key = (g.title || '').toLowerCase().trim();
                if (seen.has(key)) continue;
                seen.add(key);

                const slug = g.productSlug || g.urlSlug || '';
                const validSlug = slug && slug !== '[]' && !slug.includes('[');

                results.push({
                    title: g.title || '',
                    title_ko: g.title || '',
                    main_image: g.keyImages?.find(i => i.type === 'OfferImageWide')?.url ||
                                g.keyImages?.find(i => i.type === 'Thumbnail')?.url ||
                                g.keyImages?.[0]?.url || '',
                    slug: null,
                    giveaway_url: validSlug
                        ? `https://store.epicgames.com/ko/p/${slug}`
                        : 'https://store.epicgames.com/ko/free-games',
                    shop_name: 'Epic Games Store',
                    expiry: offers?.[0]?.endDate || null,
                    description: g.description || '',
                    original_worth: g.price?.totalPrice?.fmtPrice?.originalPrice || '',
                    popularity: 0,
                    is_giveaway: true,
                    source: 'epic',
                });
            }
        } catch (e) { console.error('Epic 오류:', e.message); }

        // 3. GamerPower (최신순)
        try {
            const gpRes2 = await axios.get(
                'https://www.gamerpower.com/api/giveaways?platform=pc&type=game&sort-by=date',
                { headers, timeout: 10000 }
            );
            for (const g of (gpRes2.data || [])) {
                const worth = g.worth || 'N/A';
                const isPaidGame = worth !== 'N/A' && worth !== '$0.00' && worth !== '0';
                if (!isPaidGame || (g.status && g.status !== 'Active') || isJunkTitle(g.title) || !isQualityGiveaway(g.platforms, worth)) continue;

                const key = (g.title || '').toLowerCase().trim();
                if (seen.has(key)) continue;
                seen.add(key);

                results.push({
                    title: g.title || '',
                    title_ko: g.title || '',
                    main_image: g.image || '',
                    slug: null,
                    giveaway_url: g.open_giveaway_url || g.giveaway_url || '',
                    shop_name: (g.platforms || 'PC').split(',')[0].trim(),
                    expiry: g.end_date && g.end_date !== 'N/A' ? g.end_date : null,
                    description: g.description || '',
                    original_worth: worth,
                    popularity: Number(g.users || 0),
                    is_giveaway: true,
                    source: 'gamerpower',
                });
            }
        } catch (e) { console.error('GamerPower2 오류:', e.message); }

        // DB 매칭
        for (const item of results) {
            const dbGame = await Game.findOne({
                $or: [
                    { title: new RegExp('^' + escapeRegex(item.title) + '$', 'i') },
                    { title_ko: new RegExp('^' + escapeRegex(item.title) + '$', 'i') },
                ]
            }).select('slug main_image smart_tags steam_ccu trend_score steam_reviews').lean();
            if (dbGame) {
                item.slug = dbGame.slug;
                if (!item.main_image) item.main_image = dbGame.main_image;
                item.smart_tags = dbGame.smart_tags;
                item.review_percent = dbGame.steam_reviews?.overall?.percent || 0;
                if (!item.popularity) item.popularity = dbGame.trend_score || dbGame.steam_ccu || 0;
            }
        }

        // 정렬
        results.sort((a, b) => {
            if (!!a.slug !== !!b.slug) return a.slug ? -1 : 1;
            const popDiff = (b.popularity || 0) - (a.popularity || 0);
            if (popDiff !== 0) return popDiff;
            return parseWorth(b.original_worth) - parseWorth(a.original_worth);
        });

        // 1시간 캐시 저장 (백그라운드에서 주기적으로 호출)
        cache.set('giveaway:list', results, 60 * 60 * 1000);
        return results;
    } catch (err) {
        console.error('Giveaway fetch error:', err.message);
        return [];
    }
}

module.exports = {
    fetchGiveaways
};
