// backend/scripts/metadata_seeder.js

require("dotenv").config({ path: '../.env' }); // .env 경로 명시
const mongoose = require("mongoose");
const axios = require("axios");

// ★ 경로 수정됨 (../ 추가)
const GameMetadata = require("../models/GameMetadata");

const { MONGODB_URI, ITAD_API_KEY } = process.env;

if (!ITAD_API_KEY) {
  console.error("🚨 ITAD_API_KEY 누락");
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function isBadSteamName(name) {
  if (!name) return true;
  const x = name.toLowerCase();
  const badWords = [
    "legacy", "dlc", "soundtrack", "ost", "bundle", "pack", "demo", "test", "beta", "prologue", "trailer"
  ];
  return badWords.some(w => x.includes(w));
}

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

function scoreCandidate(data, originalTitle) {
  if (!data || !data.name) return -9999;
  const name = data.name.toLowerCase();
  const t = originalTitle.toLowerCase();
  let score = 0;
  if (name.includes(t)) score += 40;
  if (t.includes(name)) score += 40;
  if (isBadSteamName(name)) score -= 200;
  if (data.price_overview?.final !== undefined) score += 50;
  if (data.packages?.length > 0) score += 20;
  if (data.release_date?.date) {
    const year = parseInt(data.release_date.date.split(" ")[2]);
    if (!isNaN(year)) score += year;
  }
  return score;
}

async function findBestSteamAppId(originalAppId, title) {
  const candidates = [];
  const mainDetail = await getSteamDetails(originalAppId);
  if (mainDetail) candidates.push({ appId: originalAppId, data: mainDetail });

  const searched = await searchSteamApps(title);
  for (const item of searched) {
    const d = await getSteamDetails(item.id);
    if (d) candidates.push({ appId: item.id, data: d });
  }

  if (candidates.length === 0) return null;

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
  let saved = 0, skipped = 0;

  for (const game of popular) {
    const title = game.title;
    const rawItadId = game.id;

    if (isBadSteamName(title)) { skipped++; continue; }

    let appId = null;
    try {
      const infoRes = await axios.get(`https://api.isthereanydeal.com/games/info/v2`, {
        params: { key: ITAD_API_KEY, id: rawItadId }
      });
      if (infoRes.data?.appid) appId = infoRes.data.appid;
    } catch {}

    if (!appId) { skipped++; continue; }

    const best = await findBestSteamAppId(appId, title);
    if (!best) { skipped++; continue; }

    await GameMetadata.findOneAndUpdate(
      { steamAppId: best.appId },
      {
        steamAppId: best.appId,
        title: title,
        itad: { uuid: rawItadId },
        lastUpdated: Date.now()
      },
      { upsert: true }
    );
    saved++;
    process.stdout.write(".");
    await sleep(500);
  }

  console.log(`\n\n🎉 시딩 완료: ${saved} 저장, ${skipped} 제외`);
  process.exit(0);
}

seedMetadata();