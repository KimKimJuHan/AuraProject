// backend/routes/recommend.js
const express = require("express");
const router = express.Router();
const Game = require("../models/Game");
const User = require("../models/User");
const vector = require("../utils/vector"); // vector.js
const { gameToVector, calculateSimilarity } = vector;

/**
 * 📌 벡터 기반 개인화 추천 API
 * 요청 위치: POST /api/advanced/personal
 * 사용처: 프론트 PersonalRecoPage.js
 *
 * 결합 요소:
 * - 사용자 선택 태그 (가중치 ↑)
 * - 사용자 스팀 플레이타임 기반 벡터 (가중치 ↓)
 * - 게임 트렌드 점수
 * - 메타크리틱/가격 약간 반영
 * - 제목 검색(term)
 */

router.post("/personal", async (req, res) => {
    try {
        const { userId, steamId, tags, term } = req.body;

        // -------------------------------
        // 1) 사용자 기반 벡터 생성
        // -------------------------------

        let userVec = {};

        // A. 태그 기반 벡터 (가중치 높음)
        if (tags && tags.length > 0) {
            tags.forEach(tag => {
                userVec[tag] = (userVec[tag] || 0) + 3; // 태그는 높은 가중치
            });
        }

        // B. 스팀 플레이 기록 벡터 (가중치 낮음)
        let ownedAppIds = [];
        if (userId) {
            const user = await User.findById(userId).lean();
            if (user && user.steamGames) {
                ownedAppIds = user.steamGames.map(g => g.appid);

                user.steamGames.forEach(g => {
                    const tag = g.genre || "unknown";
                    userVec[tag] = (userVec[tag] || 0) + (g.playtime_forever / 300); 
                    // 스팀 플레이타임 → 약한 영향력
                });
            }
        }

        // -------------------------------
        // 2) 게임 목록 불러오기 (검색어 적용)
        // -------------------------------
        
        let query = {};
        if (term) {
            const regex = new RegExp(term, "i");
            query = {
                $or: [
                    { title: regex },
                    { title_ko: regex }
                ]
            };
        }

        const games = await Game.find(query)
            .select("slug title title_ko smart_tags main_image price_info metacritic_score trend_score steam_appid")
            .lean();

        if (!games.length) {
            return res.json({ games: [] });
        }

        // -------------------------------
        // 3) 추천 점수 계산
        // -------------------------------

        const recoList = games
            .filter(g => !ownedAppIds.includes(g.steam_appid)) // 내가 가진 게임 제외
            .map(g => {
                const gameVec = gameToVector(g.smart_tags);
                const similarity = calculateSimilarity(userVec, gameVec) || 0;

                const trendVal = g.trend_score || 0;
                const metaScore = g.metacritic_score || 0;

                let priceBonus = 0;
                if (g.price_info) {
                    if (g.price_info.isFree) priceBonus += 0.1;
                    if (g.price_info.discount_percent > 0) priceBonus += 0.1;
                }

                const score =
                    similarity * 0.6 +
                    (trendVal > 0 ? Math.log10(trendVal + 5) * 0.2 : 0) +
                    (metaScore / 100) * 0.15 +
                    priceBonus;

                return {
                    ...g,
                    score: Math.round(score * 100)
                };
            })
            .sort((a, b) => b.score - a.score) // 높은 점수 우선
            .slice(0, 20);

        res.json({ games: recoList });

    } catch (e) {
        console.error("🔥 추천 시스템 오류:", e);
        res.status(500).json({ error: "추천 처리 중 오류 발생" });
    }
});

module.exports = router;
