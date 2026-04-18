const Game = require('../models/Game');
const User = require('../models/User');

// 유틸리티 함수 임포트
const { getQueryTags } = require('../utils/tagMapper');
const { calculateSimilarity, gameToVector, userToVector } = require('../utils/vector');

class RecommendController {
  async getPersonalRecommendations(req, res) {
    try {
      const { userId, tags, term } = req.body;
      let personalizedComprehensive = [];
      let userLikedTags = Array.isArray(tags) ? tags : [];
      let userSteamGames = [];

      if (userId) {
        const user = await User.findById(userId);
        if (user) {
          if (user.likedTags) {
            userLikedTags = [...new Set([...userLikedTags, ...user.likedTags])];
          }
          if (user.steamGames) {
            userSteamGames = user.steamGames;
          }
        }
      }

      const userVec = userToVector(userLikedTags, userSteamGames);
      const hasUserContext = Object.keys(userVec).length > 0;

      // 1-A. 유저 컨텍스트 존재 시 맞춤 추천 로직
      if (hasUserContext) {
        const candidateGames = await Game.find({
          "steam_reviews.overall.total": { $gte: 1000 },
          "steam_reviews.overall.percent": { $gte: 70 }
        }).limit(100).lean();

        const scoredGames = candidateGames.map(game => {
          const gameVec = gameToVector(game.smart_tags || []);
          const score = calculateSimilarity(userVec, gameVec);
          return { ...game, similarityScore: score };
        });

        scoredGames.sort((a, b) => b.similarityScore - a.similarityScore);
        personalizedComprehensive = scoredGames.slice(0, 10);
      }

      // 2. 데이터베이스 파이프라인 병렬 조회 (기존 5분류 로직 보존)
      let [
        defaultComprehensive,
        costEffective,
        trend,
        hiddenGem,
        multiplayer
      ] = await Promise.all([
        personalizedComprehensive.length === 0 ? 
          Game.find({ 
            "steam_reviews.overall.percent": { $gte: 90 }, 
            "steam_reviews.overall.total": { $gte: 5000 } 
          }).sort({ "steam_reviews.overall.total": -1 }).limit(10).lean() 
          : Promise.resolve([]),

        Game.find({ 
          $or: [
            { "price_info.discount_percent": { $gte: 50 } }, 
            { "price_info.current_price": { $lte: 10000, $gt: 0 } }
          ],
          "steam_reviews.overall.percent": { $gte: 80 }
        }).sort({ "price_info.discount_percent": -1, "steam_reviews.overall.total": -1 }).limit(10).lean(),

        Game.find({ steam_ccu: { $gt: 0 } })
          .sort({ steam_ccu: -1, twitch_viewers: -1 }).limit(10).lean(),

        Game.find({ 
          "steam_reviews.overall.total": { $lt: 1000, $gt: 50 }, 
          "steam_reviews.overall.percent": { $gte: 90 } 
        }).sort({ "steam_reviews.overall.percent": -1 }).limit(10).lean(),

        Game.find({ 
          smart_tags: { $in: getQueryTags('멀티플레이').concat(getQueryTags('협동 캠페인')) } 
        }).sort({ steam_ccu: -1 }).limit(10).lean()
      ]);

      const comprehensive = personalizedComprehensive.length > 0 ? personalizedComprehensive : defaultComprehensive;

      // ★ 추가: 각 분류별로 추천 이유(reason)를 생성하여 맵핑
      const topPlayed = [...userSteamGames].sort((a, b) => b.playtime_forever - a.playtime_forever).slice(0, 5);

      const addReason = (game, defaultReason) => {
        let reason = defaultReason;
        if (topPlayed.length > 0 && game.smart_tags) {
           const match = topPlayed.find(tp => tp.smart_tags?.some(tag => game.smart_tags.includes(tag)));
           if (match) reason = `스팀에서 즐기셨던 '${match.name}'와(과) 비슷한 장르입니다.`;
        } else if (userLikedTags.length > 0 && game.smart_tags) {
           const commonTag = userLikedTags.find(t => game.smart_tags.includes(t));
           if (commonTag) reason = `회원님의 관심 태그 #${commonTag} 분야의 게임입니다.`;
        }
        return { ...game, reason };
      };

      // 3. 최종 데이터 조립
      return res.status(200).json({
        success: true,
        data: {
          comprehensive: comprehensive.map(g => addReason(g, "회원님의 게임 취향과 높은 유사도를 보이는 추천작입니다.")),
          costEffective: costEffective.map(g => addReason(g, "현재 높은 할인율 또는 압도적인 가성비를 자랑하는 명작입니다.")),
          trend: trend.map(g => addReason(g, "현재 전 세계 게이머들이 가장 많이 플레이하고 있는 대세 게임입니다.")),
          hiddenGem: hiddenGem.map(g => addReason(g, "아는 사람만 아는, 평가가 극도로 좋은 숨겨진 명작입니다.")),
          multiplayer: multiplayer.map(g => addReason(g, "친구들이나 다른 게이머들과 함께 즐기기 좋은 게임입니다."))
        }
      });

    } catch (error) {
      console.error("❌ [RecommendController] 데이터 파이프라인 처리 중 에러 발생:", error);
      return res.status(500).json({ error: "Server Error", message: error.message });
    }
  }
}

module.exports = new RecommendController();