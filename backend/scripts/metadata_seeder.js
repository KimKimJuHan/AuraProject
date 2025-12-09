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

/** 🚫 저품질 이름 필터 */
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

/** 🎯 HLTB 대상 여부 판단 */
function isHLTBCandidate(info) {
    if (!info) return false;

    // F2P / 온라인 전용 제외
    if (info.isFree) return false;

    const title = (info.title || "").toLowerCase();
    const badKeywords = [
        "online", "mmo", "idle", "focus", "tool",
        "simulator server", "alpha", "beta"
    ];
    if (badKeywords.some(k => title.includes(k))) return false;

    // 장르 기반 필터 (있을 때만)
    if (Array.isArray(info.genres)) {
        const genreText = info.genres.join(' ').toLowerCase();
        if (genreText.includes('multiplayer') && !genreText.includes('single')) {
            return false;
        }
    }

    // 출시 전 또는 연도 없음
    if (!info.releaseDate) return false;

    return true;
}

/** ITAD UUID → 게임 상세 */
async function getGameInfoFromITAD(uuid) {
    try {
        const res = await axios.get(
            `https://api.isthereanydeal.com/games/info/v2`,
            {
                params: { key: ITAD_API_KEY, id: uuid },
                timeout: 5000
            }
        );
        return res.data;
    } catch {
        return null;
    }
}

async function seedMetadata() {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ DB 연결됨. 메타데이터 시딩 시작");

    const TARGET_NEW_GAMES = 100;
    const BATCH_SIZE = 50;
    const MAX_SCAN_LIMIT = 5000;

    let currentOffset = 0;
    let totalSaved = 0;
    let totalScanned = 0;

    while (totalSaved < TARGET_NEW_GAMES && totalScanned < MAX_SCAN_LIMIT) {
        const res = await axios.get(
            `https://api.isthereanydeal.com/stats/most-popular/v1`,
            {
                params: { key: ITAD_API_KEY, limit: BATCH_SIZE, offset: currentOffset },
                timeout: 5000
            }
        );

        const popularList = res.data || [];
        if (popularList.length === 0) break;

        const itadIds = popularList.map(i => i.id);
        const existing = await GameMetadata.find({ "itad.uuid": { $in: itadIds } })
            .select("itad.uuid")
            .lean();
        const existingSet = new Set(existing.map(d => d.itad.uuid));

        for (const item of popularList) {
            if (totalSaved >= TARGET_NEW_GAMES) break;
            totalScanned++;

            if (existingSet.has(item.id)) continue;
            if (isBadSteamName(item.title)) continue;

            const info = await getGameInfoFromITAD(item.id);
            if (!info || !info.appid) continue;

            const playtimeCandidate = isHLTBCandidate(info);

            await GameMetadata.findOneAndUpdate(
                { steamAppId: info.appid },
                {
                    steamAppId: info.appid,
                    title: info.title || item.title,
                    itad: { uuid: item.id },
                    playtime_candidate: playtimeCandidate,
                    lastUpdated: Date.now()
                },
                { upsert: true }
            );

            totalSaved++;
            console.log(
                `✅ [${totalSaved}/${TARGET_NEW_GAMES}] ${info.title} | HLTB대상=${playtimeCandidate}`
            );

            await sleep(1000);
        }

        currentOffset += BATCH_SIZE;
        await sleep(1500);
    }

    console.log("\n🎉 시딩 완료");
    console.log(`- 스캔: ${totalScanned}`);
    console.log(`- 신규 저장: ${totalSaved}`);
    process.exit(0);
}

seedMetadata();
