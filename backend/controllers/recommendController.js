const Game = require('../models/Game');
const User = require('../models/User');

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

      const [
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

      // ★ 추가: 유저의 스팀 기록과 태그를 기반으로 "추천 이유(Reason)"를 생성하여 주입
      const topPlayed = [...userSteamGames].sort((a, b) => b.playtime_forever - a.playtime_forever).slice(0, 5);

      const addReason = (game, defaultReason) => {
        let reason = defaultReason;
        if (topPlayed.length > 0 && game.smart_tags) {
           const match = topPlayed.find(tp => tp.smart_tags?.some(tag => game.smart_tags.includes(tag)));
           if (match) reason = `🎮 스팀에서 즐기신 '${match.name}'와(과) 비슷한 장르입니다.`;
        } else if (userLikedTags.length > 0 && game.smart_tags) {
           const commonTag = userLikedTags.find(t => game.smart_tags.includes(t));
           if (commonTag) reason = `🏷️ 관심 태그 #${commonTag} 분야의 게임입니다.`;
        }
        return { ...game, reason };
      };

      return res.status(200).json({
        success: true,
        data: {
          comprehensive: comprehensive.map(g => addReason(g, "회원님의 게임 취향과 일치하는 맞춤형 추천작입니다.")),
          costEffective: costEffective.map(g => addReason(g, "현재 높은 할인율을 자랑하는 가성비 훌륭한 게임입니다.")),
          trend: trend.map(g => addReason(g, "현재 전 세계 게이머들이 가장 많이 즐기고 있는 대세 게임입니다.")),
          hiddenGem: hiddenGem.map(g => addReason(g, "압도적인 긍정 평가를 받은 숨겨진 명작입니다.")),
          multiplayer: multiplayer.map(g => addReason(g, "지인들과 멀티플레이로 즐기기 좋은 게임입니다."))
        }
      });

    } catch (error) {
      console.error("❌ [RecommendController] 데이터 파이프라인 처리 중 에러 발생:", error);
      return res.status(500).json({ error: "Server Error", message: error.message });
    }
  }
}

module.exports = new RecommendController();