// backend/scripts/metadata_seeder.js
// 기능: ITAD 인기 순위 기반 메타데이터 수집 (출시 예정작 원천 차단 적용)

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

// ★ [핵심] 출시 여부 판별 함수 (강력한 필터링)
function isReleasedGame(info) {
    if (!info.releaseDate) return false;

    const release = new Date(info.releaseDate);
    // 날짜 형식이 아니면 false
    if (Number.isNaN(release.getTime())) return false;

    const now = new Date();

    // 1. 최소 허용 연도 (1990년 이전 고전 게임/데이터 오류 제외)
    if (release.getFullYear() < 1990) return false;

    // 2. 미래 출시작 허용 범위 (오늘 기준 30일 뒤까지만 허용, 그 이상은 차단)
    // 글로벌 시차 등을 고려해 약간의 여유를 두되, 먼 미래 게임은 차단
    const MAX_FUTURE_ALLOW_MS = 1000 * 60 * 60 * 24 * 30; // 30일
    if (release.getTime() - now.getTime() > MAX_FUTURE_ALLOW_MS) return false;

    // 기본적으로는 현재 날짜보다 이전이어야 함
    return release <= now;
}

// [수정] HLTB 후보 필터 강화
function isHLTBCandidate(info) {
    if (!info) return false;

    // ✅ 출시된 게임만 허용
    if (!isReleasedGame(info)) return false;

    // 무료 게임 제외 (플레이타임 의미 적음)
    if (info.isFree === true) return false;

    const title = (info.title || "").toLowerCase();
    const badKeywords = [
        "online", "mmo", "idle", "focus", "tool",
        "server", "alpha", "beta", "soundtrack", "dlc"
    ];
    if (badKeywords.some(k => title.includes(k))) return false;

    if (Array.isArray(info.genres)) {
        const g = info.genres.join(' ').toLowerCase();
        if (g.includes('multiplayer') && !g.includes('single')) return false;
    }

    return true;
}

function isBadSteamName(name) {
    if (!name) return true;
    const x = name.toLowerCase();
    const badWords = [
        "legacy", "dlc", "soundtrack", "ost", "bundle", "pack", "demo", 
        "test", "beta", "prologue", "trailer", "server", "expansion", 
        "season pass", "bonus content", "artbook", "edition", "collection",
        "artwork", "pass"
    ];
    return badWords.some(w => x.includes(w));
}

async function getGameInfoFromITAD(uuid) {
    try {
        const res = await axios.get(`https://api.isthereanydeal.com/games/info/v2`, {
            params: { key: ITAD_API_KEY, id: uuid },
            timeout: 5000
        });
        return res.data;
    } catch (e) {
        if (e.response && e.response.status === 429) {
            console.warn("⚠️ API 호출 제한(Rate Limit) 감지! 5초 대기...");
            await sleep(5000);
        }
        return null;
    }
}

async function seedMetadata() {
    await mongoose.connect(MONGODB_URI);
    
    console.log(`🚀 '빈틈 채우기 & 신작 추가' 모드 시작... (Offset 0부터 다시 스캔)`);

    const TARGET_NEW_GAMES = 100; 
    const BATCH_SIZE = 50;        
    const MAX_SCAN_LIMIT = 5000;  
    
    let totalSavedThisRun = 0;    
    let currentOffset = 0;        
    let totalScanned = 0;

    try {
        while (totalSavedThisRun < TARGET_NEW_GAMES && totalScanned < MAX_SCAN_LIMIT) {
            console.log(`\n📡 ITAD 인기 순위 조회 중... (Rank ${currentOffset + 1} ~ ${currentOffset + BATCH_SIZE})`);

            let popularList = [];
            try {
                const res = await axios.get(`https://api.isthereanydeal.com/stats/most-popular/v1`, {
                    params: { key: ITAD_API_KEY, limit: BATCH_SIZE, offset: currentOffset },
                    timeout: 5000
                });
                popularList = res.data || [];
            } catch (e) {
                console.error(`❌ 목록 조회 실패 (Offset ${currentOffset}):`, e.message);
                break;
            }

            if (popularList.length === 0) break;

            const itadIds = popularList.map(item => item.id);
            const existingDocs = await GameMetadata.find({ "itad.uuid": { $in: itadIds } }).select("itad.uuid").lean();
            const existingSet = new Set(existingDocs.map(d => d.itad.uuid));

            let skipCount = 0;

            for (const item of popularList) {
                if (totalSavedThisRun >= TARGET_NEW_GAMES) break;
                totalScanned++;

                const title = item.title;

                if (isBadSteamName(title)) { skipCount++; continue; }
                if (existingSet.has(item.id)) { skipCount++; continue; }

                const info = await getGameInfoFromITAD(item.id);
                
                if (!info || !info.appid) continue;

                // ★ [핵심] 출시 예정작 원천 차단 적용
                if (!isReleasedGame(info)) {
                    continue;
                }

                await GameMetadata.findOneAndUpdate(
                    { steamAppId: info.appid },
                    {
                        steamAppId: info.appid,
                        title: info.title || title,
                        itad: { uuid: item.id },
                        releaseDate: info.releaseDate ? new Date(info.releaseDate) : undefined,
                        lastUpdated: Date.now()
                    },
                    { upsert: true, new: true }
                );
                
                totalSavedThisRun++;
                console.log(`   ✅ [${totalSavedThisRun}/${TARGET_NEW_GAMES}] 신규 저장: ${title} (AppID: ${info.appid})`);
                
                await sleep(1000); 
            }

            if (skipCount > 0) console.log(`   ⏩ ${skipCount}개 건너뜀 (중복/필터)`);

            currentOffset += BATCH_SIZE;
            if (totalSavedThisRun < TARGET_NEW_GAMES) await sleep(1500);
        }

    } catch (err) {
        console.error("🚨 프로세스 오류:", err);
    }

    console.log(`\n🎉 작업 완료! (새로 추가된 게임: ${totalSavedThisRun}개)`);
    process.exit(0);
}

seedMetadata();