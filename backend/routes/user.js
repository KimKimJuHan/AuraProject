const express = require("express");
const router = express.Router();

const User = require("../models/User");
const Game = require("../models/Game");
const axios = require("axios");
const bcrypt = require("bcrypt");
const { authenticateToken } = require("../middleware/auth");
const cache = require("../utils/simpleCache");

// 1. 유저 IP 조회
router.get("/ip", (req, res) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const cleanIp = ip.includes("::ffff:") ? ip.split("::ffff:")[1] : ip;
  res.json({ ip: cleanIp });
});

// 2. 유저 정보 조회
router.get("/info", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    if (!user) return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "오류" });
  }
});

// 3. 유저 정보 수정 (기존 username 변경용)
router.put("/info", authenticateToken, async (req, res) => {
  const { username } = req.body;
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    if (username) user.username = username;
    await user.save();
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "오류" });
  }
});

// 4. 스팀 라이브러리 동기화
router.get("/games", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    const steamId = user?.steamId;
    const STEAM_API_KEY = process.env.STEAM_WEB_API_KEY || process.env.STEAM_API_KEY;

    if (!steamId) return res.json({ linked: false, games: [] });

    const response = await axios.get(
      "http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/",
      {
        params: {
          key: STEAM_API_KEY,
          steamid: steamId,
          include_appinfo: true,
          include_played_free_games: true,
          format: "json",
        },
      }
    );

    const games = response.data?.response?.games || [];

    // DB에 저장(동기화)
    if (games.length > 0) {
      user.steamGames = games.map((g) => ({
        appid: g.appid,
        name: g.name,
        playtime_forever: g.playtime_forever,
        img_icon_url: g.img_icon_url,
      }));
      await user.save();
      cache.deleteByPrefix(`reco:${req.user._id}`); // Steam 게임 동기화 → 추천 캐시 무효화
    }

    // 상위 50개만 내려주고, 로컬게임 태그 붙이기
    const sortedGames = games
      .slice()
      .sort((a, b) => b.playtime_forever - a.playtime_forever)
      .slice(0, 50);

    const appIds = sortedGames.map((g) => g.appid);

    const localGames = await Game.find({ steam_appid: { $in: appIds } })
      .select("steam_appid smart_tags")
      .lean();

    const enrichedGames = sortedGames.map((g) => {
      const match = localGames.find((lg) => String(lg.steam_appid) === String(g.appid));
      return { ...g, smart_tags: match ? match.smart_tags : [] };
    });

    res.json({ linked: true, games: enrichedGames });
  } catch (error) {
    if (error.response?.status === 403) {
      return res.json({ linked: true, games: [], error: "PRIVATE" });
    }
    res.status(500).json({ message: "실패" });
  }
});

// 5. 스팀 연동 해제
router.delete("/steam", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    user.steamId = null;
    user.steamGames = [];
    await user.save();
    cache.deleteByPrefix(`reco:${req.user._id}`); // Steam 해제 → 추천 캐시 무효화
    res.json({ message: "해제됨", user });
  } catch (error) {
    res.status(500).json({ message: "오류" });
  }
});

// 6. 선호 태그 저장
router.post("/tags", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    user.likedTags = req.body.tags || [];
    await user.save();
    cache.deleteByPrefix(`reco:${req.user._id}`); // 선호태그 변경 → 추천 캐시 무효화
    res.json({ message: "저장됨" });
  } catch (error) {
    res.status(500).json({ message: "오류" });
  }
});

// 7. 찜 목록 조회
router.get("/wishlist", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    res.json(user.wishlist || []);
  } catch (error) {
    res.status(500).json({ message: "오류" });
  }
});

// 8. 찜 추가
router.post("/wishlist", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    if (!user.wishlist.includes(req.body.slug)) {
      user.wishlist.push(req.body.slug);
      await user.save();
    }
    res.json(user.wishlist);
  } catch (error) {
    res.status(500).json({ message: "오류" });
  }
});

// 9. 찜 삭제
router.delete("/wishlist/:slug", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    user.wishlist = user.wishlist.filter((item) => item !== req.params.slug);
    await user.save();
    res.json(user.wishlist);
  } catch (error) {
    res.status(500).json({ message: "오류" });
  }
});

// 10. 계정 영구 삭제
router.delete("/account", authenticateToken, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user._id);

    if (req.session) {
      req.session.destroy(() => {
        res.clearCookie("connect.sid").json({ success: true, message: "계정이 삭제되었습니다." });
      });
    } else {
      res.json({ success: true, message: "계정이 삭제되었습니다." });
    }
  } catch (error) {
    console.error("Account Deletion Error:", error);
    res.status(500).json({ success: false, message: "계정 삭제 중 오류가 발생했습니다." });
  }
});

// 11. 내 닉네임 변경 (displayName)
router.patch("/me/displayName", authenticateToken, async (req, res) => {
  try {
    const { displayName } = req.body;

    if (!displayName || !String(displayName).trim()) {
      return res.status(400).json({ message: "displayName required" });
    }

    const value = String(displayName).trim();

    if (value.length < 2 || value.length > 20) {
      return res.status(400).json({ message: "displayName must be 2~20 chars" });
    }

    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { displayName: value },
      { new: true }
    ).select("-password");

    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "server error" });
  }
});

