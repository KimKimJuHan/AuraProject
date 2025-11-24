const express = require('express');
const router = express.Router();
const Game = require('../models/Game');
const User = require('../models/User');
const { calculateSimilarity, gameToVector, userToVector } = require('../utils/vector');

router.post('/personal', async (req, res) => {
  const { userId } = req.body;
  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    // 필요한 데이터만 가져옴 (+ trend_score)
    const allGames = await Game.find({}).select('slug title title_ko smart_tags main_image price_info metacritic_score trend_score');
    const userVec = userToVector(user.likedTags || []);

    const recommendations = allGames
        .filter(g => !user.wishlist.includes(g.slug))
        .map(game => {
            const gameVec = gameToVector(game.smart_tags);
            const similarity = calculateSimilarity(userVec, gameVec);
            
            // ★ [핵심] 하이브리드 점수: 취향 유사도(70%) + 현재 트렌드(30%)
            // 트렌드 점수는 로그 스케일로 정규화
            const trendFactor = Math.log(game.trend_score + 1) / 10; 
            const finalScore = (similarity * 0.7) + (trendFactor * 0.3);
            
            return { ...game.toObject(), score: finalScore };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 12); // 상위 12개

    res.json(recommendations);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;