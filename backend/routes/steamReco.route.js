/**
 * SteamReco 7.0 — Tag Fix + SteamSpy 연동 + 정확도 강화 + Strict 모드 개선
 */

const express = require("express");
const fetch = require("node-fetch");
const router = express.Router();
const UA = "SteamReco/7.0 (+GameReco)";

/* ============================================================
    🔥 한글 → Steam 영문 태그 변환 맵
============================================================ */
const TAG_MAP = {
  // 장르
  "RPG": "RPG",
  "FPS": "FPS",
  "시뮬레이션": "Simulation",
  "전략": "Strategy",
  "스포츠": "Sports",
  "레이싱": "Racing",
  "퍼즐": "Puzzle",
  "생존": "Survival",
  "공포": "Horror",

  // 시점
  "1인칭": "First-Person",
  "3인칭": "Third-Person",

  // 그래픽
  "픽셀 그래픽": "Pixel Graphics",
  "2D": "2D",
  "3D": "3D",
  "만화 같은": "Cartoon",
  "현실적": "Realistic",

  // 테마
  "판타지": "Fantasy",
  "공상과학": "Sci-fi",
  "중세": "Medieval",
  "현대": "Modern",
  "우주": "Space",
  "좀비": "Zombies",
  "사이버펑크": "Cyberpunk",
  "마법": "Magic",
  "전쟁": "War",

  // 특징
  "오픈 월드": "Open World",
  "자원관리": "Resource Management",
  "스토리 중심": "Story Rich",
  "선택의 중요성": "Choices Matter",
  "캐릭터 커스터마이즈": "Character Customization",
  "협동 캠페인": "Co-op Campaign",
};
/* ============================================================
    🔥 SteamSpy API — 태그별 게임 리스트 가져오기
============================================================ */
async function fetchSteamSpyByTag(engTag) {
  try {
    const url = `https://steamspy.com/api.php?request=tag&tag=${encodeURIComponent(
      engTag
    )}`;
    const res = await fetch(url);
    const json = await res.json();
    return Object.values(json); // [{appid, name, score_rank, owners, players}]
  } catch (err) {
    console.error("SteamSpy Error:", err);
    return [];
  }
}

/* ============================================================
    🔥 Steam 상세 정보 — 태그 + 가격 + 이미지
============================================================ */
async function fetchSteamDetails(appid) {
  try {
    const url = `https://store.steampowered.com/api/appdetails?appids=${appid}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
    });
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

/* ============================================================
    🔥 두 개의 태그 리스트(Spy + Details)를 합쳐서 Set으로 만들기
============================================================ */
function buildTagSet(detail) {
  const tags = new Set();

  // Steam Store Tags
  if (detail.tags) detail.tags.forEach((t) => tags.add(t.toLowerCase()));

  // Genres
  if (detail.genres)
    detail.genres.forEach((g) => tags.add(g.toLowerCase()));

  // Categories
  if (detail.categories)
    detail.categories.forEach((c) => tags.add(c.toLowerCase()));

  return tags;
}

/* ============================================================
    🔥 태그 정확도 계산 (개선된 버전)
============================================================ */
function calcTagScore(tagSet, userTagsEng) {
  if (userTagsEng.length === 0) return 0;

  let hit = 0;
  for (const t of userTagsEng) {
    if (tagSet.has(t.toLowerCase())) hit++;
  }

  return (hit / userTagsEng.length) * 100;
}
/* ============================================================
    🔥 종합 점수 계산
    - 태그 정확도 50%
    - 평점(score_rank) 30%
    - 동접자(players) 10%
    - 구매자(owners) 10%
============================================================ */
function calcFinalScore(game, tagScore) {
  const ratingScore = game.score_rank
    ? 100 - Number(game.score_rank)
    : 50;

  const owners = game.owners?.split(" .. ")[1] || 0;
  const ownersNum = Number(owners);
  const ownersScore = Math.min(100, ownersNum / 20000);

  const players = Number(game.players) || 0;
  const playersScore = Math.min(100, players / 50);

  return (
    tagScore * 0.50 +
    ratingScore * 0.30 +
    playersScore * 0.10 +
    ownersScore * 0.10
  );
}

/* ============================================================
    🔥 숨은 명작 판정
============================================================ */
function isHiddenGem(game) {
  const rating = game.score_rank ? 100 - game.score_rank : 0;
  const players = Number(game.players) || 0;

  return (
    rating >= 85 &&     // 평점 높고
    players < 200 &&    // 동접자 낮고
    players > 10        // 사람이 너무 없는 게임은 제외
  );
}

/* ============================================================
    🔥 추천 엔진 본체
============================================================ */
router.post("/reco", async (req, res) => {
  try {
    const { term = "", liked = [], strict = false, k = 12 } = req.body;

    if (!liked || liked.length === 0) {
      return res.json({ items: [] });
    }

    /* 🔥 한글 → 영문 태그 변환 */
    const likedEng = liked
      .map((t) => TAG_MAP[t])
      .filter(Boolean); // 매칭 실패 제거

    /* ======================================================
         1) SteamSpy 태그 기반 후보 게임 가져오기
       ====================================================== */
    let spyGames = [];
    for (const eng of likedEng) {
      const list = await fetchSteamSpyByTag(eng);
      spyGames.push(...list);
    }

    // 중복 제거
    const uniq = new Map();
    spyGames.forEach((g) => uniq.set(g.appid, g));
    spyGames = Array.from(uniq.values());

    /* 🔍 검색어 필터 */
    const q = term.trim().toLowerCase();
    if (q) {
      spyGames = spyGames.filter((g) =>
        g.name?.toLowerCase().includes(q)
      );
    }

    if (spyGames.length === 0) {
      return res.json({ items: [] });
    }

    /* ======================================================
         2) Steam Store 상세 정보 + 태그 세트 빌드
       ====================================================== */
    const result = [];

    for (const g of spyGames.slice(0, 120)) {
      const detail = await fetchSteamDetails(g.appid);
      if (!detail) continue;

      // 태그 세트 생성 (store 태그 + 장르 + 카테고리)
      const tagSet = buildTagSet(detail);

      // 태그 정확도 계산 (강화된 버전)
      const tagScore = calcTagScore(tagSet, likedEng);

      // strict 모드 → 태그 정확도 60점 미만 제외
      if (strict && tagScore < 60) continue;

      const finalScore = calcFinalScore(g, tagScore);

      result.push({
        appid: g.appid,
        name: detail.name || g.name,
        thumb: detail.thumb,
        price: detail.price,
        owners: g.owners,
        players: g.players,
        score_rank: g.score_rank,
        score: Math.round(finalScore),
        hiddenGem: isHiddenGem(g),
      });
    }

    /* 태그 문제 방지 — 태그 점수 없는 게임 절대 포함 X */
    const filtered = result.filter((x) => x.score > 10);

    /* 점수 높은 순으로 정렬 */
    filtered.sort((a, b) => b.score - a.score);

    return res.json({
      items: filtered.slice(0, k),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "추천 엔진 오류" });
  }
});
/* ============================================================
    🔥 마지막: 라우터 export
============================================================ */

module.exports = router;
