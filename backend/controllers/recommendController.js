const Game = require('../models/Game');
const User = require('../models/User');
const { calculateSimilarity, gameToVector, userToVector } = require('../utils/vector');
const { getQueryTags } = require('../utils/tagMapper');

// UI 태그 풀 — MainPage TAG_CATEGORIES와 완전히 동기화
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

/**
 * 태그 배열을 MongoDB $and 쿼리 조건으로 변환
 * smart_tags는 한국어로 저장되므로 tagMapper.getQueryTags()로 한국어 기반 Regex 생성
 */
function buildTagAndQuery(tags) {
    if (!tags || tags.length === 0) return null;

    const andConditions = tags.map(tag => {
        const regexArray = getQueryTags(tag);
        if (!regexArray || regexArray.length === 0) return null;
        return {
            $or: [
                { smart_tags: { $in: regexArray } },
                { tags: { $in: regexArray } }
            ]
        };
    }).filter(Boolean);

    return andConditions.length > 0 ? andConditions : null;
}

class RecommendController {

    async getMainPageGames(req, res) {
        try {
            const { userId, tags, sortBy, page = 1, playerType = 'beginner' } = req.body;
            const limit = 20;
            const skip = (page - 1) * limit;

            const query = { isAdult: { $ne: true } };

            // Steam 보유 게임 배제
            if (userId) {
                const user = await User.findById(userId).select('steamGames');
                if (user && user.steamGames && user.steamGames.length > 0) {
                    const ownedAppIds = user.steamGames.map(g => g.appid);
                    query.steam_appid = { $nin: ownedAppIds };
                }
            }

            // 태그 AND 필터링
            const andConditions = buildTagAndQuery(tags);
            if (andConditions) {
                query.$and = andConditions;
            }

            let sortOption = {};
            if (sortBy === 'popular') sortOption = { "steam_reviews.overall.total": -1, "steam_ccu": -1 };
            else if (sortBy === 'new') sortOption = { releaseDate: -1 };
            else if (sortBy === 'discount') {
                query["price_info.discount_percent"] = { $gt: 0 };
                sortOption = { "price_info.discount_percent": -1 };
            }
            else if (sortBy === 'price') sortOption = { "price_info.current_price": 1 };
            else sortOption = { "steam_ccu": -1 };

            const totalGames = await Game.countDocuments(query);
            const totalPages = Math.ceil(totalGames / limit);

            let games = await Game.find(query)
                .sort(sortOption)
                .skip(skip)
                .limit(limit)
                .lean();

            games = games.map(g => {
                let reason = "조건에 맞는 추천 게임";
                if (sortBy === 'discount') reason = `현재 ${g.price_info?.discount_percent || 0}% 파격 할인 중!`;
                else if (sortBy === 'popular') reason = "현재 많은 유저가 즐기는 인기작";
                else if (sortBy === 'new') reason = "최근 출시된 신작";
                else if (sortBy === 'price') reason = "부담 없이 즐기기 좋은 가격";
                return { ...g, reason };
            });

            res.json({
                success: true,
                games,
                validTags: PERSONAL_TAG_POOL,
                totalPages: totalPages || 1
            });
        } catch (error) {
            console.error("메인 페이지 검색 에러:", error);
            res.status(500).json({ success: false, message: "서버 에러" });
        }
    }

