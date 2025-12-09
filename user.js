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
    } catch (error) {
        res.status(500).json({ message: "오류" });
    }
});

router.put("/info", authenticateToken, async (req, res) => {
    const { username } = req.body;
    try {
        const user = await User.findById(req.user._id);
        if (username) user.username = username;

        await user.save();
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: "오류" });
    }
});

router.get('/games', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const steamId = user.steamId;
        const STEAM_API_KEY = process.env.STEAM_WEB_API_KEY || process.env.STEAM_API_KEY;

        if (!steamId) {
            return res.json({ linked: false, games: [] });
        }

        const response = await axios.get(
            "http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/",
            { params: { key: STEAM_API_KEY, steamid: steamId, include_appinfo: true, include_played_free_games: true, format: 'json' } }
        );

        const games = response.data?.response?.games || [];

        user.steamGames = games.map((g) => ({
            appid: g.appid,
            name: g.name,
            playtime_forever: g.playtime_forever,
            img_icon_url: g.img_icon_url
        }));

        await user.save();
        console.log(`[스팀 게임 동기화] User: ${user.username}, 게임 수: ${games.length}`);

        return res.json({ linked: true, games });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "조회 실패" });
    }
});

router.delete('/steam', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        user.steamId = null;
        user.steamGames = [];
        await user.save();
        res.json({ message: "연동 해제 완료" });
    } catch (error) {
        res.status(500).json({ message: "오류" });
    }
});

router.post("/tags", authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        user.likedTags = req.body.tags || [];
        await user.save();
        res.json({ message: "저장됨", tags: user.likedTags });
    } catch (error) {
        res.status(500).json({ message: "오류" });
    }
});

router.get("/wishlist", authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        res.json({ wishlist: user.wishlist });
    } catch (error) {
        res.status(500).json({ message: "오류" });
    }
});

router.post("/wishlist", authenticateToken, async (req, res) => {
    const { slug } = req.body;
    try {
        const user = await User.findById(req.user._id);
        if (!user.wishlist.includes(slug)) {
            user.wishlist.push(slug);
            await user.save();
        }
        res.json({ message: "추가", wishlist: user.wishlist });
    } catch (error) {
        res.status(500).json({ message: "오류" });
    }
});

router.delete("/wishlist/:slug", authenticateToken, async (req, res) => {
    const { slug } = req.params;
    try {
        const user = await User.findById(req.user._id);
        user.wishlist = user.wishlist.filter((s) => s !== slug);
        await user.save();
        res.json({ message: "삭제", wishlist: user.wishlist });
    } catch (error) {
        res.status(500).json({ message: "오류" });
    }
});

module.exports = router;
