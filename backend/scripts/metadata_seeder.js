// backend/scripts/metadata_seeder.js
// 기능: ITAD 대량 수집 + 중복 제거 + 특수문자 검색 보정

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

// ★ [핵심] 검색어 정제 (S.T.A.L.K.E.R. -> STALKER)
function cleanTitleForSearch(title) {
    return title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

async function searchSteamApps(term) {
  try {
    const res = await axios.get(
      `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=english&cc=us`
    );
    if (!res.data?.items) return [];
    return res.data.items.filter(item => !isBadSteamName(item.name));
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
  const cleanName = cleanTitleForSearch(name);
  const cleanT = cleanTitleForSearch(t);

  let score = 0;
  if (name === t) score += 100;
  else if (cleanName === cleanT) score += 95; 
  else if (name.includes(t)) score += 40;
  else if (t.includes(name)) score += 40;
  
  if (isBadSteamName(name)) score -= 200;
  if (data.price_overview?.final !== undefined) score += 50; 
  if (data.release_date?.date) score += 10; 
  
  return score;
}

async function findBestSteamAppId(originalAppId, title) {
  const candidates = [];
  
  // 1. ITAD ID 조회
  const mainDetail = await getSteamDetails(originalAppId);
  if (mainDetail) candidates.push({ appId: originalAppId, data: mainDetail });

  await sleep(500); 
  
  // 2. 제목 검색
  let searched = await searchSteamApps(title);
  
  // 3. ★ [핵심] 검색 실패 시 특수문자 제거 후 재검색
  if (searched.length === 0) {
      const cleanTitle = cleanTitleForSearch(title);
      if (cleanTitle !== title && cleanTitle.length > 2) {
          // console.log(`   [Retry] "${title}" -> "${cleanTitle}"`);
          await sleep(500);
          searched = await searchSteamApps(cleanTitle);
      }
  }

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
  console.log("📌 DB 연결됨. 게임 목록 확보 시작...");

  let rawList = [];
  const TOTAL_LIMIT = 2000; // 목표 수집 개수
  const PAGE_SIZE = 100; 

  try {
    for (let offset = 0; offset < TOTAL_LIMIT; offset += PAGE_SIZE) {
        console.log(`📡 ITAD 목록 가져오는 중... (${offset} ~ ${offset + PAGE_SIZE})`);
        
        const res = await axios.get(`https://api.isthereanydeal.com/stats/most-popular/v1`, {
            params: { 
                key: ITAD_API_KEY, 
                results: PAGE_SIZE, 
                offset: offset      
            }
        });

        const items = res.data || [];
        if (items.length === 0) break; 
        rawList = rawList.concat(items);
        
        await sleep(1000); 
    }
  } catch (e) {
    console.error("🚨 ITAD 리스트 로딩 실패:", e.message);
    process.exit(1);
  }

  // ★ [핵심] 중복 제거 로직 (Set 사용)
  const popular = [];
  const seenTitles = new Set();
  
  for (const item of rawList) {
      if (!seenTitles.has(item.title)) {
          seenTitles.add(item.title);
          popular.push(item);
      }
  }

  console.log(`🔥 중복 제거 후 ${popular.length}개 게임 확보. 스팀 매칭 시작...`);
  
  let saved = 0, skipped = 0, existsCount = 0;

  for (let i = 0; i < popular.length; i++) {
    const game = popular[i];
    const title = game.title;
    const rawItadId = game.id;

    if (isBadSteamName(title)) { skipped++; continue; }

    const exists = await GameMetadata.findOne({ title: title });
    if (exists) {
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

    await sleep(1500);
  }

  console.log(`\n\n🎉 시딩 완료: ${saved}개 신규 저장 (이미 존재: ${existsCount}개, 제외됨: ${skipped}개)`);
  process.exit(0);
}

seedMetadata();