// backend/routes/user.js

const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Game = require("../models/Game");
const axios = require("axios");
const { authenticateToken } = require("../middleware/auth");

router.get("/info", authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select("-password");
        res.json(user);
    } catch (error) { res.status(500).json({ message: "오류" }); }
});

router.put("/info", authenticateToken, async (req, res) => {
    const { username } = req.body;
    try {
        const user = await User.findById(req.user._id);
        if (username) user.username = username;
        await user.save();
        res.json(user);
    } catch (error) { res.status(500).json({ message: "오류" }); }
});

// 스팀 라이브러리 조회 (400 에러 제거)
router.get('/games', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const steamId = user.steamId;
        const STEAM_API_KEY = process.env.STEAM_WEB_API_KEY || process.env.STEAM_API_KEY;

        // ★ 수정됨: 400 에러 대신 정상 응답(200)에 linked: false 플래그를 담아 보냄
        if (!steamId) {
            return res.json({ linked: false, games: [] });
        }

        const response = await axios.get(
            "http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/",
            { params: { key: STEAM_API_KEY, steamid: steamId, include_appinfo: true, include_played_free_games: true, format: 'json' } }
        );

        const games = response.data?.response?.games || [];
        const sortedGames = games.sort((a, b) => b.playtime_forever - a.playtime_forever).slice(0, 50);
        const appIds = sortedGames.map(g => g.appid); 

        const localGames = await Game.find({ steam_appid: { $in: appIds } }).select("steam_appid smart_tags").lean();

        const enrichedGames = sortedGames.map(g => {
            const match = localGames.find(lg => lg.steam_appid == g.appid);
            return { ...g, smart_tags: match ? match.smart_tags : [] };
        });

        // linked: true 플래그 추가
        res.json({ linked: true, games: enrichedGames });

    } catch (error) {
        if (error.response?.status === 403) return res.json({ linked: true, games: [], error: "PRIVATE" });
        res.status(500).json({ message: "실패" });
    }
});

router.delete("/steam", authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        user.steamId = null;
        await user.save();
        res.json({ message: "해제됨", user });
    } catch (error) { res.status(500).json({ message: "오류" }); }
});

router.post("/tags", authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        user.likedTags = req.body.tags || [];
        await user.save();
        res.json({ message: "저장됨" });
    } catch (error) { res.status(500).json({ message: "오류" }); }
});

router.get("/wishlist", authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        res.json(user.wishlist || []);
    } catch (error) { res.status(500).json({ message: "오류" }); }
});

router.post("/wishlist", authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user.wishlist.includes(req.body.slug)) {
            user.wishlist.push(req.body.slug);
            await user.save();
        }
        res.json(user.wishlist);
    } catch (error) { res.status(500).json({ message: "오류" }); }
});

router.delete("/wishlist/:slug", authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        user.wishlist = user.wishlist.filter(item => item !== req.params.slug);
        await user.save();
        res.json(user.wishlist);
    } catch (error) { res.status(500).json({ message: "오류" }); }
});

module.exports = router;