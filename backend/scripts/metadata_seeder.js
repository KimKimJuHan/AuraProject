// backend/scripts/metadata_seeder.js

require("dotenv").config({ path: '../.env' }); 
const mongoose = require("mongoose");
const axios = require("axios");
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
    "legacy", "dlc", "soundtrack", "ost", "bundle", "pack", "demo", "test", "beta", "prologue", "trailer", "server"
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
  if (name === t) score += 100;
  else if (name.includes(t)) score += 40;
  else if (t.includes(name)) score += 40;
  
  if (isBadSteamName(name)) score -= 200;
  if (data.price_overview?.final !== undefined) score += 50; 
  if (data.release_date?.date) score += 10; 
  
  return score;
}

async function findBestSteamAppId(originalAppId, title) {
  const candidates = [];
  
  const mainDetail = await getSteamDetails(originalAppId);
  if (mainDetail) candidates.push({ appId: originalAppId, data: mainDetail });

  await sleep(500); 
  const searched = await searchSteamApps(title);
  
  for (const item of searched) {
    if (item.id == originalAppId) continue;
    const d = await getSteamDetails(item.id);
    if (d) candidates.push({ appId: item.id, data: d });
  }

  if (candidates.length === 0) return null;

  const scored = candidates
    .map(c => ({ ...c, score: scoreCandidate(c.data, title) }))
    .sort((a, b) => b.score - a.score);

  return scored[0];
}

async function seedMetadata() {
  await mongoose.connect(MONGODB_URI);
  console.log("📌 DB 연결됨. 게임 목록 2000개 확보 및 갱신 시작...");

  let popular = [];
  try {
    // ★ [핵심] 2000개 요청
    const res = await axios.get(`https://api.isthereanydeal.com/stats/most-popular/v1`, {
      params: { key: ITAD_API_KEY, limit: 2000 } 
    });
    popular = res.data || [];
  } catch (e) {
    console.error("🚨 ITAD 리스트 로딩 실패");
    process.exit(1);
  }

  console.log(`🔥 ITAD 인기 게임 TOP ${popular.length}개 로딩 완료. 하나씩 검증 시작...`);
  
  let saved = 0, skipped = 0;

  for (let i = 0; i < popular.length; i++) {
    const game = popular[i];
    const title = game.title;
    const rawItadId = game.id;

    if (isBadSteamName(title)) { skipped++; continue; }

    // ★ [수정] 기존에 있어도 건너뛰지 않고 무조건 최신 정보로 갱신 시도 (Skip 로직 제거됨)
    
    let appId = null;
    try {
      const infoRes = await axios.get(`https://api.isthereanydeal.com/games/info/v2`, {
        params: { key: ITAD_API_KEY, id: rawItadId }
      });
      if (infoRes.data?.appid) appId = infoRes.data.appid;
    } catch {}

    // 앱ID가 없으면 검색 시도
    if (!appId) { 
       // ID가 없어도 findBestSteamAppId 내부에서 제목으로 검색하므로 그냥 진행
    }

    console.log(`[${i+1}/${popular.length}] 처리 중: ${title}...`);
    
    const best = await findBestSteamAppId(appId, title);
    
    if (!best) { 
        console.log(`   ❌ 스팀 매칭 실패 (제외됨)`);
        skipped++; 
    } else {
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
        console.log(`   ✅ 확인 완료: ${best.data.name} (AppID: ${best.appId})`);
    }

    // 차단 방지 딜레이
    await sleep(1500);
  }

  console.log(`\n\n🎉 시딩 완료: 총 ${saved}개 게임 확보 (매칭 실패: ${skipped}개)`);
  process.exit(0);
}

seedMetadata();