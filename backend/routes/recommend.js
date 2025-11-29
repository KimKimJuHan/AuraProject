// backend/routes/recommend.js

const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Game = require("../models/Game");
const User = require("../models/User");
const vector = require("../utils/vector"); // ★ [수정] vector 전체를 가져옴

/**
 * 📌 벡터 기반 개인화 추천 API
 * 요청 위치: POST /api/advanced/personal
 */
router.post("/personal", async (req, res) => {
    try {
        const { userId, tags, term } = req.body;

        // -------------------------------
        // 1) 사용자 기반 벡터 생성
        // -------------------------------

        let userVec = {};
        let ownedAppIds = [];

        // A. 태그 기반 벡터 (가중치 높음)
        if (tags && Array.isArray(tags)) {
            tags.forEach(tag => {
                userVec[tag] = (userVec[tag] || 0) + 3; // 태그는 높은 가중치
            });
        }

        // B. 스팀 플레이 기록 벡터 (가중치 낮음)
        // userId가 있고 유효한 형식일 때만 DB 조회
        if (userId && mongoose.isValidObjectId(userId)) {
            const user = await User.findById(userId).lean();
            
            if (user && Array.isArray(user.steamGames)) {
                ownedAppIds = user.steamGames.map(g => g.appid);

                user.steamGames.forEach(g => {
                    const tag = g.genre || "unknown";
                    // 스팀 플레이타임 반영 (분 단위)
                    userVec[tag] = (userVec[tag] || 0) + (g.playtime_forever / 300); 
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

        // 필요한 필드만 조회하여 성능 최적화
        const games = await Game.find(query)
            .select("slug title title_ko smart_tags main_image price_info metacritic_score trend_score steam_appid play_time")
            .lean();

        if (!games.length) {
            return res.json({ games: [] });
        }

        // -------------------------------
        // 3) 추천 점수 계산
        // -------------------------------

        const recoList = games
            .filter(g => !ownedAppIds.includes(g.steam_appid)) // 이미 가진 게임 제외
            .map(g => {
                // ★ [핵심 수정] vector.gameToVector 로 접근하여 undefined 오류 방지
                const gameVec = vector.gameToVector(g.smart_tags); 
                const similarity = vector.calculateSimilarity(userVec, gameVec) || 0;

                const trendVal = g.trend_score || 0;
                const metaScore = g.metacritic_score || 0;

                let priceBonus = 0;
                if (g.price_info) {
                    if (g.price_info.isFree) priceBonus += 0.1;
                    if (g.price_info.discount_percent > 0) priceBonus += 0.1;
                }

                // 점수 산정 공식 (유사도 비중 60%)
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
            .sort((a, b) => b.score - a.score) // 점수 내림차순 정렬
            .slice(0, 20); // 상위 20개만 반환

        res.json({ games: recoList });

    } catch (e) {
        console.error("🔥 추천 시스템 오류:", e);
        // 500 에러 발생 시에도 JSON 응답을 보내 프론트엔드 멈춤 방지
        res.status(500).json({ error: "서버 내부 오류가 발생했습니다." });
    }
});

module.exports = router;