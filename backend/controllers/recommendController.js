const Game = require('../models/Game');
const User = require('../models/User');
const { calculateSimilarity, gameToVector, userToVector } = require('../utils/vector');

const TAG_SYNONYMS = {
    '장르': ['RPG', 'FPS', '시뮬레이션', '전략', '스포츠', '레이싱', '퍼즐', '생존', '공포', '리듬', '액션', '어드벤처'],
    'RPG': ['rpg', 'role-playing', 'jrpg', 'action rpg', 'arpg'],
    'FPS': ['fps', 'shooter', 'first-person shooter'],
    '시뮬레이션': ['simulation', 'sim', 'life sim', 'farming sim', 'building'],
    '전략': ['strategy', 'rts', 'turn-based strategy', 'grand strategy', 'tactical'],
    '스포츠': ['sports', 'football', 'basketball', 'golf'],
    '레이싱': ['racing', 'driving'],
    '퍼즐': ['puzzle', 'logic'],
    '생존': ['survival', 'survival horror'],
    '공포': ['horror', 'psychological horror'],
    '리듬': ['rhythm', 'music'],
    '액션': ['action', 'hack and slash', 'beat em up'],
    '어드벤처': ['adventure', 'point & click', 'exploration'],
    
    '1인칭': ['first-person', 'first person', 'fps'],
    '3인칭': ['third-person', 'third person'],
    '쿼터뷰': ['isometric', 'top-down', 'top down'],
    '횡스크롤': ['side scroller', 'platformer', '2d platformer', 'side-scroller'],
    
    '픽셀 그래픽': ['pixel graphics', 'pixel', 'retro'],
    '2D': ['2d', '2.5d'],
    '3D': ['3d'],
    '만화 같은': ['cartoon', 'anime', 'cel-shaded', 'comic book'],
    '현실적': ['realistic', 'photorealistic'],
    '귀여운': ['cute', 'family friendly', 'wholesome'],
    
    '판타지': ['fantasy', 'dark fantasy'],
    '공상과학': ['sci-fi', 'science fiction', 'cyberpunk'],
    '중세': ['medieval'],
    '현대': ['modern'],
    '우주': ['space', 'outer space'],
    '좀비': ['zombie', 'zombies'],
    '사이버펑크': ['cyberpunk'],
    '마법': ['magic', 'spells'],
    '전쟁': ['war', 'military', 'world war ii'],
    '포스트아포칼립스': ['post-apocalyptic', 'post apocalyptic'],
    
    '오픈 월드': ['open world', 'sandbox'],
    '자원관리': ['resource management', 'management', 'base building', 'city builder'],
    '스토리 중심': ['story rich', 'narrative', 'visual novel', 'great soundtrack'],
    '선택의 중요성': ['choices matter', 'multiple endings'],
    '캐릭터 커스터마이즈': ['character customization'],
    '협동 캠페인': ['co-op', 'coop', 'online co-op', 'local co-op'],
    '경쟁/PvP': ['pvp', 'competitive', 'e-sports', 'multiplayer'],
    '멀티플레이': ['multiplayer', 'online pvp', 'mmo', 'co-op', '멀티'],
    '싱글플레이': ['singleplayer', 'single-player', '싱글'],
    '로그라이크': ['roguelike', 'rogue-like', 'roguelite', 'rogue-lite'],
    '소울라이크': ['souls-like', 'soulslike']
};

const PERSONAL_TAG_POOL = Object.keys(TAG_SYNONYMS);

// 정규식 배열을 반환 (빠른 $in 필터링용)
function getExpandedRegexes(uiTag) {
    const pool = TAG_SYNONYMS[uiTag] || [uiTag];
    return pool.map(t => new RegExp(`^${String(t).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')); // 더 정확한 매칭을 위해 ^와 $ 추가 가능하지만 부분일치를 위해 유지
}

class RecommendController {
    
    async getMainPageGames(req, res) {
        try {
            const { userId, tags, sortBy, page = 1, playerType = 'beginner' } = req.body;
            const limit = 20;
            const skip = (page - 1) * limit;

            const query = { isAdult: { $ne: true } };

            // 스팀 라이브러리 격리 유지
            if (userId) {
                const user = await User.findById(userId).select('steamGames');
                if (user && user.steamGames && user.steamGames.length > 0) {
                    const ownedAppIds = user.steamGames.map(g => g.appid);
                    query.steam_appid = { $nin: ownedAppIds };
                }
            }

            // ★ 진짜 해결책: 사용자가 선택한 태그 개수만큼 AND(교집합) 쿼리를 돌리되, 내부는 $in으로 깔끔하게 처리
            if (tags && tags.length > 0) {
                query.$and = query.$and || [];
                tags.forEach(tag => {
                    const pool = TAG_SYNONYMS[tag] || [tag];
                    // 동의어 중 하나라도 포함되어 있는지 부분 일치(Regex) 배열 생성
                    const regexArray = pool.map(t => new RegExp(String(t).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
                    
                    query.$and.push({
                        $or: [
                            { smart_tags: { $in: regexArray } },
                            { tags: { $in: regexArray } }
                        ]
                    });
                });
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
                games: games, 
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
                const keyword = String(term).trim();
                candidateQuery.$or = [
                    { title: { $regex: keyword, $options: 'i' } },
                    { title_ko: { $regex: keyword, $options: 'i' } }
                ];
            }

            // 맞춤 추천 페이지용 동일 교집합 로직 적용
            if (userSelectedTags.length > 0) {
                candidateQuery.$and = candidateQuery.$and || [];
                userSelectedTags.forEach(tag => {
                    const pool = TAG_SYNONYMS[tag] || [tag];
                    const regexArray = pool.map(t => new RegExp(String(t).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
                    
                    candidateQuery.$and.push({
                        $or: [
                            { smart_tags: { $in: regexArray } },
                            { tags: { $in: regexArray } }
                        ]
                    });
                });
            }

            let candidateGames = await Game.find(candidateQuery).limit(500).lean();
            
            if (candidateGames.length === 0) {
                return res.json({ success: true, data: { comprehensive: [], costEffective: [], trend: [], hiddenGem: [], multiplayer: [] }, validTags: PERSONAL_TAG_POOL });
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
                    if (gTags.some(t => ['멀티', 'multiplayer', 'co-op'].some(h => String(t).toLowerCase().includes(h)))) finalScore *= 1.3;
                }
                
                return { ...game, finalScore, reason: "취향 저격 추천" };
            });

            personalizedComprehensive.sort((a, b) => b.finalScore - a.finalScore);
            personalizedComprehensive = personalizedComprehensive.slice(0, 20);

            const [costEffective, trend, hiddenGem, multiplayer] = await Promise.all([
                Game.find({ ...candidateQuery, $or: [{ "price_info.discount_percent": { $gte: 50 } }, { "price_info.current_price": { $lte: 10000, $gt: 0 } }] }).sort({ "price_info.discount_percent": -1 }).limit(10).lean(),
                Game.find({ ...candidateQuery, steam_ccu: { $gt: 0 } }).sort({ steam_ccu: -1 }).limit(10).lean(),
                Game.find({ ...candidateQuery }).sort({ "steam_reviews.overall.percent": -1 }).limit(10).lean(),
                Game.find({ ...candidateQuery, $or: [{ smart_tags: { $in: [/멀티/, /협동/, /Multiplayer/, /Co-op/i] } }, { tags: { $in: [/멀티/, /협동/, /Multiplayer/, /Co-op/i] } }] }).limit(10).lean()
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