const Game = require('../models/Game');
const User = require('../models/User');

const { getQueryTags } = require('../utils/tagMapper');
const { calculateSimilarity, gameToVector, userToVector } = require('../utils/vector');

class RecommendController {
  async getPersonalRecommendations(req, res) {
    try {
      const { userId, tags, term } = req.body;
      let personalizedComprehensive = [];
      
      let userSelectedTags = Array.isArray(tags) ? tags : [];
      let userLikedTagsFromDB = [];
      let userSteamGames = [];
      let userType = '초심자'; // 기본 숙련도

      // 1. 유저 데이터 및 숙련도 파악
      if (userId) {
        const user = await User.findById(userId);
        if (user) {
          if (user.likedTags) userLikedTagsFromDB = user.likedTags;
          if (user.steamGames) userSteamGames = user.steamGames;
          if (user.playerType) userType = user.playerType; // DB에서 숙련도 로드
        }
      }

      // 화면 선택 태그와 DB 관심 태그 병합
      const combinedTags = [...new Set([...userSelectedTags, ...userLikedTagsFromDB])];

      // 2. 100점 만점 다이내믹 가중치(N분할) 알고리즘
      const hasTags = combinedTags.length > 0;
      const hasSteam = userSteamGames.length > 0;

      // 평가(Review)와 트렌드(Trend)는 무조건 기본 포함이므로 최소 2개 요소 활성화
      let activeFactors = 2; 
      if (hasTags) activeFactors += 1;
      if (hasSteam) activeFactors += 1;

      // 100점을 활성화된 조건 개수로 공평하게 나눔 (ex: 4개면 25점씩, 3개면 33.3점씩)
      const weightPerFactor = 100 / activeFactors; 

      // 3. 종합 추천(Comprehensive) 후보군 추출
      const candidateGames = await Game.find({
        "steam_reviews.overall.total": { $gte: 500 },
        isAdult: { $ne: true }
      }).limit(200).lean();

      // 후보군 내 트렌드 점수 최댓값 (상대평가 100점 기준용)
      const maxTrendScore = Math.max(...candidateGames.map(g => g.trend_score || (g.steam_ccu || 0)), 1);

      // 코사인 유사도를 위한 벡터 사전 계산
      const userTagVec = hasTags ? userToVector(combinedTags, []) : {};
      const userSteamVec = hasSteam ? userToVector([], userSteamGames) : {};

      // 4. 각 게임별 100점 만점 채점 진행 및 숙련도 보정
      const scoredGames = candidateGames.map(game => {
        // ★ 태그 누락 방어: smart_tags가 없으면 원본 tags를 가져와 연산
        const gameTags = (game.smart_tags && game.smart_tags.length > 0) ? game.smart_tags : (game.tags || []);
        const gameVec = gameToVector(gameTags);

        // 요소별 점수 산출 (모두 0~100점 스케일)
        const reviewScore = game.steam_reviews?.overall?.percent || 0;
        const trendScore = ((game.trend_score || game.steam_ccu || 0) / maxTrendScore) * 100;
        const tagScore = hasTags ? calculateSimilarity(userTagVec, gameVec) * 100 : 0;
        const steamScore = hasSteam ? calculateSimilarity(userSteamVec, gameVec) * 100 : 0;

        // 동적 가중치를 곱하여 최종 점수 합산
        let finalScore = (reviewScore * (weightPerFactor / 100)) + 
                         (trendScore * (weightPerFactor / 100));
        
        if (hasTags) finalScore += (tagScore * (weightPerFactor / 100));
        if (hasSteam) finalScore += (steamScore * (weightPerFactor / 100));

        // ★ 숙련도(playerType)에 따른 점수 밸런스 패치
        if (userType === '초심자') {
          // 초심자에게 소울라이크나 하드코어는 점수 30% 차감 (추천 순위 하락)
          if (gameTags.some(t => ['소울라이크', '하드코어', '어려움'].includes(t))) {
            finalScore *= 0.7; 
          }
        } else if (userType === '심화') {
          // 숙련자에게는 복잡하고 심화된 게임 점수 20% 상승 (우선 추천)
          if (gameTags.some(t => ['복잡한', '전략적', '심화'].includes(t))) {
            finalScore *= 1.2;
          }
        }

        return { ...game, finalScore };
      });

      scoredGames.sort((a, b) => b.finalScore - a.finalScore);
      personalizedComprehensive = scoredGames.slice(0, 10);

      // 5. 나머지 카테고리 병렬 조회 (태그 누락 방어를 위해 $in으로 변경)
      const [
        costEffective,
        trend,
        hiddenGem,
        multiplayer
      ] = await Promise.all([
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

      // 6. 추천 이유(Reason) 텍스트 주입 로직
      const topPlayed = [...userSteamGames].sort((a, b) => b.playtime_forever - a.playtime_forever).slice(0, 5);

      const addReason = (game, defaultReason) => {
        let reason = defaultReason;
        const gTags = (game.smart_tags && game.smart_tags.length > 0) ? game.smart_tags : (game.tags || []);

        if (topPlayed.length > 0 && gTags.length > 0) {
           const match = topPlayed.find(tp => {
               const tpTags = (tp.smart_tags && tp.smart_tags.length > 0) ? tp.smart_tags : (tp.tags || []);
               return tpTags.some(tag => gTags.includes(tag));
           });
           if (match) reason = `🎮 스팀에서 많이 즐기신 '${match.name}'와(과) 비슷한 장르입니다.`;
        } else if (combinedTags.length > 0 && gTags.length > 0) {
           const commonTag = combinedTags.find(t => gTags.includes(t));
           if (commonTag) reason = `🏷️ 회원님의 관심 태그 #${commonTag} 기반 추천작입니다.`;
        }
        
        // 숙련도에 따른 이유 덮어쓰기
        if (userType === '초심자' && !gTags.some(t => ['어려움', '하드코어'].includes(t))) {
          reason = `🌱 입문자가 즐기기에 부담 없는 난이도의 추천작입니다.`;
        }

        return { ...game, reason };
      };

      // 7. 결과 반환
      return res.status(200).json({
        success: true,
        data: {
          comprehensive: personalizedComprehensive.map(g => addReason(g, "회원님의 데이터를 100점 만점으로 환산한 종합 분석 1위입니다.")),
          costEffective: costEffective.map(g => addReason(g, "현재 높은 할인율을 자랑하는 가성비 추천작입니다.")),
          trend: trend.map(g => addReason(g, "현재 전 세계 게이머들이 가장 많이 즐기고 있는 대세 게임입니다.")),
          hiddenGem: hiddenGem.map(g => addReason(g, "압도적인 긍정 평가를 받은 숨겨진 명작입니다.")),
          multiplayer: multiplayer.map(g => addReason(g, "친구들이나 다른 유저와 멀티플레이로 즐기기 좋은 게임입니다."))
        }
      });

    } catch (error) {
      console.error("❌ [RecommendController] 데이터 파이프라인 처리 중 에러 발생:", error);
      return res.status(500).json({ error: "Server Error", message: error.message });
    }
  }
}

module.exports = new RecommendController();