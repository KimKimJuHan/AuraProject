const Game = require('../models/Game');
const User = require('../models/User');
const { getQueryTags } = require('../utils/tagMapper');
const { calculateSimilarity, gameToVector, userToVector } = require('../utils/vector');

class RecommendController {
  async getPersonalRecommendations(req, res) {
    try {
      const { userId, tags } = req.body;
      let userLikedTagsFromDB = [];
      let userSteamGames = [];
      let userType = '초심자'; 

      // 1. 유저 정보 및 숙련도 파악
      if (userId) {
        const user = await User.findById(userId);
        if (user) {
          userLikedTagsFromDB = user.likedTags || [];
          userSteamGames = user.steamGames || [];
          userType = user.playerType || '초심자'; // DB에서 유저 숙련도 로드
        }
      }

      // 화면에서 누른 태그와 DB의 태그 병합
      const combinedTags = [...new Set([...(tags || []), ...userLikedTagsFromDB])];
      const hasTags = combinedTags.length > 0;
      const hasSteam = userSteamGames.length > 0;

      // 2. 100점 만점 다이내믹 가중치 계산 (N분할 로직 복구)
      let activeFactors = 2; // 평가(review), 트렌드(trend)는 항상 기본 반영
      if (hasTags) activeFactors += 1;
      if (hasSteam) activeFactors += 1;
      const weightPerFactor = 100 / activeFactors;

      // 3. 후보 게임군 추출
      const candidateGames = await Game.find({
        "steam_reviews.overall.total": { $gte: 500 },
        isAdult: { $ne: true }
      }).limit(150).lean();

      // 트렌드 점수 상대평가를 위한 최댓값 추출
      const maxTrend = Math.max(...candidateGames.map(g => g.trend_score || (g.steam_ccu || 0)), 1);
      const userTagVec = hasTags ? userToVector(combinedTags, []) : {};
      const userSteamVec = hasSteam ? userToVector([], userSteamGames) : {};

      // 4. 채점, 태그 증발 방어, 숙련도 보정
      const scoredGames = candidateGames.map(game => {
        // ★ 태그 증발 방어 복구: smart_tags가 비어있으면 원본 tags라도 끌어다 씀
        const gameTags = (game.smart_tags && game.smart_tags.length > 0) ? game.smart_tags : (game.tags || []);
        const gameVec = gameToVector(gameTags);

        // 항목별 점수 변환 (모두 0~100점 스케일)
        const reviewScore = game.steam_reviews?.overall?.percent || 0;
        const trendScore = ((game.trend_score || game.steam_ccu || 0) / maxTrend) * 100;
        const tagScore = hasTags ? calculateSimilarity(userTagVec, gameVec) * 100 : 0;
        const steamScore = hasSteam ? calculateSimilarity(userSteamVec, gameVec) * 100 : 0;

        // ★ 100점 분할 계산식 적용
        let finalScore = (reviewScore * (weightPerFactor / 100)) + (trendScore * (weightPerFactor / 100));
        if (hasTags) finalScore += (tagScore * (weightPerFactor / 100));
        if (hasSteam) finalScore += (steamScore * (weightPerFactor / 100));

        // ★ 유저 숙련도(playerType)에 따른 최종 보정 복구
        if (userType === '초심자') {
          // 초심자에게 소울라이크나 하드코어는 점수 30% 차감
          if (gameTags.some(t => ['소울라이크', '하드코어', '어려움'].includes(t))) {
            finalScore *= 0.7; 
          }
        } else if (userType === '심화') {
          // 숙련자에게는 복잡하고 심화된 게임 점수 20% 뻥튀기
          if (gameTags.some(t => ['복잡한', '전략적', '심화'].includes(t))) {
            finalScore *= 1.2;
          }
        }

        return { ...game, finalScore };
      });

      scoredGames.sort((a, b) => b.finalScore - a.finalScore);
      const comprehensive = scoredGames.slice(0, 10);

      // 5. 추천 이유 생성 (스마트 태그 누락 방어 로직 포함)
      const topPlayed = [...userSteamGames].sort((a, b) => b.playtime_forever - a.playtime_forever).slice(0, 5);
      
      const addReason = (game, defaultReason) => {
        let reason = defaultReason;
        const gTags = (game.smart_tags && game.smart_tags.length > 0) ? game.smart_tags : (game.tags || []);
        
        if (topPlayed.length > 0 && gTags.length > 0) {
           const match = topPlayed.find(tp => {
               const tpTags = (tp.smart_tags && tp.smart_tags.length > 0) ? tp.smart_tags : (tp.tags || []);
               return tpTags.some(tag => gTags.includes(tag));
           });
           if (match) reason = `🎮 스팀에서 많이 플레이하신 '${match.name}'와(과) 비슷한 장르입니다.`;
        } else if (combinedTags.length > 0 && gTags.length > 0) {
           const common = combinedTags.find(t => gTags.includes(t));
           if (common) reason = `🏷️ 회원님의 관심 태그 #${common} 기반 추천작입니다.`;
        }
        
        // 숙련도 관련 이유 덮어쓰기
        if (userType === '초심자' && !gTags.some(t => ['어려움', '하드코어'].includes(t))) {
          reason = `🌱 입문자가 즐기기에 부담 없는 난이도의 추천작입니다.`;
        }

        return { ...game, reason };
      };

      // 6. 나머지 파이프라인 병렬 조회
      const [costEffective, trendList, hiddenGem, multiplayer] = await Promise.all([
        Game.find({ 
            $or: [
              { "price_info.discount_percent": { $gte: 50 } }, 
              { "price_info.current_price": { $lte: 10000, $gt: 0 } }
            ],
            "steam_reviews.overall.percent": { $gte: 80 },
            isAdult: { $ne: true }
        }).sort({ "price_info.discount_percent": -1 }).limit(10).lean(),

        Game.find({ steam_ccu: { $gt: 0 }, isAdult: { $ne: true } })
          .sort({ steam_ccu: -1 }).limit(10).lean(),
          
        Game.find({ 
            "steam_reviews.overall.total": { $lt: 1000, $gt: 50 }, 
            "steam_reviews.overall.percent": { $gte: 90 },
            isAdult: { $ne: true }
        }).sort({ "steam_reviews.overall.percent": -1 }).limit(10).lean(),
        
        Game.find({ 
            $or: [
              { smart_tags: { $in: getQueryTags('멀티플레이').concat(getQueryTags('협동 캠페인')) } },
              { tags: { $in: ['Multiplayer', 'Co-op', '멀티플레이', '협동'] } }
            ],
            isAdult: { $ne: true }
        }).sort({ steam_ccu: -1 }).limit(10).lean()
      ]);

      // 7. 최종 응답 반환
      return res.status(200).json({
        success: true,
        data: {
          comprehensive: comprehensive.map(g => addReason(g, "회원님의 데이터(평가, 트렌드, 취향)를 100점 만점으로 환산한 종합 분석 1위입니다.")),
          costEffective: costEffective.map(g => addReason(g, "현재 높은 할인율을 자랑하는 가성비 추천작입니다.")),
          trend: trendList.map(g => addReason(g, "현재 전 세계 게이머들이 가장 많이 즐기고 있는 대세 게임입니다.")),
          hiddenGem: hiddenGem.map(g => addReason(g, "아는 사람만 아는 압도적인 긍정 평가의 숨겨진 명작입니다.")),
          multiplayer: multiplayer.map(g => addReason(g, "친구들이나 다른 유저와 멀티플레이로 즐기기 좋은 게임입니다."))
        }
      });

    } catch (error) {
      console.error("Recommend Error:", error);
      return res.status(500).json({ error: "Server Error" });
    }
  }
}

module.exports = new RecommendController();