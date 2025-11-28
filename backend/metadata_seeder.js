/**
 * metadata_seeder.js (완전 개정판)
 * 역할:
 *  - ITAD 인기 게임 300개 가져오기
 *  - Steam AppID 후보 찾기
 *  - DLC/Legacy/패키지 제거
 *  - 검증/스코어링 후 "메인 게임"을 자동 선택
 */

require("dotenv").config();
const mongoose = require("mongoose");
const axios = require("axios");
const GameMetadata = require("./models/GameMetadata");

const { MONGODB_URI, ITAD_API_KEY } = process.env;

if (!ITAD_API_KEY) {
  console.error("🚨 ITAD_API_KEY 누락");
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * ❗ 스팀 이름 필터
 *    DLC, Legacy, Demo, Pack, Bundle 등 제거
 */
function isBadSteamName(name) {
  if (!name) return true;
  const x = name.toLowerCase();
  const badWords = [
    "legacy",
    "dlc",
    "soundtrack",
    "ost",
    "bundle",
    "pack",
    "demo",
    "test",
    "beta",
    "prologue",
    "trailer"
  ];
  return badWords.some(w => x.includes(w));
}

/**
 * ❗ Steam Search 후보 가져오기
 */
async function searchSteamApps(term) {
  try {
    const res = await axios.get(
      `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=english&cc=us`
    );
    if (!res.data?.items) return [];

    return res.data.items
      .filter(item => item.type === "game")
      .filter(item => !isBadSteamName(item.name));
  } catch (e) {
    return [];
  }
}

/**
 * ❗ Steam App ID 상세 정보 가져오기
 */
async function getSteamDetails(appId) {
  try {
    const res = await axios.get("https://store.steampowered.com/api/appdetails", {
      params: { appids: appId, l: "english", cc: "us" }
    });

    const d = res.data?.[appId];
    if (!d || !d.success) return null;
    const data = d.data;

    if (data.type !== "game") return null;
    return data;
  } catch (e) {
    return null;
  }
}

/**
 * 🎯 후보 스코어링 알고리즘
 */
function scoreCandidate(data, originalTitle) {
  if (!data || !data.name) return -9999;

  const name = data.name.toLowerCase();
  const t = originalTitle.toLowerCase();

  let score = 0;

  // 제목 유사도 (부분 포함)
  if (name.includes(t)) score += 40;
  if (t.includes(name)) score += 40;

  // Legacy 제거 효과
  if (isBadSteamName(name)) score -= 200;

  // 가격 정보 = 판매 중
  if (data.price_overview?.final !== undefined) score += 50;

  // 패키지라도 있으면 가점
  if (data.packages?.length > 0) score += 20;

  // 최신 릴리즈일수록 가점
  if (data.release_date?.date) {
    const year = parseInt(data.release_date.date.split(" ")[2]);
    if (!isNaN(year)) score += year;
  }

  return score;
}

/**
 * 🎯 메인 함수: 최적의 Steam AppID 선택
 */
async function findBestSteamAppId(originalAppId, title) {
  const candidates = [];

  // 1) ITAD가 준 AppID → 검증해보고 괜찮으면 후보
  const mainDetail = await getSteamDetails(originalAppId);
  if (mainDetail) candidates.push({ appId: originalAppId, data: mainDetail });

  // 2) Steam Search 결과들 후보 추가
  const searched = await searchSteamApps(title);
  for (const item of searched) {
    const d = await getSteamDetails(item.id);
    if (d) candidates.push({ appId: item.id, data: d });
  }

  if (candidates.length === 0) return null;

  // 3) 스코어링
  const scored = candidates
    .map(c => ({
      ...c,
      score: scoreCandidate(c.data, title)
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  console.log(`\n🎯 Steam Best Pick: ${best.data.name} (${best.appId}) | Score=${best.score}`);
  return best;
}

/**
 * 🎯 메타데이터 시딩 (메인)
 */
async function seedMetadata() {
  await mongoose.connect(MONGODB_URI);
  console.log("📌 DB 연결됨. ITAD → Steam AppID 동적 최적화 시작...");

  let popular = [];
  try {
    const res = await axios.get(`https://api.isthereanydeal.com/stats/most-popular/v1`, {
      params: { key: ITAD_API_KEY, limit: 300 }
    });
    popular = res.data || [];
  } catch (e) {
    console.error("🚨 ITAD 불러오기 실패");
    process.exit(1);
  }

  console.log(`🔥 ITAD 인기 게임 ${popular.length}개 가져옴`);
  let saved = 0,
    skipped = 0;

  for (const game of popular) {
    const title = game.title;
    const rawItadId = game.id;

    // 제목에서 Legacy 계열 먼저 필터링
    if (isBadSteamName(title)) {
      skipped++;
      continue;
    }

    // ITAD → Steam AppID 가져오기
    let appId = null;
    try {
      const infoRes = await axios.get(`https://api.isthereanydeal.com/games/info/v2`, {
        params: { key: ITAD_API_KEY, id: rawItadId }
      });

      if (infoRes.data?.appid) appId = infoRes.data.appid;
    } catch {}

    if (!appId) {
      skipped++;
      continue;
    }

    // Steam 최적 후보 검색
    const best = await findBestSteamAppId(appId, title);
    if (!best) {
      skipped++;
      continue;
    }

    // DB 저장
    await GameMetadata.findOneAndUpdate(
      { steamAppId: best.appId },
      {
        steamAppId: best.appId,
        title: title, // 정제된 ITAD 제목 (HLTB 검색용)
        itad: { uuid: rawItadId },
        lastUpdated: Date.now()
      },
      { upsert: true }
    );

    saved++;
    process.stdout.write(".");
    await sleep(500);
  }

  console.log(`\n\n🎉 시딩 완료`);
  console.log(`  ➕ 저장됨: ${saved}`);
  console.log(`  ➖ 제외됨: ${skipped}`);
  process.exit(0);
}

seedMetadata();
