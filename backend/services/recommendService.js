// backend/services/recommendService.js
const mongoose = require("mongoose");
const Game = require("../models/Game");
const User = require("../models/User");
const vector = require("../utils/vector");

class RecommendService {
  async getPersonalRecommendations({ userId, tags, term }) {
    let userVec = {};
    let ownedAppIds = [];
    let hasPersonalData = false;

    // 1. 태그 기반 벡터 생성
    if (tags && Array.isArray(tags) && tags.length > 0) {
      tags.forEach((tag) => {
        userVec[tag] = (userVec[tag] || 0) + 5;
      });
      hasPersonalData = true;
    }

    // 2. 사용자 스팀 기록 기반 보정
    if (userId && mongoose.isValidObjectId(userId)) {
      const user = await User.findById(userId).lean();
      if (user && Array.isArray(user.steamGames)) {
        const mySteamMap = {};
        user.steamGames.forEach((g) => {
          if (g.appid) {
            ownedAppIds.push(g.appid);
            mySteamMap[g.appid] = g.playtime_forever || 0;
          }
        });

        const myRichGames = await Game.find({ steam_appid: { $in: ownedAppIds } })
          .select("steam_appid smart_tags")
          .lean();

        myRichGames.forEach((game) => {
          const playtime = mySteamMap[game.steam_appid] || 0;
          // 플레이 타임 편차 보정
          const timeWeight = Math.log10(playtime + 1);

          if (game.smart_tags) {
            game.smart_tags.forEach((tag) => {
              userVec[tag] = (userVec[tag] || 0) + timeWeight;
            });
          }
        });
        if (myRichGames.length > 0) hasPersonalData = true;
      }
    }

    // 3. 검색어 쿼리 빌드
    let query = { isAdult: { $ne: true } };
    if (term) {
      const regex = new RegExp(term, "i");
      query.$or = [{ title: regex }, { title_ko: regex }];
    }

    // 4. 데이터 없을 경우 트렌드 상위 게임 반환 (콜드 스타트 방지)
    if (!hasPersonalData && !term) {
      const trendGames = await Game.find({ trend_score: { $ne: null }, isAdult: { $ne: true } })
        .sort({ trend_score: -1 })
        .limit(20)
        .lean();
      return trendGames.map((g) => ({ ...g, score: 95 }));
    }

    // 5. 후보군 검색
    const games = await Game.find(query)
      .select("slug title title_ko smart_tags main_image price_info metacritic_score trend_score steam_appid play_time")
      .lean();

    // 6. 개인화 알고리즘 점수 계산
    const recoList = games
      .filter((g) => !ownedAppIds.includes(g.steam_appid))
      .map((g) => {
        const gameVec = vector.gameToVector(g.smart_tags);
        
        // A. 유사도 (Similarity)
        let similarity = vector.calculateSimilarity(userVec, gameVec) || 0;
        if (g.smart_tags && g.smart_tags.length > 20) similarity *= 0.9; // 태그 난사 어뷰징 페널티

        // B. 트렌드 (Trend)
        const trendVal = g.trend_score || 0;
        const trendScore = trendVal > 0 ? Math.log10(trendVal + 5) : 0;
        
        // C. 퀄리티 (Quality - 스팀 평가 기준을 메타스코어로 대체 적용)
        const qualityScore = (g.metacritic_score || 0) / 100;

        // D. 가격 가산점 (Price Bonus)
        let priceBonus = 0;
        if (g.price_info) {
            if (g.price_info.isFree) priceBonus = 0.05;
            else if (g.price_info.discount_percent > 0) priceBonus = 0.05;
        }

        // 최종 점수 산출식 (Similarity 0.5 + Trend 0.3 + Quality 0.2 + Bonus)
        const score = (similarity * 0.5) + (trendScore * 0.3) + (qualityScore * 0.2) + priceBonus;

        return { ...g, score: Math.round(score * 100) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    return recoList;
  }
}

module.exports = new RecommendService();