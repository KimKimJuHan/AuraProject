// backend/scripts/metadata_seeder.js
// 기능: ITAD 인기 순위 기반 메타데이터 추가 수집 (수정됨: 상위권 빈틈 채우기 로직)

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

// 불필요한 게임 필터링 (확장됨)
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

// ITAD UUID로 게임 상세 정보(스팀 AppID) 조회
async function getGameInfoFromITAD(uuid) {
    try {
        // v2 info 엔드포인트는 ID 포맷이 중요함. 실패 시 null 반환
        const res = await axios.get(`https://api.isthereanydeal.com/games/info/v2`, {
            params: {
                key: ITAD_API_KEY,
                id: uuid // API 문석에 따라 id 혹은 ids 확인 필요, 보통 v2는 id 지원
            },
            timeout: 5000
        });
        return res.data;
    } catch (e) {
        if (e.response && e.response.status === 429) {
            console.warn("⚠️ API 호출 제한(Rate Limit) 감지! 5초 대기...");
            await sleep(5000);
        } else {
            // console.warn(`   ⚠️ 상세 조회 실패 (${uuid}): ${e.message}`);
        }
        return null;
    }
}

async function seedMetadata() {
    await mongoose.connect(MONGODB_URI);
    
    const currentCount = await GameMetadata.countDocuments();
    console.log(`📌 DB 연결됨. 현재 저장된 게임 수: ${currentCount}개`);
    
    // ★ [핵심 수정] 항상 0부터 시작해야 '새로 인기 순위에 진입한 게임'을 잡을 수 있음
    console.log(`🚀 '빈틈 채우기 & 신작 추가' 모드 시작... (Offset 0부터 다시 스캔)`);

    const TARGET_NEW_GAMES = 100; // 목표: 신규 게임 100개 저장
    const BATCH_SIZE = 50;        // API 요청 단위
    const MAX_SCAN_LIMIT = 5000;  // 무한루프 방지: 인기순위 5000등까지만 확인
    
    let totalSavedThisRun = 0;    
    let currentOffset = 0;        // ★ 0으로 초기화
    let totalScanned = 0;

    try {
        while (totalSavedThisRun < TARGET_NEW_GAMES && totalScanned < MAX_SCAN_LIMIT) {
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
                console.log("⚠️ 더 이상 가져올 인기 게임이 없습니다.");
                break;
            }

            // ★ [최적화] 이번 배치의 UUID들을 뽑아서 DB에 있는지 한 번에 검사 (Batch Check)
            const itadIds = popularList.map(item => item.id);
            const existingDocs = await GameMetadata.find({ "itad.uuid": { $in: itadIds } }).select("itad.uuid").lean();
            const existingSet = new Set(existingDocs.map(d => d.itad.uuid));

            let skipCount = 0;

            // 목록 순회
            for (const item of popularList) {
                if (totalSavedThisRun >= TARGET_NEW_GAMES) break;
                totalScanned++;

                const itadId = item.id;
                const title = item.title;

                // 1. 이름 필터링
                if (isBadSteamName(title)) {
                    // console.log(`   ⏩ 필터링됨: ${title}`);
                    skipCount++;
                    continue;
                }

                // 2. 이미 DB에 있다면 스킵
                if (existingSet.has(itadId)) {
                    skipCount++;
                    continue;
                }

                // 3. 신규 게임 발견! 상세 정보 조회
                const info = await getGameInfoFromITAD(itadId);
                
                // 스팀 앱 ID가 있고, 이름이 유효한 경우 저장
                if (info && info.appid) {
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
                    console.log(`   ✅ [${totalSavedThisRun}/${TARGET_NEW_GAMES}] 신규 저장: ${title} (AppID: ${info.appid})`);
                    
                    // API 호출 간격 준수 (너무 빠르면 차단됨)
                    await sleep(1000); 
                } else {
                    // console.log(`   ❌ 스팀 미지원/정보 없음: ${title}`);
                }
            }

            if (skipCount > 0) {
                console.log(`   ⏩ ${skipCount}개 게임은 이미 존재하거나 필터링되어 건너뜁니다.`);
            }

            // 다음 배치
            currentOffset += BATCH_SIZE;
            
            // 목표 미달성 시 딜레이
            if (totalSavedThisRun < TARGET_NEW_GAMES) {
                await sleep(1500);
            }
        }

    } catch (err) {
        console.error("🚨 프로세스 오류:", err);
    }

    console.log(`\n🎉 작업 완료!`);
    console.log(`   - 스캔한 게임 수: ${totalScanned}`);
    console.log(`   - 새로 추가된 게임: ${totalSavedThisRun}`);
    console.log(`   - 현재 DB 총 게임 수: ${await GameMetadata.countDocuments()}`);
    
    process.exit(0);
}

seedMetadata();