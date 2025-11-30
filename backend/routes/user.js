// backend/routes/user.js

const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Game = require("../models/Game"); // ★ 스마트 태그 조회용
const axios = require("axios");
const { authenticateToken } = require("../middleware/auth");

// =========================
// 유저 기본 정보
// =========================
router.get("/info", authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select("-password");
        if (!user) return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
        res.json(user);
    } catch (error) {
        console.error("[User Info Error]", error);
        res.status(500).json({ message: "서버 오류" });
    }
});

// =========================
// 🎮 스팀 라이브러리 조회 + 스마트 태그 통합 (개선됨)
// =========================
router.get('/games', authenticateToken, async (req, res) => {
    const steamId = req.user.steamId;
    const STEAM_API_KEY = process.env.STEAM_WEB_API_KEY || process.env.STEAM_API_KEY;

    if (!steamId) {
        return res.status(400).json({ message: "스팀 계정이 연동되지 않았습니다." });
    }

    try {
        // 1. Steam API 호출
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

        // 2. 플레이 타임 순 정렬
        const sortedGames = games.sort((a, b) => b.playtime_forever - a.playtime_forever);

        // 3. 상위 50개의 태그 정보를 우리 DB에서 조회
        const topGames = sortedGames.slice(0, 50);
        const appIds = topGames.map(g => g.appid);

        const localGames = await Game.find({ steam_appid: { $in: appIds } })
            .select("steam_appid smart_tags")
            .lean();

        // 4. 스팀 데이터 + 스마트 태그 병합
        const enrichedGames = sortedGames.map(g => {
            if (appIds.includes(g.appid)) {
                const match = localGames.find(lg => lg.steam_appid === g.appid);
                return { ...g, smart_tags: match ? match.smart_tags : [] };
            }
            return g;
        });

        return res.json(enrichedGames);

    } catch (error) {
        console.error("[Steam API Error]:", error.message);

        if (error.response?.status === 403) {
            return res.status(403).json({
                errorCode: "PRIVATE_PROFILE",
                message: "스팀 프로필이 비공개 상태입니다."
            });
        }

        res.status(500).json({ message: "스팀 라이브러리 조회 실패" });
    }
});

// =========================
// ❤️ 찜 목록 조회
// =========================
router.get("/wishlist", authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        res.json(user.wishlist || []);
    } catch (error) {
        console.error("[Wishlist Error]", error);
        res.status(500).json({ message: "서버 오류" });
    }
});

// =========================
// ❤️ 찜 추가
// =========================
router.post("/wishlist", authenticateToken, async (req, res) => {
    const { slug } = req.body;

    if (!slug) return res.status(400).json({ message: "slug가 필요합니다." });

    try {
        const user = await User.findById(req.user._id);

        if (!user.wishlist.includes(slug)) {
            user.wishlist.push(slug);
            await user.save();
        }

        res.json(user.wishlist);

    } catch (error) {
        console.error("[Wishlist Add Error]", error);
        res.status(500).json({ message: "서버 오류" });
    }
});

// =========================
// ❤️ 찜 삭제
// =========================
router.delete("/wishlist/:slug", authenticateToken, async (req, res) => {
    const { slug } = req.params;

    try {
        const user = await User.findById(req.user._id);
        user.wishlist = user.wishlist.filter(item => item !== slug);
        await user.save();

        res.json(user.wishlist);

    } catch (error) {
        console.error("[Wishlist Delete Error]", error);
        res.status(500).json({ message: "서버 오류" });
    }
});

module.exports = router;