const Game = require('../models/Game');
const User = require('../models/User');
const { calculateSimilarity, gameToVector, userToVector } = require('../utils/vector');

// [교정] 태그 검색을 가장 유연하게 만드는 정규식 생성기
function getQueryTagsInternal(tag) {
    const escaped = String(tag).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
    // 시작(^)과 끝($)을 절대 넣지 마십시오. '2D'가 포함만 되어 있으면 다 잡아야 합니다.
    return [new RegExp(escaped, 'i')]; 
}

const PERSONAL_TAG_POOL = [
  'RPG', 'FPS', '시뮬레이션', '전략', '스포츠', '레이싱', '퍼즐', '생존', '공포', '액션', '어드벤처',
  '1인칭', '3인칭', '탑다운', '사이드뷰', '쿼터뷰', '픽셀 그래픽', '2D', '3D', '만화 같은', '현실적', 
  '애니메이션', '귀여운', '판타지', '공상과학', '중세', '현대', '우주', '좀비', '사이버펑크', '마법', 
  '전쟁', '포스트아포칼립스', '오픈 월드', '자원관리', '스토리 중심', '선택의 중요성', 
  '캐릭터 커스터마이즈', '협동 캠페인', '멀티플레이', '싱글플레이', '로그라이크', '소울라이크'
];

function hasMatchedTag(gameTags = [], tag) {
    const regexes = getQueryTagsInternal(tag);
    return gameTags.some(t => regexes.some(regex => regex.test(String(t || ''))));
}

class RecommendController {
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

            // ★ 핵심 수정 1: 기본 쿼리에서 리뷰 수 제한을 대폭 완화 (500 -> 10)
            // 태그를 선택했다는 것은 그 장르를 보고 싶다는 뜻이므로, 인디 게임도 보여줘야 합니다.
            const candidateQuery = { 
                "steam_reviews.overall.total": { $gte: 10 }, 
                isAdult: { $ne: true } 
            };

            if (term && String(term).trim()) {
                const keyword = String(term).trim();
                candidateQuery.$or = [
                    { title: { $regex: keyword, $options: 'i' } },
                    { title_ko: { $regex: keyword, $options: 'i' } }
                ];
            }

            // ★ 핵심 수정 2: 태그 필터링을 '포함' 개념으로 확장
            if (userSelectedTags.length > 0) {
                const tagRegexes = userSelectedTags.flatMap(t => getQueryTagsInternal(t));
                candidateQuery.$and = candidateQuery.$and || [];
                candidateQuery.$and.push({
                    $or: [
                        { smart_tags: { $in: tagRegexes } },
                        { tags: { $in: tagRegexes } }
                    ]
                });
            }

            let candidateGames = await Game.find(candidateQuery).limit(400).lean();
            
            if (candidateGames.length === 0) {
                return res.json({ success: true, data: { comprehensive: [], costEffective: [], trend: [], hiddenGem: [], multiplayer: [] }, validTags: [] });
            }

            const maxTrendScore = Math.max(...candidateGames.map(g => g.trend_score || g.steam_ccu || 0), 1);
            const userTagVec = hasTags ? userToVector(combinedTags, []) : {};
            const userSteamVec = hasSteam ? userToVector([], userSteamGames) : {};
            const topPlayed = [...userSteamGames].sort((a, b) => b.playtime_forever - a.playtime_forever).slice(0, 5);

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
                    if (gTags.some(t => ['소울라이크', '하드코어'].includes(t))) finalScore *= 0.7;
                } else if (userType === 'streamer') {
                    if (gTags.some(t => ['멀티', '트렌드'].includes(t))) finalScore *= 1.3;
                }

                const matchedTag = combinedTags.find(t => hasMatchedTag(gTags, t));
                let reason = matchedTag ? `${matchedTag} 취향 저격 추천` : "유저 평가가 좋아 추천";
                
                return { ...game, finalScore, reason };
            });

            personalizedComprehensive.sort((a, b) => b.finalScore - a.finalScore);
            personalizedComprehensive = personalizedComprehensive.slice(0, 10);

            // 섹션별 쿼리에서도 candidateQuery(태그 필터 포함)를 재사용하여 일관성 유지
            const [costEffective, trend, hiddenGem, multiplayer] = await Promise.all([
                Game.find({ ...candidateQuery, $or: [{ "price_info.discount_percent": { $gte: 50 } }, { "price_info.current_price": { $lte: 10000, $gt: 0 } }], "steam_reviews.overall.percent": { $gte: 80 } }).sort({ "price_info.discount_percent": -1 }).limit(10).lean(),
                Game.find({ ...candidateQuery, steam_ccu: { $gt: 0 } }).sort({ steam_ccu: -1 }).limit(10).lean(),
                Game.find({ ...candidateQuery, "steam_reviews.overall.total": { $lt: 2000, $gt: 10 }, "steam_reviews.overall.percent": { $gte: 90 } }).sort({ "steam_reviews.overall.percent": -1 }).limit(10).lean(),
                Game.find({ ...candidateQuery, $or: [{ smart_tags: { $in: [/멀티/, /협동/, /Multiplayer/, /Co-op/i] } }, { tags: { $in: [/멀티/, /협동/, /Multiplayer/, /Co-op/i] } }] }).sort({ steam_ccu: -1 }).limit(10).lean()
            ]);

            const allFetchedGames = [...personalizedComprehensive, ...costEffective, ...trend, ...hiddenGem, ...multiplayer];
            const validSet = new Set();
            allFetchedGames.forEach(game => {
                const gTags = (game.smart_tags && game.smart_tags.length > 0) ? game.smart_tags : (game.tags || []);
                PERSONAL_TAG_POOL.forEach(tag => {
                    if (hasMatchedTag(gTags, tag)) validSet.add(tag);
                });
            });

            return res.status(200).json({
                success: true,
                data: {
                    comprehensive: personalizedComprehensive,
                    costEffective: costEffective.map(g => ({ ...g, reason: "높은 할인율의 가성비 추천작" })),
                    trend: trend.map(g => ({ ...g, reason: "현재 많은 게이머들이 플레이 중인 핫한 게임" })),
                    hiddenGem: hiddenGem.map(g => ({ ...g, reason: "숨겨진 압도적 긍정 평가 명작" })),
                    multiplayer: multiplayer.map(g => ({ ...g, reason: "친구들과 함께 즐기기 좋은 게임" }))
                },
                validTags: Array.from(validSet)
            });

        } catch (error) {
            console.error("❌ 추천 엔진 에러:", error);
            return res.status(500).json({ success: false, message: "서버 에러" });
        }
    }
}

module.exports = new RecommendController();