const Game = require('../models/Game');
const User = require('../models/User');

// 유틸리티 함수 임포트 (파일 구조 팩트 반영)
const { getQueryTags } = require('../utils/tagMapper');
const { calculateSimilarity, gameToVector, userToVector } = require('../utils/vector');

class RecommendController {
  async getPersonalRecommendations(req, res) {
    try {
      // POST 요청의 body에서 데이터 추출 (기존 규격 복구)
      const { userId, tags, term } = req.body;
      let personalizedComprehensive = [];
      
      // 1. 유저 데이터 추출 및 벡터 생성
      // req.body로 들어온 tags가 있다면 우선 반영
      let userLikedTags = Array.isArray(tags) ? tags : [];
      let userSteamGames = [];

      if (userId) {
        const user = await User.findById(userId);
        if (user) {
          // DB에 저장된 취향 태그가 있다면 body 데이터와 병합
          if (user.likedTags) {
            userLikedTags = [...new Set([...userLikedTags, ...user.likedTags])];
          }
          if (user.steamGames) {
            userSteamGames = user.steamGames;
          }
        }
      }

      // 유저 벡터 생성 (가중치 적용됨)
      const userVec = userToVector(userLikedTags, userSteamGames);
      const hasUserContext = Object.keys(userVec).length > 0;

      // 1-A. 유저 컨텍스트가 존재할 때 (맞춤 추천 로직 가동)
      if (hasUserContext) {
        // DB에서 평가가 좋은 게임들을 1차로 대량(100개) 뽑아온 뒤 메모리에서 코사인 유사도 연산
        const candidateGames = await Game.find({
          "steam_reviews.overall.total": { $gte: 1000 },
          "steam_reviews.overall.percent": { $gte: 70 }
        }).limit(100).lean(); // lean()으로 JSON 파싱 속도 최적화

        // 유사도 계산 후 내림차순 정렬
        const scoredGames = candidateGames.map(game => {
          const gameVec = gameToVector(game.smart_tags || []);
          const score = calculateSimilarity(userVec, gameVec);
          return { ...game, similarityScore: score };
        });

        scoredGames.sort((a, b) => b.similarityScore - a.similarityScore);
        
        // 상위 10개를 종합 추천으로 할당
        personalizedComprehensive = scoredGames.slice(0, 10);
      }

      // 2. 데이터베이스 파이프라인 병렬 조회 (맞춤 추천이 실패했거나 데이터가 없을 때의 기본값 포함)
      const [
        defaultComprehensive, // 비로그인/데이터 부족 시 기본 종합 추천 (압도적 긍정)
        costEffective,        // 가성비 추천
        trend,                // 트렌드 추천
        hiddenGem,            // 숨겨진 명작
        multiplayer           // 친구와 함께
      ] = await Promise.all([
        
        // 2-A. 기본 종합 추천 (맞춤 추천 데이터가 없을 때만 사용됨)
        personalizedComprehensive.length === 0 ? 
          Game.find({ 
            "steam_reviews.overall.percent": { $gte: 90 }, 
            "steam_reviews.overall.total": { $gte: 5000 } 
          }).sort({ "steam_reviews.overall.total": -1 }).limit(10) 
          : Promise.resolve([]),

        // 2-B. 가성비 (할인율 50% 이상이거나 10000원 이하 + 긍정 80% 이상)
        Game.find({ 
          $or: [
            { "price_info.discount_percent": { $gte: 50 } }, 
            { "price_info.current_price": { $lte: 10000, $gt: 0 } }
          ],
          "steam_reviews.overall.percent": { $gte: 80 }
        }).sort({ "price_info.discount_percent": -1, "steam_reviews.overall.total": -1 }).limit(10),

        // 2-C. 트렌드 (스팀 동접자 순)
        Game.find({ steam_ccu: { $gt: 0 } })
          .sort({ steam_ccu: -1, twitch_viewers: -1 }).limit(10),

        // 2-D. 숨겨진 명작 (리뷰 50~1000개 사이 중 긍정 90% 이상)
        Game.find({ 
          "steam_reviews.overall.total": { $lt: 1000, $gt: 50 }, 
          "steam_reviews.overall.percent": { $gte: 90 } 
        }).sort({ "steam_reviews.overall.percent": -1 }).limit(10),

        // 2-E. 친구와 함께 (스마트 태그 매칭)
        Game.find({ 
          smart_tags: { $in: getQueryTags('멀티플레이').concat(getQueryTags('협동 캠페인')) } 
        }).sort({ steam_ccu: -1 }).limit(10)
      ]);

      // 3. 최종 데이터 조립 및 응답 반환
      return res.status(200).json({
        success: true,
        data: {
          comprehensive: personalizedComprehensive.length > 0 ? personalizedComprehensive : defaultComprehensive,
          costEffective,
          trend,
          hiddenGem,
          multiplayer
        }
      });

    } catch (error) {
      console.error("❌ [RecommendController] 데이터 파이프라인 처리 중 에러 발생:", error);
      // 기존 에러 반환 규격 유지
      return res.status(500).json({ error: "Server Error", message: error.message });
    }
  }
}

// 라우터가 요구하는 클래스 인스턴스 형태로 정확하게 모듈 내보내기
module.exports = new RecommendController();