// playerType 직접 설정
router.put("/playerType", authenticateToken, async (req, res) => {
    try {
        const { playerType } = req.body;
        const valid = ['casual', 'beginner', 'intermediate', 'hardcore', 'streamer'];
        if (!valid.includes(playerType))
            return res.status(400).json({ message: "올바르지 않은 플레이어 타입입니다." });

        await User.findByIdAndUpdate(req.user._id, {
            playerType,
            playerTypeSetByUser: true
        });
        cache.deleteByPrefix(`reco:${req.user._id}`); // 플레이어타입 변경 → 추천 캐시 무효화
        res.json({ success: true, playerType });
    } catch (err) {
        res.status(500).json({ message: "서버 오류" });
    }
});

// 비밀번호 변경
router.put("/password", authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword)
            return res.status(400).json({ message: "현재 비밀번호와 새 비밀번호를 입력해주세요." });
        if (newPassword.length < 8)
            return res.status(400).json({ message: "새 비밀번호는 8자 이상이어야 합니다." });

        const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
        if (!user.password)
            return res.status(400).json({ message: "소셜 로그인 계정은 비밀번호를 변경할 수 없습니다." });

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch)
            return res.status(401).json({ message: "현재 비밀번호가 일치하지 않습니다." });

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();
        res.json({ success: true, message: "비밀번호가 변경되었습니다." });
    } catch (err) {
        res.status(500).json({ message: "서버 오류" });
    }
});

// 알림 설정 조회
router.get("/notifications/settings", authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select("notificationSettings");
    if (!user) return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
        res.json(user.notificationSettings || { saleAlert: true, newGameAlert: false, emailAlert: true });
    } catch (err) {
        res.status(500).json({ message: "서버 오류" });
    }
});

// 알림 설정 저장
router.put("/notifications/settings", authenticateToken, async (req, res) => {
    try {
        const { saleAlert, newGameAlert, emailAlert } = req.body;
        await User.findByIdAndUpdate(req.user._id, {
            $set: { notificationSettings: { saleAlert, newGameAlert, emailAlert } }
        });
        res.json({ success: true, message: "알림 설정이 저장되었습니다." });
    } catch (err) {
        res.status(500).json({ message: "서버 오류" });
    }
});



// 목표 가격 알림 설정
router.post("/price-alert", authenticateToken, async (req, res) => {
    try {
        const { slug, targetPrice } = req.body;
        if (!slug || !targetPrice || targetPrice <= 0)
            return res.status(400).json({ message: "slug와 목표 가격을 입력해주세요." });
        const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
        if (!user.priceAlerts) user.priceAlerts = [];
        const existing = user.priceAlerts.find(a => a.slug === slug);
        if (existing) {
            existing.targetPrice = targetPrice;
        } else {
            user.priceAlerts.push({ slug, targetPrice });
        }
        await user.save();
        res.json({ success: true, message: "목표 가격이 설정되었습니다." });
    } catch (err) {
        res.status(500).json({ message: "서버 오류" });
    }
});

// 목표 가격 알림 조회
router.get("/price-alert/:slug", authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select("priceAlerts");
    if (!user) return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
        const found = (user.priceAlerts || []).find(a => a.slug === req.params.slug);
        res.json({ targetPrice: found ? found.targetPrice : null });
    } catch (err) {
        res.status(500).json({ message: "서버 오류" });
    }
});

// 목표 가격 알림 삭제
router.delete("/price-alert/:slug", authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
        user.priceAlerts = (user.priceAlerts || []).filter(a => a.slug !== req.params.slug);
        await user.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ message: "서버 오류" });
    }
});


// 선호 태그 저장
router.put("/liked-tags", authenticateToken, async (req, res) => {
    try {
        const { tags } = req.body;
        if (!Array.isArray(tags)) return res.status(400).json({ message: "tags 배열이 필요합니다." });
        await User.findByIdAndUpdate(req.user._id, { $set: { likedTags: tags } });
        cache.deleteByPrefix(`reco:${req.user._id}`); // 선호태그 변경 → 추천 캐시 무효화
        res.json({ success: true, likedTags: tags });
    } catch (err) {
        res.status(500).json({ message: "서버 오류" });
    }
});


// ── 관심없음 ──────────────────────────────────────────────────────────────────
// 관심없음 추가 + 태그 가중치 조정
router.post('/dislike', authenticateToken, async (req, res) => {
    try {
        const { slug, tags } = req.body;
        if (!slug) return res.status(400).json({ message: 'slug 필요' });

        const update = { $addToSet: { dislikedGames: slug } };

        // 태그 가중치 감소 (-0.3씩, 최소 -1.0)
        if (tags && tags.length > 0) {
            const user = await User.findById(req.user._id).lean();
    if (!user) return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
            const weights = user.tagWeights ? Object.fromEntries(user.tagWeights) : {};
            for (const tag of tags) {
                weights[tag] = Math.max((weights[tag] || 0) - 0.3, -1.0);
            }
            update.$set = { tagWeights: weights };
        }

        await User.findByIdAndUpdate(req.user._id, update);
        cache.deleteByPrefix(`reco:${req.user._id}`); // 추천 캐시 무효화
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ message: '서버 오류' });
    }
});

// 관심없음 취소
router.delete('/dislike/:slug', authenticateToken, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user._id, {
            $pull: { dislikedGames: req.params.slug }
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ message: '서버 오류' });
    }
});

// 관심없음 목록 조회
router.get('/disliked', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('dislikedGames').lean();
    if (!user) return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
        res.json(user?.dislikedGames || []);
    } catch (err) {
        res.status(500).json({ message: '서버 오류' });
    }
});


module.exports = router;