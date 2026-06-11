const Game = require('../models/Game');
const cache = require('../utils/simpleCache');
const User = require('../models/User');
const TrendHistory = require('../models/TrendHistory');
const { calculateSimilarity, gameToVector, userToVector } = require('../utils/vector');
const { getQueryTags } = require('../utils/tagMapper');

const PERSONAL_TAG_POOL = [
    'RPG', 'FPS', '액션', '어드벤처', '전략', '턴제', '시뮬레이션', '퍼즐', '플랫포머',
    '공포', '생존', '로그라이크', '소울라이크', '메트로배니아', '리듬', '격투', '카드게임',
    'MOBA', '배틀로얄', '비주얼노벨',
    '1인칭', '3인칭', '쿼터뷰', '탑다운', '횡스크롤',
    '픽셀아트', '2D', '3D', '애니메이션풍', '현실적', '귀여운', '힐링', '캐주얼',
    '판타지', '다크판타지', 'SF', '우주', '사이버펑크', '스팀펑크', '중세', '역사',
    '좀비', '포스트아포칼립스', '전쟁', '밀리터리', '현대', '느와르',
    '오픈월드', '샌드박스', '스토리', '선택지', '멀티엔딩', '고난이도', '협동',
    '로컬협동', 'PvP', '경쟁', '멀티플레이', '싱글플레이', '캐릭터커스텀', '자원관리', '기지건설',
];

// ── playerType별 추천 가중치 테이블 ────────────────────────────────────────────
const PLAYER_WEIGHTS = {
    casual: {
        review: 0.45, tag: 0.35, trend: 0.10, steam: 0.10,
        hardPenalty: 0.50, easyBonus: 1.20,
    },
    beginner: {
        review: 0.35, tag: 0.40, trend: 0.15, steam: 0.10,
        hardPenalty: 0.70, easyBonus: 1.10,
    },
    intermediate: {
        review: 0.25, tag: 0.35, trend: 0.20, steam: 0.20,
        hardPenalty: 0.90, easyBonus: 1.00,
    },
    hardcore: {
        review: 0.15, tag: 0.35, trend: 0.15, steam: 0.35,
        hardPenalty: 1.10, easyBonus: 0.85,
    },
    streamer: {
        review: 0.20, tag: 0.25, trend: 0.40, steam: 0.15,
        hardPenalty: 0.95, easyBonus: 1.00, multiBonus: 1.25,
    },
};

// ── 태그 AND 쿼리 ────────────────────────────────────────────────────────────
function buildTagAndQuery(tags) {
    if (!tags || tags.length === 0) return null;
    const andConditions = tags.map(tag => {
        const regexArray = getQueryTags(tag);
        if (!regexArray || regexArray.length === 0) return null;
        return { $or: [{ smart_tags: { $in: regexArray } }, { tags: { $in: regexArray } }] };
    }).filter(Boolean);
    return andConditions.length > 0 ? andConditions : null;
}

// ── 로그 정규화 ─────────────────────────────────────────────────────────────
function logNormalize(value, max) {
    if (max <= 0 || value <= 0) return 0;
    return Math.log10(value + 1) / Math.log10(max + 1);
}

// ── 리뷰 점수 정규화 ───────────────────────────────────────────────────────
function reviewNormalize(percent) {
    if (!percent || percent <= 0) return 0;
    if (percent >= 95) return 1.0;
    if (percent >= 85) return 0.85 + (percent - 85) * 0.015;
    if (percent >= 70) return 0.50 + (percent - 70) * 0.023;
    return percent / 140;
}

