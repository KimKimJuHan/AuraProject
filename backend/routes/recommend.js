const express = require('express');
const router = express.Router();
const axios = require('axios');
const Game = require('../models/Game');
const User = require('../models/User');
const { calculateSimilarity, gameToVector, userToVector } = require('../utils/vector');

// ★ 스팀 라이브러리 가져와서 선호 태그 분석하는 함수
async function analyzeSteamLibrary(steamId) {
    const apiKey = process.env.STEAM_API_KEY;
    if (!apiKey || !steamId) return [];

    try {
        // 1. 보유 게임 및 플레이 시간 조회
        const res = await axios.get(`http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${apiKey}&steamid=${steamId}&format=json`);
        const games = res.data?.response?.games || [];

        // 2. 많이 플레이한 상위 10개 게임 추출 (playtime_forever 기준)
        const topPlayed = games
            .sort((a, b) => b.playtime_forever - a.playtime_forever)
            .slice(0, 10)
            .map(g => g.appid);

        if (topPlayed.length === 0) return [];

        // 3. 우리 DB에서 해당 게임들의 태그 조회
        const dbGames = await Game.find({ steam_appid: { $in: topPlayed } });
        
        // 4. 태그 수집 (많이 한 게임의 태그일수록 가중치)
        let tags = [];
        dbGames.forEach(g => {
            tags = [...tags, ...g.smart_tags];
        });
        return tags;
    } catch (e) {
        console.error("Steam Analysis Error:", e.message);
        return [];
    }
}

// ★ 개인화 추천 API
router.post('/personal', async (req, res) => {
  const { userId, tags: manualTags, steamId } = req.body;
  
  try {
    // 1. 사용자 선호 태그 수집
    let userTags = [...(manualTags || [])]; // 사용자가 직접 선택한 태그
    
    // 2. 스팀 연동 시 플레이 기록 기반 태그 추가
    if (steamId) {
        const steamTags = await analyzeSteamLibrary(steamId);
        userTags = [...userTags, ...steamTags];
    }

    // 3. 유저가 로그인이 되어있다면 기존 활동 태그도 추가
    if (userId) {
        const user = await User.findById(userId);
        if (user && user.likedTags) {
            userTags = [...userTags, ...user.likedTags];
        }
    }

    // 태그가 하나도 없으면 인기순 반환
    if (userTags.length === 0) {
        const fallback = await Game.find().sort({ popularity: -1 }).limit(10);
        return res.json(fallback);
    }

    // 4. 추천 알고리즘 실행
    const allGames = await Game.find({}).select('slug title title_ko smart_tags main_image price_info trend_score');
    
    const userVec = userToVector(userTags); // 유저 취향 벡터
    
    const recommendations = allGames
        .map(game => {
            // (A) 콘텐츠 유사도 (취향 매칭)
            const gameVec = gameToVector(game.smart_tags);
            const similarity = calculateSimilarity(userVec, gameVec);
            
            // (B) 트렌드 점수 정규화 (0 ~ 1 사이 값으로 변환, 로그 스케일)
            // trend_score가 높을수록 가산점 (트위치/치지직 인기)
            const trendBonus = Math.log(game.trend_score + 1) / 10; 

            // (C) 최종 점수 = 유사도(70%) + 트렌드(30%)
            const finalScore = (similarity * 0.7) + (trendBonus * 0.3);

            return { ...game.toObject(), score: finalScore };
        })
        .sort((a, b) => b.score - a.score) // 점수 높은 순
        .slice(0, 12); // 상위 12개

    res.json(recommendations);

  } catch (err) {
    console.error("Reco Error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;