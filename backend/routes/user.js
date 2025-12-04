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

// ★ [핵심 수정] 스팀 라이브러리 조회 시 DB 자동 저장 기능 추가
router.get('/games', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const steamId = user.steamId;
        const STEAM_API_KEY = process.env.STEAM_WEB_API_KEY || process.env.STEAM_API_KEY;

        if (!steamId) {
            return res.json({ linked: false, games: [] });
        }

        // 1. 스팀 API에서 최신 게임 목록 가져오기
        const response = await axios.get(
            "http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/",
            { params: { key: STEAM_API_KEY, steamid: steamId, include_appinfo: true, include_played_free_games: true, format: 'json' } }
        );

        const games = response.data?.response?.games || [];

        // 2. ★ [추가됨] 가져온 게임 목록을 내 DB(User)에 저장 (동기화)
        if (games.length > 0) {
            user.steamGames = games.map(g => ({
                appid: g.appid,
                name: g.name,
                playtime_forever: g.playtime_forever,
                img_icon_url: g.img_icon_url
            }));
            await user.save(); // 저장 필수!
            console.log(`[Steam Sync] 유저 ${user.username}의 게임 ${games.length}개 동기화 완료`);
        }

        // 3. 프론트엔드 반환 (기존 로직 유지)
        const sortedGames = games.sort((a, b) => b.playtime_forever - a.playtime_forever).slice(0, 50);
        const appIds = sortedGames.map(g => g.appid); 

        const localGames = await Game.find({ steam_appid: { $in: appIds } }).select("steam_appid smart_tags").lean();

        const enrichedGames = sortedGames.map(g => {
            const match = localGames.find(lg => lg.steam_appid == g.appid);
            return { ...g, smart_tags: match ? match.smart_tags : [] };
        });

        res.json({ linked: true, games: enrichedGames });

    } catch (error) {
        console.error("스팀 연동 에러:", error.message);
        if (error.response?.status === 403) return res.json({ linked: true, games: [], error: "PRIVATE" });
        res.status(500).json({ message: "실패" });
    }
});

router.delete("/steam", authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        user.steamId = null;
        user.steamGames = []; // 연동 해제 시 데이터도 초기화
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