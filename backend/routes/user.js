// backend/routes/user.js

const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Game = require("../models/Game");
const axios = require("axios");
const { authenticateToken } = require("../middleware/auth");

// 1. 유저 정보
router.get("/info", authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select("-password");
        if (!user) return res.status(404).json({ message: "사용자 없음" });
        res.json(user);
    } catch (error) { res.status(500).json({ message: "서버 오류" }); }
});

// 2. 유저 정보 수정
router.put("/info", authenticateToken, async (req, res) => {
    const { username } = req.body;
    try {
        const user = await User.findById(req.user._id);
        if (username && username !== user.username) user.username = username;
        await user.save();
        res.json(user);
    } catch (error) { res.status(500).json({ message: "오류 발생" }); }
});

// 3. 태그 저장
router.post("/tags", authenticateToken, async (req, res) => {
    const { tags } = req.body;
    try {
        const user = await User.findById(req.user._id);
        user.likedTags = tags || [];
        await user.save();
        res.json({ message: "저장됨", likedTags: user.likedTags });
    } catch (error) { res.status(500).json({ message: "오류 발생" }); }
});

// 4. ★ 스팀 라이브러리 조회 (로그 강화)
router.get('/games', authenticateToken, async (req, res) => {
    const steamId = req.user.steamId;
    const STEAM_API_KEY = process.env.STEAM_WEB_API_KEY || process.env.STEAM_API_KEY;

    console.log(`[스팀 조회 요청] User: ${req.user.username}, SteamID: ${steamId}`);

    if (!steamId) {
        // ★ 400 에러는 "연동 안됨" 의미이므로 에러가 아님 (클라이언트가 처리)
        return res.status(400).json({ message: "스팀 계정 미연동" });
    }

    try {
        const response = await axios.get(
            "http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/",
            {
                params: {
                    key: STEAM_API_KEY,
                    steamid: steamId,
                    include_appinfo: true,
                    include_played_free_games: true,
                    format: 'json'
                }
            }
        );

        const games = response.data?.response?.games || [];
        console.log(`[스팀 API] ${games.length}개 게임 발견`);

        const sortedGames = games.sort((a, b) => b.playtime_forever - a.playtime_forever).slice(0, 50);
        const appIds = sortedGames.map(g => g.appid); 

        // DB에서 스마트 태그 매칭
        const localGames = await Game.find({ steam_appid: { $in: appIds } }).select("steam_appid smart_tags").lean();

        const enrichedGames = sortedGames.map(g => {
            const match = localGames.find(lg => lg.steam_appid == g.appid);
            return { 
                ...g, 
                smart_tags: match && match.smart_tags ? match.smart_tags : [] 
            };
        });

        res.json(enrichedGames);

    } catch (error) {
        console.error("[스팀 API 에러]:", error.message);
        if (error.response?.status === 403) {
            return res.status(403).json({ errorCode: "PRIVATE_PROFILE", message: "비공개 프로필" });
        }
        res.status(500).json({ message: "조회 실패" });
    }
});

// 5. 스팀 해제
router.delete("/steam", authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        user.steamId = undefined;
        await user.save();
        res.json({ message: "해제됨", user });
    } catch (error) { res.status(500).json({ message: "오류" }); }
});

// 6. 찜 목록
router.get("/wishlist", authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        res.json(user.wishlist || []);
    } catch (error) { res.status(500).json({ message: "오류" }); }
});

router.post("/wishlist", authenticateToken, async (req, res) => {
    const { slug } = req.body;
    try {
        const user = await User.findById(req.user._id);
        if (!user.wishlist.includes(slug)) {
            user.wishlist.push(slug);
            await user.save();
        }
        res.json(user.wishlist);
    } catch (error) { res.status(500).json({ message: "오류" }); }
});

router.delete("/wishlist/:slug", authenticateToken, async (req, res) => {
    const { slug } = req.params;
    try {
        const user = await User.findById(req.user._id);
        user.wishlist = user.wishlist.filter(item => item !== slug);
        await user.save();
        res.json(user.wishlist);
    } catch (error) { res.status(500).json({ message: "오류" }); }
});

module.exports = router;