// ── 추천 이유 생성 ────────────────────────────────────────────────────────────
function buildReason(game, topFactors) {
    const reasons = [];
    const tags = game.smart_tags || [];

    if (topFactors.includes('tag') && tags.length > 0) {
        const shownTags = tags.slice(0, 2).join(', ');
        reasons.push(`${shownTags} 장르 취향에 맞는 게임`);
    }
    if (topFactors.includes('steam')) reasons.push('플레이 이력 기반 추천');
    if (topFactors.includes('trend') && (game.trend_score || 0) > 1000) reasons.push('지금 인기 급상승 중');
    if (game.steam_reviews?.overall?.percent >= 90 && game.steam_reviews?.overall?.total > 1000) {
        reasons.push(`스팀 ${game.steam_reviews.overall.percent}% 긍정 평가`);
    }
    if (game.price_info?.discount_percent >= 50) reasons.push(`${game.price_info.discount_percent}% 할인 중`);
    return reasons.slice(0, 2).join(' · ') || '맞춤 추천';
}

// ── 다양성 보장: 유사 장르 통합 그룹핑 ─────────────────────────────────────
const GENRE_BUCKETS = {
    'FPS': 'shooter', '배틀로얄': 'shooter',
    'MOBA': 'competitive', '경쟁': 'competitive', 'PvP': 'competitive',
    'RPG': 'rpg', '소울라이크': 'rpg', '메트로배니아': 'rpg', '로그라이크': 'rpg',
    '액션': 'action', '격투': 'action', '플랫포머': 'action',
    '전략': 'strategy', '턴제': 'strategy', '카드게임': 'strategy',
    '시뮬레이션': 'simulation', '자원관리': 'simulation', '기지건설': 'simulation',
    '어드벤처': 'adventure', '공포': 'adventure', '비주얼노벨': 'adventure', '퍼즐': 'adventure',
};

function getBucket(tags) {
    for (const tag of (tags || [])) {
        if (GENRE_BUCKETS[tag]) return GENRE_BUCKETS[tag];
    }
    return 'other';
}

function diversify(games, maxPerBucket = 3) {
    const bucketCount = {};
    const result = [];
    const deferred = [];

    for (const game of games) {
        const bucket = getBucket(game.smart_tags);
        const count = bucketCount[bucket] || 0;
        if (count < maxPerBucket) {
            bucketCount[bucket] = count + 1;
            result.push(game);
        } else {
            deferred.push(game);
        }
    }
    return [...result, ...deferred];
}

class RecommendController {

