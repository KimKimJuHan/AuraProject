const Game = require('../models/Game');
const User = require('../models/User');
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
// 각 값은 해당 요소의 상대적 비중 (합산 후 정규화됨)
const PLAYER_WEIGHTS = {
    casual: {
        review: 0.45,   // 검증된 게임 위주 (평점 중시)
        tag: 0.35,      // 취향 반영
        trend: 0.10,    // 트렌드 낮게 (복잡한 게임 회피)
        steam: 0.10,    // Steam 이력 낮게 (보유 게임 적음)
        // 난이도 페널티: 심화 강하게 회피
        hardPenalty: 0.50,
        easyBonus: 1.20,
    },
    beginner: {
        review: 0.35,
        tag: 0.40,      // 선택한 태그 가장 중요
        trend: 0.15,
        steam: 0.10,
        hardPenalty: 0.70,
        easyBonus: 1.10,
    },
    intermediate: {
        review: 0.25,
        tag: 0.35,
        trend: 0.20,    // 트렌드도 반영
        steam: 0.20,    // Steam 이력 적극 반영
        hardPenalty: 0.90,  // 거의 페널티 없음
        easyBonus: 1.00,
    },
    hardcore: {
        review: 0.15,   // 평점보다 취향 우선
        tag: 0.35,
        trend: 0.15,
        steam: 0.35,    // Steam 플레이 이력 가장 중요
        hardPenalty: 1.10,  // 고난이도 오히려 보너스
        easyBonus: 0.85,    // 쉬운 게임 소폭 페널티
    },
    streamer: {
        review: 0.20,
        tag: 0.25,
        trend: 0.40,    // 트렌드 압도적 중요 (시청자 관심)
        steam: 0.15,
        hardPenalty: 0.95,
        easyBonus: 1.00,
        multiBonus: 1.25,   // 멀티플레이 게임 보너스
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

// ── 로그 정규화 (trend_score 분포 극단적 치우침 보정) ─────────────────────────
function logNormalize(value, max) {
    if (max <= 0 || value <= 0) return 0;
    return Math.log10(value + 1) / Math.log10(max + 1);
}

// ── 리뷰 점수 정규화 (70점 이하는 빠르게 감소) ───────────────────────────────
function reviewNormalize(percent) {
    if (!percent || percent <= 0) return 0;
    if (percent >= 95) return 1.0;
    if (percent >= 85) return 0.85 + (percent - 85) * 0.015;
    if (percent >= 70) return 0.50 + (percent - 70) * 0.023;
    return percent / 140; // 70점 미만은 급격히 낮아짐
}

// ── 추천 이유 생성 ────────────────────────────────────────────────────────────
function buildReason(game, topFactors) {
    const reasons = [];
    const tags = game.smart_tags || [];

    if (topFactors.includes('tag') && tags.length > 0) {
        const shownTags = tags.slice(0, 2).join(', ');
        reasons.push(`${shownTags} 장르 취향에 맞는 게임`);
    }
    if (topFactors.includes('steam')) {
        reasons.push('플레이 이력 기반 추천');
    }
    if (topFactors.includes('trend') && (game.trend_score || 0) > 1000) {
        reasons.push('지금 인기 급상승 중');
    }
    if (game.steam_reviews?.overall?.percent >= 90 && game.steam_reviews?.overall?.total > 1000) {
        reasons.push(`스팀 ${game.steam_reviews.overall.percent}% 긍정 평가`);
    }
    if (game.price_info?.discount_percent >= 50) {
        reasons.push(`${game.price_info.discount_percent}% 할인 중`);
    }
    return reasons.slice(0, 2).join(' · ') || '맞춤 추천';
}

// ── 다양성 보장: 유사 장르 통합 그룹핑 ─────────────────────────────────────
// 비슷한 장르를 하나의 버킷으로 묶어서 특정 카테고리 편중 방지
const GENRE_BUCKETS = {
    // FPS 계열 통합
    'FPS': 'shooter', '배틀로얄': 'shooter',
    // 멀티플레이 경쟁 계열
    'MOBA': 'competitive', '경쟁': 'competitive', 'PvP': 'competitive',
    // RPG 계열
    'RPG': 'rpg', '소울라이크': 'rpg', '메트로배니아': 'rpg', '로그라이크': 'rpg',
    // 액션 계열
    '액션': 'action', '격투': 'action', '플랫포머': 'action',
    // 전략 계열
    '전략': 'strategy', '턴제': 'strategy', '카드게임': 'strategy',
    // 시뮬레이션 계열
    '시뮬레이션': 'simulation', '자원관리': 'simulation', '기지건설': 'simulation', '농장경영': 'simulation',
    // 어드벤처 계열
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
            const { userId, tags, sortBy, page = 1 } = req.body;
            const limit = 20;
            const skip = (page - 1) * limit;

            const query = { isAdult: { $ne: true } };

            if (userId) {
                const user = await User.findById(userId).select('steamGames');
                if (user?.steamGames?.length > 0) {
                    query.steam_appid = { $nin: user.steamGames.map(g => g.appid) };
                }
            }

            const andConditions = buildTagAndQuery(tags);
            if (andConditions) query.$and = andConditions;

            let sortOption = {};
            if (sortBy === 'popular') sortOption = { trend_score: -1, steam_ccu: -1 };
            else if (sortBy === 'new') sortOption = { releaseDate: -1 };
            else if (sortBy === 'discount') {
                query['price_info.discount_percent'] = { $gt: 0 };
                sortOption = { 'price_info.discount_percent': -1 };
            }
            else if (sortBy === 'price') sortOption = { 'price_info.current_price': 1 };
            else sortOption = { trend_score: -1 };

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
            const { userId, tags, term } = req.body;
            const userSelectedTags = Array.isArray(tags) ? tags : [];

            let userLikedTags = [];
            let userSteamGames = [];
            let userType = 'beginner';

            if (userId) {
                const user = await User.findById(userId).lean();
                if (user) {
                    userLikedTags = user.likedTags || [];
                    userSteamGames = user.steamGames || [];
                    userType = user.playerType || 'beginner';
                }
            }

            const weights = PLAYER_WEIGHTS[userType] || PLAYER_WEIGHTS.beginner;
            const combinedTags = [...new Set([...userSelectedTags, ...userLikedTags])];
            const hasTags = combinedTags.length > 0;
            const hasSteam = userSteamGames.length > 0;

            // ── 후보 게임 쿼리 ────────────────────────────────────────────
            const candidateQuery = { isAdult: { $ne: true } };

            if (hasSteam) {
                candidateQuery.steam_appid = { $nin: userSteamGames.map(g => g.appid) };
            }

            if (term?.trim()) {
                const keyword = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                candidateQuery.$or = [
                    { title: { $regex: keyword, $options: 'i' } },
                    { title_ko: { $regex: keyword, $options: 'i' } }
                ];
            }

            // 태그 선택 시: AND 필터 (정확한 매칭)
            // 태그 미선택 시: 전체 후보에서 벡터 유사도로 추천
            if (userSelectedTags.length > 0) {
                const andConditions = buildTagAndQuery(userSelectedTags);
                if (andConditions) candidateQuery.$and = andConditions;
            }

            // 후보 1000개 (기존 500에서 확대 → 다양성 확보)
            let candidates = await Game.find(candidateQuery)
                .select('_id title title_ko slug steam_appid main_image smart_tags price_info steam_reviews steam_ccu trend_score difficulty releaseDate metacritic_score igdb_score')
                .limit(1000)
                .lean();

            // 태그 AND 필터 결과가 너무 적으면 ($and 제거하고 OR 방식으로 확장)
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

            // ── 벡터 준비 ─────────────────────────────────────────────────
            const maxTrend = Math.max(...candidates.map(g => g.trend_score || 0), 1);
            const userTagVec = hasTags ? userToVector(combinedTags, []) : {};
            const userSteamVec = hasSteam ? userToVector([], userSteamGames) : {};

            // ── 점수 계산 ─────────────────────────────────────────────────
            const scored = candidates.map(game => {
                const gTags = game.smart_tags?.length > 0 ? game.smart_tags : [];
                const gameVec = gameToVector(gTags);

                // 각 요소 0~1 정규화
                const reviewNorm = reviewNormalize(game.steam_reviews?.overall?.percent || 0);
                // trend 상한선 캡: 상위 5% 게임이 trend를 독점하지 않도록 0.8로 제한
                const trendNorm = Math.min(logNormalize(game.trend_score || 0, maxTrend), 0.8);
                const tagSim = hasTags ? calculateSimilarity(userTagVec, gameVec) : 0;
                const steamSim = hasSteam ? calculateSimilarity(userSteamVec, gameVec) : 0;

                // 가중치 적용 (hasTags/hasSteam 없으면 해당 가중치를 review에 분배)
                let tagW = hasTags ? weights.tag : 0;
                let steamW = hasSteam ? weights.steam : 0;
                let reviewW = weights.review + (hasTags ? 0 : weights.tag * 0.5) + (hasSteam ? 0 : weights.steam * 0.5);
                let trendW = weights.trend + (hasTags ? 0 : weights.tag * 0.5) + (hasSteam ? 0 : weights.steam * 0.5);

                let score = (reviewNorm * reviewW) + (trendNorm * trendW) + (tagSim * tagW) + (steamSim * steamW);

                // ── playerType 보정 ───────────────────────────────────────
                const isHard = gTags.some(t => ['소울라이크', '고난이도'].includes(t));
                const isEasy = gTags.some(t => ['귀여운', '힐링', '캐주얼'].includes(t));
                const isMulti = gTags.some(t => ['멀티플레이', '협동', 'PvP', '경쟁'].includes(t));
                const isNew = game.releaseDate && (Date.now() - new Date(game.releaseDate)) < 90 * 24 * 60 * 60 * 1000;

                if (isHard) score *= weights.hardPenalty;
                if (isEasy) score *= weights.easyBonus;
                if (isMulti && weights.multiBonus) score *= weights.multiBonus;
                // 신작 보너스 (streamer/intermediate는 신작 선호)
                if (isNew && ['streamer', 'intermediate'].includes(userType)) score *= 1.10;

                // 리뷰 수 신뢰도 보정 (리뷰 수 적으면 점수 약간 감소)
                const reviewTotal = game.steam_reviews?.overall?.total || 0;
                if (reviewTotal < 100) score *= 0.85;
                else if (reviewTotal < 1000) score *= 0.95;

                // 상위 기여 요소 파악 (추천 이유 생성용)
                const factors = [
                    { name: 'tag', val: tagSim * tagW },
                    { name: 'steam', val: steamSim * steamW },
                    { name: 'trend', val: trendNorm * trendW },
                    { name: 'review', val: reviewNorm * reviewW },
                ].sort((a, b) => b.val - a.val);

                const reason = buildReason(game, factors.slice(0, 2).map(f => f.name));

                return { ...game, _score: score, reason };
            });

            // ── 정렬 + 다양성 보장 ────────────────────────────────────────
            scored.sort((a, b) => b._score - a._score);
            const diversified = diversify(scored, 3); // 유사 장르 버킷당 최대 3개
            const comprehensive = diversified.slice(0, 20);

            // ── 섹션별 쿼리 (Steam 보유 게임 배제 유지) ──────────────────
            const baseSectionQuery = { isAdult: { $ne: true } };
            if (hasSteam) baseSectionQuery.steam_appid = { $nin: userSteamGames.map(g => g.appid) };

            const [costEffective, trend, hiddenGem, multiplayer] = await Promise.all([
                // 가성비: 50% 이상 할인 or 5000원 이하
                Game.find({
                    ...baseSectionQuery,
                    $or: [
                        { 'price_info.discount_percent': { $gte: 50 } },
                        { 'price_info.current_price': { $lte: 5000, $gt: 0 } }
                    ]
                }).sort({ 'price_info.discount_percent': -1 }).limit(10).lean(),

                // 트렌드: trend_score 기반 (치지직+SOOP+Twitch+CCU 합산)
                Game.find({ ...baseSectionQuery, trend_score: { $gt: 0 } })
                    .sort({ trend_score: -1 }).limit(10).lean(),

                // 숨겨진 명작: 평점 90%+ AND 리뷰 100~10000개 사이 (소규모 인디)
                Game.find({
                    ...baseSectionQuery,
                    'steam_reviews.overall.percent': { $gte: 90 },
                    'steam_reviews.overall.total': { $gte: 100, $lte: 10000 }
                }).sort({ 'steam_reviews.overall.percent': -1 }).limit(10).lean(),

                // 멀티플레이
                Game.find({
                    ...baseSectionQuery,
                    smart_tags: { $in: [/멀티플레이/i, /협동/i, /PvP/i] }
                }).sort({ trend_score: -1 }).limit(10).lean()
            ]);

            res.status(200).json({
                success: true,
                data: {
                    comprehensive,
                    costEffective: costEffective.map(g => ({ ...g, reason: g.price_info?.discount_percent >= 50 ? `${g.price_info.discount_percent}% 할인 중인 게임` : '저렴하게 즐길 수 있는 게임' })),
                    trend: trend.map(g => ({ ...g, reason: '지금 가장 주목받는 게임' })),
                    hiddenGem: hiddenGem.map(g => ({ ...g, reason: `${g.steam_reviews?.overall?.percent}% 긍정 평가의 숨겨진 명작` })),
                    multiplayer: multiplayer.map(g => ({ ...g, reason: '함께 즐기기 좋은 게임' }))
                },
                validTags: PERSONAL_TAG_POOL
            });

        } catch (error) {
            console.error('개인화 추천 에러:', error);
            res.status(500).json({ success: false, message: '서버 에러' });
        }
    }
}

module.exports = new RecommendController();