    async getPersonalRecommendations(req, res) {
        try {
            const { userId, tags, term } = req.body;
            const userSelectedTags = Array.isArray(tags) ? tags : [];
            let userLikedTagsFromDB = [];
            let userSteamGames = [];
            let userType = 'beginner';

            if (userId) {
                const user = await User.findById(userId);
                if (user) {
                    userLikedTagsFromDB = user.likedTags || [];
                    userSteamGames = user.steamGames || [];
                    userType = user.playerType || 'beginner';
                }
            }

            const combinedTags = [...new Set([...userSelectedTags, ...userLikedTagsFromDB])];
            const hasTags = combinedTags.length > 0;
            const hasSteam = userSteamGames.length > 0;

            let activeFactors = 2;
            if (hasTags) activeFactors += 1;
            if (hasSteam) activeFactors += 1;
            const weightPerFactor = 100 / activeFactors;

            const candidateQuery = { isAdult: { $ne: true } };

            if (userSteamGames.length > 0) {
                const ownedAppIds = userSteamGames.map(g => g.appid);
                candidateQuery.steam_appid = { $nin: ownedAppIds };
            }

            if (term && String(term).trim()) {
                const keyword = String(term).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                candidateQuery.$or = [
                    { title: { $regex: keyword, $options: 'i' } },
                    { title_ko: { $regex: keyword, $options: 'i' } }
                ];
            }

            if (userSelectedTags.length > 0) {
                const andConditions = buildTagAndQuery(userSelectedTags);
                if (andConditions) {
                    candidateQuery.$and = andConditions;
                }
            }

            let candidateGames = await Game.find(candidateQuery).limit(500).lean();

            if (candidateGames.length === 0) {
                return res.json({
                    success: true,
                    data: { comprehensive: [], costEffective: [], trend: [], hiddenGem: [], multiplayer: [] },
                    validTags: PERSONAL_TAG_POOL
                });
            }

            const maxTrendScore = Math.max(...candidateGames.map(g => g.trend_score || g.steam_ccu || 0), 1);
            const userTagVec = hasTags ? userToVector(combinedTags, []) : {};
            const userSteamVec = hasSteam ? userToVector([], userSteamGames) : {};

            let personalizedComprehensive = candidateGames.map(game => {
                const gTags = (game.smart_tags && game.smart_tags.length > 0) ? game.smart_tags : (game.tags || []);
                const gameVec = gameToVector(gTags);

                const reviewScore = game.steam_reviews?.overall?.percent || 0;
                const trendScore = ((game.trend_score || game.steam_ccu || 0) / maxTrendScore) * 100;
                const tagScore = hasTags ? calculateSimilarity(userTagVec, gameVec) * 100 : 0;
                const steamScore = hasSteam ? calculateSimilarity(userSteamVec, gameVec) * 100 : 0;

                let finalScore = (reviewScore * (weightPerFactor / 100)) +
                    (trendScore * (weightPerFactor / 100)) +
                    (hasTags ? (tagScore * (weightPerFactor / 100)) : 0) +
                    (hasSteam ? (steamScore * (weightPerFactor / 100)) : 0);

                if (userType === 'beginner') {
                    if (gTags.some(t => ['소울라이크', 'souls-like', 'hardcore'].some(h => String(t).toLowerCase().includes(h)))) finalScore *= 0.7;
                } else if (userType === 'streamer') {
                    if (gTags.some(t => ['멀티플레이', '협동 캠페인', 'multiplayer', 'co-op'].some(h => String(t).toLowerCase().includes(h)))) finalScore *= 1.3;
                }

                return { ...game, finalScore, reason: "취향 저격 추천" };
            });

            personalizedComprehensive.sort((a, b) => b.finalScore - a.finalScore);
            personalizedComprehensive = personalizedComprehensive.slice(0, 20);

            // 섹션 쿼리: 태그 AND 조건 제거 (섹션은 태그 무관하게 다양하게)
            const baseSectionQuery = { ...candidateQuery };
            delete baseSectionQuery.$and;

            const [costEffective, trend, hiddenGem, multiplayer] = await Promise.all([
                Game.find({
                    ...baseSectionQuery,
                    $or: [
                        { "price_info.discount_percent": { $gte: 50 } },
                        { "price_info.current_price": { $lte: 10000, $gt: 0 } }
                    ]
                }).sort({ "price_info.discount_percent": -1 }).limit(10).lean(),

                Game.find({ ...baseSectionQuery, steam_ccu: { $gt: 0 } })
                    .sort({ steam_ccu: -1 }).limit(10).lean(),

                Game.find({ ...baseSectionQuery })
                    .sort({ "steam_reviews.overall.percent": -1 }).limit(10).lean(),

                Game.find({
                    ...baseSectionQuery,
                    $or: [
                        { smart_tags: { $in: [/멀티플레이/, /협동 캠페인/, /Multiplayer/i, /Co-op/i] } },
                        { tags: { $in: [/멀티플레이/, /협동 캠페인/, /Multiplayer/i, /Co-op/i] } }
                    ]
                }).limit(10).lean()
            ]);

            res.status(200).json({
                success: true,
                data: {
                    comprehensive: personalizedComprehensive,
                    costEffective: costEffective.map(g => ({ ...g, reason: "높은 할인율의 가성비 추천작" })),
                    trend: trend.map(g => ({ ...g, reason: "현재 많은 게이머들이 플레이 중인 핫한 게임" })),
                    hiddenGem: hiddenGem.map(g => ({ ...g, reason: "숨겨진 압도적 긍정 평가 명작" })),
                    multiplayer: multiplayer.map(g => ({ ...g, reason: "친구들과 함께 즐기기 좋은 게임" }))
                },
                validTags: PERSONAL_TAG_POOL
            });

        } catch (error) {
            console.error("❌ 추천 엔진 에러:", error);
            return res.status(500).json({ success: false, message: "서버 에러" });
        }
    }
}

module.exports = new RecommendController();