// backend/routes/user.js
const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { authenticateToken } = require("../middleware/auth");

// 헬퍼 함수
function getUserId(req) {
  return req.user?.userId || req.user?._id || req.user?.id || null;
}

// ---------- GET /api/user/info ----------
router.get("/info", authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not logged in" });

    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json(user);
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// ---------- GET /api/user/steam-library ----------
router.get("/steam-library", authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "NOT_LOGGED_IN" });

    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!user.steamId) {
      return res.status(401).json({ error: "STEAM_NOT_LINKED" });
    }

    return res.json(user.steamGames || []);
  } catch (e) {
    console.error("Steam library fetch error:", e);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ---------- POST /api/user/wishlist ----------
router.post("/wishlist", authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not logged in" });

    const { slug } = req.body;
    if (!slug) return res.status(400).json({ error: "slug is required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!Array.isArray(user.wishlist)) user.wishlist = [];
    if (!user.wishlist.includes(slug)) user.wishlist.push(slug);

    await user.save();
    res.json({ wishlist: user.wishlist });
  } catch (e) {
    console.error("/api/user/wishlist error:", e);
    res.status(500).json({ error: "Error updating wishlist" });
  }
});

module.exports = router;
