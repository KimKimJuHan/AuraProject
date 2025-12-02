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
  console.log("📌 DB 연결됨. 게임 목록 2000개 확보 시작 (분할 요청)...");

  let popular = [];
  const TOTAL_LIMIT = 2000;
  const PAGE_SIZE = 100; // ITAD API 최대 한도

  try {
    // ★ [핵심 수정] 100개씩 반복해서 가져오기 (Pagination)
    for (let offset = 0; offset < TOTAL_LIMIT; offset += PAGE_SIZE) {
        console.log(`📡 ITAD 목록 가져오는 중... (${offset} ~ ${offset + PAGE_SIZE})`);
        
        const res = await axios.get(`https://api.isthereanydeal.com/stats/most-popular/v1`, {
            params: { 
                key: ITAD_API_KEY, 
                results: PAGE_SIZE, // limit 대신 results 사용
                offset: offset      // 페이지 넘김
            }
        });

        const items = res.data || [];
        if (items.length === 0) break; // 더 이상 없으면 종료
        popular = popular.concat(items);
        
        await sleep(1000); // API 부하 방지
    }
  } catch (e) {
    console.error("🚨 ITAD 리스트 로딩 실패:", e.message);
    process.exit(1);
  }

  console.log(`🔥 ITAD 인기 게임 총 ${popular.length}개 확보 완료. 스팀 매칭 시작...`);
  
  let saved = 0, skipped = 0, existsCount = 0;

  for (let i = 0; i < popular.length; i++) {
    const game = popular[i];
    const title = game.title;
    const rawItadId = game.id;

    if (isBadSteamName(title)) { skipped++; continue; }

    // 이미 DB에 있는 게임은 건너뜀 (중복 방지 및 속도 향상)
    const exists = await GameMetadata.findOne({ title: title });
    if (exists) {
        // console.log(`Pass: ${title}`);
        existsCount++;
        continue; 
    }

    let appId = null;
    try {
      const infoRes = await axios.get(`https://api.isthereanydeal.com/games/info/v2`, {
        params: { key: ITAD_API_KEY, id: rawItadId }
      });
      if (infoRes.data?.appid) appId = infoRes.data.appid;
    } catch {}

    if (!appId && !title) { skipped++; continue; }

    console.log(`[${i+1}/${popular.length}] 신규 발견: ${title}...`);
    
    const best = await findBestSteamAppId(appId, title);
    
    if (!best) { 
        console.log(`   ❌ 매칭 실패`);
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
        console.log(`   ✅ 저장 성공: ${best.data.name} (AppID: ${best.appId})`);
    }

    // 스팀 API 차단 방지 딜레이
    await sleep(1500);
  }

  console.log(`\n\n🎉 시딩 완료: ${saved}개 신규 저장 (이미 존재: ${existsCount}개, 실패/제외: ${skipped}개)`);
  process.exit(0);
}

seedMetadata();