    // ── 메인 페이지 ────────────────────────────────────────────────────────
    async getMainPageGames(req, res) {
        try {
            const { userId, tags, sortBy, page = 1, priceRange = 'all', priceMin, priceMax, minDiscount = 0, hideOwned = false } = req.body;
            const limit = 20;
            const skip = (page - 1) * limit;

            const query = { isAdult: { $ne: true } };

            if (userId) {
                const user = await User.findById(userId).select('steamGames dislikedGames');
                const isHideOwned = hideOwned === true || hideOwned === 'true';
                if (isHideOwned && user?.steamGames?.length > 0) {
                    query.steam_appid = { $nin: user.steamGames.map(g => Number(g.appid)).filter(id => !isNaN(id)) };
                }
                if (user?.dislikedGames?.length > 0) {
                    query.slug = { $nin: user.dislikedGames };
                }
            }

            const andConditions = buildTagAndQuery(tags);
            if (andConditions) query.$and = andConditions;

            // 가격대 필터
            if (priceRange === 'free') {
                query['price_info.isFree'] = true;
            } else if (priceRange === '~10000') {
                query['price_info.current_price'] = { $gte: 2000, $lte: 10000 };
            } else if (priceRange === '~30000') {
                query['price_info.current_price'] = { $gte: 2000, $lte: 30000 };
            } else if (priceRange === '~50000') {
                query['price_info.current_price'] = { $gte: 2000, $lte: 50000 };
            } else if (priceRange === '50000+') {
                query['price_info.current_price'] = { $gt: 50000, $lte: 500000 };
            }

            // sortBy별 필터 + 정렬
            let sortOption = {};
            if (sortBy === 'popular') {
                sortOption = { trend_score: -1, steam_ccu: -1 };
            } else if (sortBy === 'new') {
                query.releaseDate = { $lte: new Date(), $ne: null };
                query.main_image = { $nin: [null, ''] };
                if (!query['price_info.current_price']) query['price_info.current_price'] = { $gt: 0 };
                query['steam_reviews.overall.total'] = { $gte: 5 };
                sortOption = { releaseDate: -1, trend_score: -1 };
            } else if (sortBy === 'discount') {
                // 유료 게임만 할인 표시 (무료 게임 할인률 이상한 데이터 제외)
                query['price_info.isFree'] = { $ne: true };
                query['price_info.regular_price'] = { $gt: 0 };
                query['price_info.discount_percent'] = { $gt: 0 };
                query['steam_reviews.overall.total'] = { $gte: 10 };
                sortOption = { 'price_info.discount_percent': -1, trend_score: -1 };
            } else if (sortBy === 'price') {
                // 실제 유료 게임만: isFree!=true && 2000원~50만원 (비정상 가격 제외)
                query['price_info.isFree'] = { $ne: true };
                query['price_info.current_price'] = { $gte: 2000, $lte: 500000 };
                sortOption = { 'price_info.current_price': 1, trend_score: -1 };
            } else if (sortBy === 'review') {
                query['steam_reviews.overall.total'] = { $gte: 500 };
                sortOption = { 'steam_reviews.overall.percent': -1, 'steam_reviews.overall.total': -1 };
            } else if (sortBy === 'rising') {
                const now = new Date();
                const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000);
                const recent = await TrendHistory.aggregate([
                    { $match: { recordedAt: { $gte: threeDaysAgo } } },
                    { $sort: { recordedAt: 1 } },
                    { $group: {
                        _id: '$steam_appid',
                        first: { $first: '$trend_score' },
                        last: { $last: '$trend_score' },
                    }},
                    { $project: { growth: { $subtract: ['$last', '$first'] } } },
                    { $match: { growth: { $gt: 0 } } },
                    { $sort: { growth: -1 } },
                    { $limit: 200 },
                ]);
                const risingAppids = recent.map(r => r._id);
                if (risingAppids.length > 0) {
                    query.steam_appid = query.steam_appid
                        ? { $in: risingAppids, ...(query.steam_appid.$nin ? { $nin: query.steam_appid.$nin } : {}) }
                        : { $in: risingAppids };
                }
                sortOption = { trend_score: -1 };
            } else {
                sortOption = { trend_score: -1 };
            }

            // 최소 할인율 필터 (sortBy=discount일 때는 위에서 이미 처리)
            if (minDiscount > 0 && sortBy !== 'discount') {
                query['price_info.discount_percent'] = { $gte: Number(minDiscount) };
            }

            const [totalGames, games] = await Promise.all([
                Game.countDocuments(query),
                Game.find(query).sort(sortOption).skip(skip).limit(limit).lean()
            ]);

            const result = games.map(g => {
                let reason = '조건에 맞는 추천 게임';
                if (sortBy === 'discount') reason = `${g.price_info?.discount_percent || 0}% 할인 중`;
                else if (sortBy === 'popular') reason = '지금 많은 게이머가 즐기는 게임';
                else if (sortBy === 'new') reason = '최근 출시 신작';
                else if (sortBy === 'price') reason = '합리적인 가격';
                else if (sortBy === 'review') reason = '높은 평점';
                return { ...g, reason };
            });

            res.json({ success: true, games: result, validTags: PERSONAL_TAG_POOL, totalPages: Math.ceil(totalGames / limit) || 1 });
        } catch (error) {
            console.error('메인 페이지 에러:', error);
            res.status(500).json({ success: false, message: '서버 에러' });
        }
    }

    // ── 개인화 추천 ────────────────────────────────────────────────────────
    async getPersonalRecommendations(req, res) {
        try {
            const { userId, tags = [], term } = req.body;
            const userSelectedTags = Array.isArray(tags) ? tags : [];

            let userLikedTags = [];
            let userSteamGames = [];
            let userType = 'beginner';
            let userDislikedGames = [];
            let userTagWeights = {};

            if (userId) {
                const user = await User.findById(userId).lean();
                if (user) {
                    userLikedTags = user.likedTags || [];
                    userSteamGames = user.steamGames || [];
                    userType = user.playerType || 'beginner';
                    userDislikedGames = user.dislikedGames || [];
                    // user.tagWeights is a plain object when using .lean()
                    userTagWeights = user.tagWeights ? (typeof user.tagWeights.entries === 'function' ? Object.fromEntries(user.tagWeights) : user.tagWeights) : {};
                    
                    if (userSteamGames.length > 0) {
                        const appIds = userSteamGames.map(g => g.appid);
                        const dbGames = await Game.find({ steam_appid: { $in: appIds } }).select('steam_appid smart_tags').lean();
                        userSteamGames = userSteamGames.map(g => {
                            const match = dbGames.find(dbG => dbG.steam_appid === g.appid);
                            return { ...g, smart_tags: match ? match.smart_tags : [] };
                        });
                    }
                }
            }

            // 캐시 키에 playerType + likedTags + steamGames 수 포함: 성향/태그/스팀연동 변경 즉시 반영
            const cacheKey = `reco:${userId || 'guest'}:${userType}:${userSteamGames.length}:${JSON.stringify([...userSelectedTags, ...userLikedTags].sort())}`;
            const cached = cache.get(cacheKey);
            if (cached) return res.json({ ...cached, cached: true });

            const weights = PLAYER_WEIGHTS[userType] || PLAYER_WEIGHTS.beginner;
            const combinedTags = [...new Set([...userSelectedTags, ...userLikedTags])];
            const hasTags = combinedTags.length > 0;
            const hasSteam = userSteamGames.length > 0;

            const candidateQuery = { isAdult: { $ne: true } };
            if (hasSteam) candidateQuery.steam_appid = { $nin: userSteamGames.map(g => Number(g.appid)).filter(id => !isNaN(id)) };

            if (term?.trim()) {
                const keyword = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                candidateQuery.$or = [
                    { title: { $regex: keyword, $options: 'i' } },
                    { title_ko: { $regex: keyword, $options: 'i' } }
                ];
            }

            if (userSelectedTags.length > 0) {
                const andConditions = buildTagAndQuery(userSelectedTags);
                if (andConditions) candidateQuery.$and = andConditions;
            }

            let candidates;
            if (hasTags || hasSteam) {
                const matched = await Game.find(candidateQuery)
                    .select('_id title title_ko slug steam_appid main_image smart_tags price_info steam_reviews steam_ccu trend_score difficulty releaseDate metacritic_score igdb_score')
                    .sort({ trend_score: -1 })
                    .limit(500).lean();
                const matchedSlugs = new Set(matched.map(g => g.slug));
                const randomMatch = { isAdult: { $ne: true } };
                if (hasSteam) randomMatch.steam_appid = { $nin: userSteamGames.map(g => Number(g.appid)).filter(id => !isNaN(id)) };
                const randomExtra = await Game.aggregate([
                    { $match: randomMatch },
                    { $sample: { size: 300 } }
                ]);
                candidates = [...matched, ...randomExtra.filter(g => !matchedSlugs.has(g.slug))];
            } else {
                const coldStartMatch = { isAdult: { $ne: true } };
                if (hasSteam) coldStartMatch.steam_appid = { $nin: userSteamGames.map(g => Number(g.appid)).filter(id => !isNaN(id)) };
                candidates = await Game.aggregate([
                    { $match: coldStartMatch },
                    { $sample: { size: 800 } }
                ]);
            }

            if (candidates.length < 20 && userSelectedTags.length > 0) {
                const relaxedQuery = { ...candidateQuery };
                delete relaxedQuery.$and;
                const orConditions = userSelectedTags.flatMap(tag => {
                    const regexes = getQueryTags(tag);
                    return regexes.length > 0 ? [{ smart_tags: { $in: regexes } }, { tags: { $in: regexes } }] : [];
                });
                if (orConditions.length > 0) relaxedQuery.$or = orConditions;
                candidates = await Game.find(relaxedQuery)
                    .select('_id title title_ko slug steam_appid main_image smart_tags price_info steam_reviews steam_ccu trend_score difficulty releaseDate metacritic_score igdb_score')
                    .limit(1000)
                    .lean();
            }

            if (candidates.length === 0) {
                return res.json({
                    success: true,
                    data: { comprehensive: [], costEffective: [], trend: [], hiddenGem: [], multiplayer: [] },
                    validTags: PERSONAL_TAG_POOL
                });
            }

            const filteredCandidates = candidates.filter(g => !userDislikedGames.includes(g.slug));
            const maxTrend = Math.max(...filteredCandidates.map(g => g.trend_score || 0), 1);
            const userTagVec = hasTags ? userToVector(combinedTags, []) : {};
            const userSteamVec = hasSteam ? userToVector([], userSteamGames) : {};

            const scored = filteredCandidates.map(game => {
                const gTags = game.smart_tags?.length > 0 ? game.smart_tags : [];
                const gameVec = gameToVector(gTags);
                const reviewNorm = reviewNormalize(game.steam_reviews?.overall?.percent || 0);
                const trendNorm = Math.min(logNormalize(game.trend_score || 0, maxTrend), 0.8);
                const tagSim = hasTags ? calculateSimilarity(userTagVec, gameVec) : 0;
                const steamSim = hasSteam ? calculateSimilarity(userSteamVec, gameVec) : 0;

                let tagW = hasTags ? weights.tag : 0;
                let steamW = hasSteam ? weights.steam : 0;
                
                let unusedW = (hasTags ? 0 : weights.tag) + (hasSteam ? 0 : weights.steam);
                let reviewRatio = weights.review / (weights.review + weights.trend);
                let trendRatio = weights.trend / (weights.review + weights.trend);

                let reviewW = weights.review + (unusedW * reviewRatio);
                let trendW = weights.trend + (unusedW * trendRatio);

                let tagWeightBonus = 0;
                if (Object.keys(userTagWeights).length > 0) {
                    const gameTags = game.smart_tags || [];
                    for (const tag of gameTags) {
                        const w = userTagWeights[tag];
                        if (w !== undefined) tagWeightBonus += w * 0.05;
                    }
                    tagWeightBonus = Math.max(-0.3, Math.min(0.3, tagWeightBonus));
                }

                let score = (reviewNorm * reviewW) + (trendNorm * trendW) + (tagSim * tagW) + (steamSim * steamW) + tagWeightBonus;
                score *= (0.95 + Math.random() * 0.10);

                const isHard = gTags.some(t => ['소울라이크', '고난이도'].includes(t));
                const isEasy = gTags.some(t => ['귀여운', '힐링', '캐주얼'].includes(t));
                const isMulti = gTags.some(t => ['멀티플레이', '협동', 'PvP', '경쟁'].includes(t));
                const isNew = game.releaseDate && (Date.now() - new Date(game.releaseDate)) < 90 * 24 * 60 * 60 * 1000;

                if (isHard) score *= weights.hardPenalty;
                if (isEasy) score *= weights.easyBonus;
                if (isMulti && weights.multiBonus) score *= weights.multiBonus;
                if (isNew && ['streamer', 'intermediate'].includes(userType)) score *= 1.10;

                const reviewTotal = game.steam_reviews?.overall?.total || 0;
                if (reviewTotal < 100) score *= 0.85;
                else if (reviewTotal < 1000) score *= 0.95;

                const factors = [
                    { name: 'tag', val: tagSim * tagW },
                    { name: 'steam', val: steamSim * steamW },
                    { name: 'trend', val: trendNorm * trendW },
                    { name: 'review', val: reviewNorm * reviewW },
                ].sort((a, b) => b.val - a.val);

                const reason = buildReason(game, factors.slice(0, 2).map(f => f.name));
                return { ...game, _score: score, reason };
            });

            scored.sort((a, b) => b._score - a._score);
            const diversified = diversify(scored, 3);
            const comprehensive = diversified.slice(0, 20);

            const baseSectionQuery = { isAdult: { $ne: true } };
            if (hasSteam) baseSectionQuery.steam_appid = { $nin: userSteamGames.map(g => Number(g.appid)).filter(id => !isNaN(id)) };

            const usedSlugs = new Set(comprehensive.map(g => g.slug));

            const [costEffectiveRaw, trendRaw, hiddenGemRaw, multiplayerRaw] = await Promise.all([
                Game.find({
                    ...baseSectionQuery,
                    'price_info.isFree': { $ne: true },
                    $or: [
                        { 'price_info.discount_percent': { $gte: 50 } },
                        { 'price_info.current_price': { $gte: 2000, $lte: 5000 } }
                    ]
                }).sort({ 'price_info.discount_percent': -1 }).limit(100).lean(),
                Game.find({ ...baseSectionQuery, trend_score: { $gt: 0 } })
                    .sort({ trend_score: -1 }).limit(100).lean(),
                Game.find({
                    ...baseSectionQuery,
                    'steam_reviews.overall.percent': { $gte: 90 },
                    'steam_reviews.overall.total': { $gte: 100, $lte: 10000 }
                }).sort({ 'steam_reviews.overall.percent': -1 }).limit(100).lean(),
                Game.find({
                    ...baseSectionQuery,
                    smart_tags: { $in: [/멀티플레이/i, /협동/i, /PvP/i] }
                }).sort({ trend_score: -1 }).limit(100).lean()
            ]);

            const dedup = (arr, limit = 10) => {
                const result = [];
                for (const g of arr) {
                    if (!usedSlugs.has(g.slug)) {
                        usedSlugs.add(g.slug);
                        result.push(g);
                        if (result.length >= limit) break;
                    }
                }
                return result;
            };

            const sortByUserTags = (arr) => {
                if (!hasTags) return arr;
                return [...arr].sort((a, b) => {
                    const aScore = (a.smart_tags || []).filter(t => combinedTags.includes(t)).length;
                    const bScore = (b.smart_tags || []).filter(t => combinedTags.includes(t)).length;
                    return bScore - aScore;
                });
            };

            const costEffective = dedup(sortByUserTags(costEffectiveRaw));
            const trend = dedup(sortByUserTags(trendRaw));
            const hiddenGem = dedup(sortByUserTags(hiddenGemRaw));
            const multiplayer = dedup(multiplayerRaw);

            const responseData = {
                success: true,
                data: {
                    comprehensive,
                    costEffective: costEffective.map(g => ({ ...g, reason: g.price_info?.discount_percent >= 50 ? `${g.price_info.discount_percent}% 할인 중인 게임` : '저렴하게 즐길 수 있는 게임' })),
                    trend: trend.map(g => ({ ...g, reason: '지금 가장 주목받는 게임' })),
                    hiddenGem: hiddenGem.map(g => ({ ...g, reason: `${g.steam_reviews?.overall?.percent}% 긍정 평가의 숨겨진 명작` })),
                    multiplayer: multiplayer.map(g => ({ ...g, reason: '함께 즐기기 좋은 게임' }))
                },
                validTags: PERSONAL_TAG_POOL
            };

            cache.set(cacheKey, responseData, 5 * 60 * 1000); // 5분 캐시
            res.status(200).json(responseData);

        } catch (error) {
            console.error('개인화 추천 에러:', error);
            res.status(500).json({ success: false, message: '서버 에러' });
        }
    }

    // ── 내 투표 조회 ────────────────────────────────────────────────────────
    async getMyVote(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user?._id;
            if (!userId) return res.json({ userVote: null });

            let game = null;
            if (id.startsWith('steam-')) {
                const appId = parseInt(id.replace('steam-', ''), 10);
                if (!isNaN(appId)) game = await Game.findOne({ steam_appid: appId }).select('slug votes').lean();
            }
            if (!game) game = await Game.findOne({ slug: id }).select('slug votes').lean();
            if (!game) return res.json({ userVote: null });

            const vote = (game.votes || []).find(v => String(v.userId) === String(userId));
            res.json({ userVote: vote?.type || null });
        } catch (err) {
            console.error('getMyVote 에러:', err);
            res.json({ userVote: null });
        }
    }

}

module.exports = new RecommendController();