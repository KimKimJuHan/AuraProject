const express = require('express');
const router = express.Router();
const axios = require('axios');
const Game = require('../models/Game');
const User = require('../models/User');
const { calculateSimilarity, gameToVector, userToVector } = require('../utils/vector');

async function analyzeSteamLibrary(steamId) {
    const apiKey = process.env.STEAM_API_KEY;
    if (!apiKey || !steamId) return [];
    try {
        const res = await axios.get(`http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${apiKey}&steamid=${steamId}&format=json`);
        const games = res.data?.response?.games || [];
        const topPlayed = games
            .sort((a, b) => b.playtime_forever - a.playtime_forever)
            .slice(0, 10)
            .map(g => g.appid);
        if (topPlayed.length === 0) return [];
        const dbGames = await Game.find({ steam_appid: { $in: topPlayed } });
        let tags = [];
        dbGames.forEach(g => { tags = [...tags, ...g.smart_tags]; });
        return tags;
    } catch (e) { return []; }
}

router.post('/personal', async (req, res) => {
  const { userId, tags: manualTags, steamId } = req.body;
  
  try {
    let userTags = [...(manualTags || [])];
    
    if (steamId) {
        const steamTags = await analyzeSteamLibrary(steamId);
        userTags = [...userTags, ...steamTags];
    }

    if (userId) {
        const user = await User.findById(userId);
        if (user && user.likedTags) {
            userTags = [...userTags, ...user.likedTags];
        }
    }

    if (userTags.length === 0) {
        const fallback = await Game.find().sort({ popularity: -1 }).limit(10).lean();
        return res.json(fallback);
    }

    const allGames = await Game.find({}).select('slug title title_ko smart_tags main_image price_info trend_score').lean();
    const userVec = userToVector(userTags);
    
    const recommendations = allGames
        .map(game => {
            const gameVec = gameToVector(game.smart_tags);
            const similarity = calculateSimilarity(userVec, gameVec);
            const trendBonus = Math.log((game.trend_score || 0) + 1) / 10; 
            const finalScore = (similarity * 0.7) + (trendBonus * 0.3);
            return { ...game, score: finalScore };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 12);

    res.json(recommendations);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;