// backend/routes/recommend.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Game = require("../models/Game");
const User = require("../models/User");
const vector = require("../utils/vector"); 

router.post("/personal", async (req, res) => {
    try {
        const { userId, tags, term } = req.body;

        // -------------------------------
        // 1) 사용자 취향 프로필 생성 (User Profiling)
        // -------------------------------
        let userVec = {}; 
        let ownedAppIds = [];
        let hasPersonalData = false; 

        // A. 사용자가 선택한 태그 (가중치: 5점)
        if (tags && Array.isArray(tags) && tags.length > 0) {
            tags.forEach(tag => {
                userVec[tag] = (userVec[tag] || 0) + 5; 
            });
            hasPersonalData = true;
        }

        // B. 스팀 플레이 기록 정밀 분석 (DB 데이터 활용)
        if (userId && mongoose.isValidObjectId(userId)) {
            const user = await User.findById(userId).lean();
            
            if (user && Array.isArray(user.steamGames) && user.steamGames.length > 0) {
                // 1. 내 라이브러리 플레이타임 매핑
                const mySteamMap = {};
                user.steamGames.forEach(g => {
                    if (g.appid) {
                        ownedAppIds.push(g.appid);
                        mySteamMap[g.appid] = g.playtime_forever || 0;
                    }
                });

                // 2. 내 게임들의 상세 태그 조회 (DB에서 smart_tags 가져오기)
                const myRichGames = await Game.find({ steam_appid: { $in: ownedAppIds } })
                    .select("steam_appid smart_tags")
                    .lean();

                // 3. 로그 가중치 적용하여 취향 벡터 생성
                myRichGames.forEach(game => {
                    const playtime = mySteamMap[game.steam_appid] || 0;
                    
                    // [핵심] 롤(2000시간)과 패키지게임(50시간)의 격차를 로그로 보정
                    const timeWeight = Math.log10(playtime + 1); 

                    if (game.smart_tags && Array.isArray(game.smart_tags)) {
                        game.smart_tags.forEach(tag => {
                            userVec[tag] = (userVec[tag] || 0) + timeWeight;
                        });
                    }
                });
                if (myRichGames.length > 0) hasPersonalData = true;
            }
        }

        // -------------------------------
        // [예외] 데이터가 아예 없을 때 -> 인기 게임(Trend) 추천
        // -------------------------------
        if (!hasPersonalData && !term) {
            const trendGames = await Game.find({ trend_score: { $ne: null } })
                .sort({ trend_score: -1 }).limit(20)
                .select("slug title title_ko smart_tags main_image price_info metacritic_score trend_score steam_appid play_time").lean();

            const formatted = trendGames.map(g => ({ ...g, score: 95 }));
            return res.json({ games: formatted });
        }

        // -------------------------------
        // 2) 추천 후보군 검색
        // -------------------------------
        let query = {};
        if (term) {
            const regex = new RegExp(term, "i");
            query = { $or: [{ title: regex }, { title_ko: regex }] };
        }

        const games = await Game.find(query)
            .select("slug title title_ko smart_tags main_image price_info metacritic_score trend_score steam_appid play_time").lean();

        if (!games.length) return res.json({ games: [] });

        // -------------------------------
        // 3) 점수 계산 및 정렬
        // -------------------------------
        const recoList = games
            .filter(g => !ownedAppIds.includes(g.steam_appid)) // 이미 가진 게임 제외
            .map(g => {
                const gameVec = vector.gameToVector(g.smart_tags); 
                let similarity = vector.calculateSimilarity(userVec, gameVec) || 0;

                // 태그 난사 게임(20개 이상) 페널티
                if (g.smart_tags && g.smart_tags.length > 20) similarity *= 0.9; 

                const trendVal = g.trend_score || 0;
                const metaScore = g.metacritic_score || 0;
                let priceBonus = 0;
                if (g.price_info) {
                    if (g.price_info.isFree) priceBonus += 0.05;
                    if (g.price_info.discount_percent > 0) priceBonus += 0.05;
                }

                // 가중치: 유사도(65%) + 트렌드(20%) + 메타점수(10%) + 가격(5%)
                const score = (similarity * 0.65) + 
                              (trendVal > 0 ? Math.log10(trendVal + 5) * 0.2 : 0) + 
                              ((metaScore / 100) * 0.1) + priceBonus;

                return { ...g, score: Math.round(score * 100) };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, 20);

        res.json({ games: recoList });

    } catch (e) {
        console.error("추천 오류:", e);
        res.status(500).json({ error: "Server Error" });
    }
});

module.exports = router;