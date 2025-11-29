/**
 * SteamReco 8.0 — Steam 라이브러리 API 추가 + Tag Fix + SteamSpy 연동
 */

const express = require("express");
const fetch = require("node-fetch");
const axios = require("axios");
const router = express.Router();
const UA = "SteamReco/8.0 (+GameReco)";
const User = require("../models/User");
const authenticateToken = require("../middleware/auth");

// ============================================================
// 한글 → Steam 영문 태그 변환 맵
// ============================================================
const TAG_MAP = {
  RPG: "RPG",
  FPS: "FPS",
  시뮬레이션: "Simulation",
  전략: "Strategy",
  스포츠: "Sports",
  레이싱: "Racing",
  퍼즐: "Puzzle",
  생존: "Survival",
  공포: "Horror",
  "1인칭": "First-Person",
  "3인칭": "Third-Person",
  "픽셀 그래픽": "Pixel Graphics",
  "2D": "2D",
  "3D": "3D",
  "만화 같은": "Cartoon",
  현실적: "Realistic",
  판타지: "Fantasy",
  공상과학: "Sci-fi",
  중세: "Medieval",
  현대: "Modern",
  우주: "Space",
  좀비: "Zombies",
  사이버펑크: "Cyberpunk",
  마법: "Magic",
  전쟁: "War",
  "오픈 월드": "Open World",
  자원관리: "Resource Management",
  "스토리 중심": "Story Rich",
  "선택의 중요성": "Choices Matter",
  "캐릭터 커스터마이즈": "Character Customization",
  "협동 캠페인": "Co-op Campaign",
};

// ============================================================
// 🔥 Steam 라이브러리 조회 API 추가
// ============================================================
router.get("/library", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (!user || !user.steamId) {
      return res.status(404).json({ message: "스팀 계정이 연동되지 않았습니다." });
    }

    const STEAM_KEY = process.env.STEAM_WEB_API_KEY;
    const steamId = user.steamId;

    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${STEAM_KEY}&steamid=${steamId}&include_appinfo=true&include_played_free_games=true`;

    const response = await axios.get(url);

    return res.status(200).json({
      games: response.data?.response?.games || [],
    });
  } catch (err) {
    console.error("Steam Library Error:", err);
    return res.status(500).json({ message: "Steam 라이브러리를 불러오지 못했습니다." });
  }
});

// ============================================================
// 🔥 Steam 연동 여부 확인
// ============================================================
router.get("/linked", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    return res.json({ linked: Boolean(user?.steamId) });
  } catch {
    return res.status(500).json({ linked: false });
  }
});

// ============================================================
// 🔥 SteamSpy API — 태그 기반 게임 가져오기
// ============================================================
async function fetchSteamSpyByTag(engTag) {
  try {
    const url = `https://steamspy.com/api.php?request=tag&tag=${encodeURIComponent(
      engTag
    )}`;
    const res = await fetch(url);
    const json = await res.json();
    return Object.values(json);
  } catch {
    return [];
  }
}

// ============================================================
// 🔥 Steam 상세 정보
// ============================================================
async function fetchSteamDetails(appid) {
  try {
    const url = `https://store.steampowered.com/api/appdetails?appids=${appid}`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    const json = await res.json();
    const data = json?.[appid]?.data;
    if (!data) return null;

    return {
      name: data.name,
      thumb: data.header_image,
      price: data.price_overview
        ? data.price_overview.final_formatted
        : "가격 정보 없음",
      tags: data.tags ? Object.keys(data.tags) : [],
      genres: data.genres?.map((g) => g.description) || [],
      categories: data.categories?.map((c) => c.description) || [],
    };
  } catch {
    return null;
  }
}

// ============================================================
// 🔥 태그 세트 빌드
// ============================================================
function buildTagSet(detail) {
  const tags = new Set();
  if (detail.tags) detail.tags.forEach((t) => tags.add(t.toLowerCase()));
  if (detail.genres) detail.genres.forEach((g) => tags.add(g.toLowerCase()));
  if (detail.categories)
    detail.categories.forEach((c) => tags.add(c.toLowerCase()));
  return tags;
}

// ============================================================
// 🔥 태그 정확도 계산
// ============================================================
function calcTagScore(tagSet, userTagsEng) {
  let hit = 0;
  for (const t of userTagsEng) {
    if (tagSet.has(t.toLowerCase())) hit++;
  }
  return (hit / userTagsEng.length) * 100;
}

// ============================================================
// 🔥 종합 점수 계산
// ============================================================
function calcFinalScore(game, tagScore) {
  const ratingScore = game.score_rank
    ? 100 - Number(game.score_rank)
    : 50;

  const owners = game.owners?.split(" .. ")[1] || 0;
  const ownersScore = Math.min(100, Number(owners) / 20000);

  const playersScore = Math.min(100, Number(game.players || 0) / 50);

  return (
    tagScore * 0.5 +
    ratingScore * 0.3 +
    playersScore * 0.1 +
    ownersScore * 0.1
  );
}

// ============================================================
// 🔥 숨은 명작 판정
// ============================================================
function isHiddenGem(game) {
  const rating = game.score_rank ? 100 - game.score_rank : 0;
  const players = Number(game.players) || 0;
  return rating >= 85 && players < 200 && players > 10;
}

// ============================================================
// 🔥 추천 엔진 본체 (/reco)
// ============================================================
router.post("/reco", async (req, res) => {
  try {
    const { term = "", liked = [], strict = false, k = 12 } = req.body;

    if (!liked || liked.length === 0) {
      return res.json({ items: [] });
    }

    const likedEng = liked.map((t) => TAG_MAP[t]).filter(Boolean);

    let spyGames = [];
    for (const eng of likedEng) {
      spyGames.push(...(await fetchSteamSpyByTag(eng)));
    }

    const uniq = new Map();
    spyGames.forEach((g) => uniq.set(g.appid, g));
    spyGames = Array.from(uniq.values());

    const q = term.trim().toLowerCase();
    if (q) spyGames = spyGames.filter((g) => g.name?.toLowerCase().includes(q));

    if (spyGames.length === 0) {
      return res.json({ items: [] });
    }

    const result = [];

    for (const g of spyGames.slice(0, 120)) {
      const detail = await fetchSteamDetails(g.appid);
      if (!detail) continue;

      const tagSet = buildTagSet(detail);
      const tagScore = calcTagScore(tagSet, likedEng);

      if (strict && tagScore < 60) continue;

      result.push({
        appid: g.appid,
        name: detail.name || g.name,
        thumb: detail.thumb,
        price: detail.price,
        owners: g.owners,
        players: g.players,
        score_rank: g.score_rank,
        score: Math.round(calcFinalScore(g, tagScore)),
        hiddenGem: isHiddenGem(g),
      });
    }

    const filtered = result.filter((x) => x.score > 10);
    filtered.sort((a, b) => b.score - a.score);

    return res.json({ items: filtered.slice(0, k) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "추천 엔진 오류" });
  }
});

// ============================================================
// 🔥 router export
// ============================================================
module.exports = router;
