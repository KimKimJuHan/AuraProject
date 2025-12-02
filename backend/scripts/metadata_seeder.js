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
    // 스팀 검색 API
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
  if (name === t) score += 100; // 정확히 일치
  else if (name.includes(t)) score += 40;
  else if (t.includes(name)) score += 40;
  
  if (isBadSteamName(name)) score -= 200;
  if (data.price_overview?.final !== undefined) score += 50; // 가격 정보 있으면 가산점
  if (data.release_date?.date) score += 10; // 출시일 있으면 가산점
  
  return score;
}

async function findBestSteamAppId(originalAppId, title) {
  const candidates = [];
  
  // 1. ITAD가 준 ID로 먼저 조회
  const mainDetail = await getSteamDetails(originalAppId);
  if (mainDetail) candidates.push({ appId: originalAppId, data: mainDetail });

  // 2. 제목으로 스팀 검색해서 후보군 추가
  await sleep(500); // 검색 전 딜레이
  const searched = await searchSteamApps(title);
  
  for (const item of searched) {
    // 이미 찾은 거면 패스
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
  console.log("📌 DB 연결됨. 대규모 게임 목록 확보 시작...");

  let popular = [];
  try {
    // ★ [핵심 수정] 인기 게임 수집량을 2500개로 대폭 증가
    const res = await axios.get(`https://api.isthereanydeal.com/stats/most-popular/v1`, {
      params: { key: ITAD_API_KEY, limit: 2500 } 
    });
    popular = res.data || [];
  } catch (e) {
    console.error("🚨 ITAD 리스트 로딩 실패");
    process.exit(1);
  }

  console.log(`🔥 ITAD 인기 게임 TOP 2500 로딩 완료. 스팀 매칭 시작...`);
  
  let saved = 0, skipped = 0;

  // 순차 처리
  for (let i = 0; i < popular.length; i++) {
    const game = popular[i];
    const title = game.title;
    const rawItadId = game.id;

    if (isBadSteamName(title)) { skipped++; continue; }

    // 이미 DB에 있는지 확인 (중복 매칭 방지)
    const exists = await GameMetadata.findOne({ title: title });
    if (exists) {
        // console.log(`Pass: ${title}`);
        continue; 
    }

    let appId = null;
    try {
      const infoRes = await axios.get(`https://api.isthereanydeal.com/games/info/v2`, {
        params: { key: ITAD_API_KEY, id: rawItadId }
      });
      if (infoRes.data?.appid) appId = infoRes.data.appid;
    } catch {}

    if (!appId) { skipped++; continue; }

    console.log(`[${i+1}/${popular.length}] 매칭 시도: ${title}...`);
    
    const best = await findBestSteamAppId(appId, title);
    
    if (!best) { 
        console.log(`   ❌ 매칭 실패`);
        skipped++; 
    } else {
        await GameMetadata.findOneAndUpdate(
          { steamAppId: best.appId },
          {
            steamAppId: best.appId,
            title: title, // ITAD 기준 영문 제목 저장
            itad: { uuid: rawItadId },
            lastUpdated: Date.now()
          },
          { upsert: true }
        );
        saved++;
        console.log(`   ✅ 매칭 성공: ${best.data.name} (AppID: ${best.appId})`);
    }

    // ★ [핵심] 스팀 API 차단 방지를 위한 1.5초 대기
    await sleep(1500);
  }

  console.log(`\n\n🎉 메타데이터 시딩 완료: ${saved}개 저장됨 (제외됨: ${skipped})`);
  process.exit(0);
}

seedMetadata();