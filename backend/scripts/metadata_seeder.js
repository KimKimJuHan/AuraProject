// backend/scripts/metadata_seeder.js
// 기능: ITAD 인기 순위 기반 메타데이터 추가 수집 (일일 100개 제한 + 이어하기 기능)

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

// 불필요한 게임 필터링
function isBadSteamName(name) {
    if (!name) return true;
    const x = name.toLowerCase();
    const badWords = [
        "legacy", "dlc", "soundtrack", "ost", "bundle", "pack", "demo", 
        "test", "beta", "prologue", "trailer", "server", "expansion", 
        "season pass", "bonus content", "artbook", "edition", "collection"
    ];
    return badWords.some(w => x.includes(w));
}

// ITAD UUID로 게임 상세 정보(스팀 AppID) 조회
async function getGameInfoFromITAD(uuid) {
    try {
        const res = await axios.get(`https://api.isthereanydeal.com/games/info/v2`, {
            params: {
                key: ITAD_API_KEY,
                id: uuid
            },
            timeout: 5000
        });
        return res.data;
    } catch (e) {
        if (e.response && e.response.status === 429) {
            console.warn("⚠️ API 호출 제한(Rate Limit) 감지! 잠시 대기합니다...");
            await sleep(5000);
        }
        return null;
    }
}

async function seedMetadata() {
    await mongoose.connect(MONGODB_URI);
    
    // ★ [1] 현재 DB 상태 확인 (이어하기 기능)
    const currentCount = await GameMetadata.countDocuments();
    console.log(`📌 DB 연결됨. 현재 저장된 게임 수: ${currentCount}개`);
    console.log(`🚀 '매일 100개 추가' 모드 시작... (Offset: ${currentCount}부터 시작)`);

    const TARGET_NEW_GAMES = 100; // 목표: 신규 게임 100개 저장
    const BATCH_SIZE = 50;        // API 요청 단위
    
    let totalSavedThisRun = 0;    // 이번 실행에서 저장한 신규 게임 수
    let currentOffset = currentCount; // DB에 있는 수만큼 건너뛰고 시작

    try {
        while (totalSavedThisRun < TARGET_NEW_GAMES) {
            console.log(`\n📡 ITAD 인기 순위 조회 중... (Rank ${currentOffset + 1} ~ ${currentOffset + BATCH_SIZE})`);

            let popularList = [];
            try {
                const res = await axios.get(`https://api.isthereanydeal.com/stats/most-popular/v1`, {
                    params: {
                        key: ITAD_API_KEY,
                        limit: BATCH_SIZE,
                        offset: currentOffset,
                    },
                    timeout: 5000
                });
                popularList = res.data || [];
            } catch (e) {
                console.error(`❌ 목록 조회 실패 (Offset ${currentOffset}):`, e.message);
                break;
            }

            if (popularList.length === 0) {
                console.log("⚠️ 더 이상 가져올 인기 게임이 없습니다. (리스트 끝 도달)");
                break;
            }

            // 목록 순회
            for (const item of popularList) {
                // 목표 달성 시 즉시 종료
                if (totalSavedThisRun >= TARGET_NEW_GAMES) break;

                const itadId = item.id;
                const title = item.title;

                if (isBadSteamName(title)) continue;

                // ★ [2] 이미 DB에 있는지 확인 (중복 건너뛰기)
                const exists = await GameMetadata.exists({ "itad.uuid": itadId });
                if (exists) {
                    // 이미 있으면 스킵 (API 호출 아끼기 위해 업데이트도 생략하거나 필요시 lastUpdated만 갱신)
                    // console.log(`   ⏩ Skip: ${title} (이미 존재)`);
                    continue;
                }

                // ★ [3] 신규 게임 상세 정보 조회
                const info = await getGameInfoFromITAD(itadId);
                
                // 스팀 앱 ID가 있는 경우만 저장
                if (info && info.appid) {
                    // 혹시 SteamID로 중복된게 있는지 최종 확인 (upsert)
                    await GameMetadata.findOneAndUpdate(
                        { steamAppId: info.appid },
                        {
                            steamAppId: info.appid,
                            title: info.title || title,
                            itad: { uuid: itadId },
                            lastUpdated: Date.now()
                        },
                        { upsert: true, new: true }
                    );
                    
                    totalSavedThisRun++;
                    console.log(`   ✅ [${totalSavedThisRun}/${TARGET_NEW_GAMES}] 신규 저장: ${title} (SteamID: ${info.appid})`);
                    
                    // API 호출 간격 준수
                    await sleep(1200); 
                } else {
                    // console.log(`   ❌ 스팀 미지원: ${title}`);
                }
            }

            // 다음 배치를 위해 오프셋 증가
            currentOffset += BATCH_SIZE;
            
            // 목표를 아직 못 채웠다면 배치 사이 딜레이
            if (totalSavedThisRun < TARGET_NEW_GAMES) {
                await sleep(2000);
            }
        }

    } catch (err) {
        console.error("🚨 프로세스 오류:", err);
    }

    console.log(`\n🎉 작업 완료!`);
    console.log(`   - 기존 게임 수: ${currentCount}`);
    console.log(`   - 추가된 게임 수: ${totalSavedThisRun}`);
    console.log(`   - 최종 게임 수: ${currentCount + totalSavedThisRun}`);
    
    process.exit(0);
}

seedMetadata();