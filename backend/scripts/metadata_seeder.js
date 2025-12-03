// backend/scripts/metadata_seeder.js
// 기능: ITAD 공식 API 가이드 기반 인기 게임 2000개 확보 (Most Popular -> Info -> DB)

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

// ★ [Step 2] ITAD UUID로 게임 상세 정보(스팀 AppID) 조회
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
        // 429(Too Many Requests)일 경우 로그 출력
        if (e.response && e.response.status === 429) {
            console.warn("⚠️ API 호출 제한(Rate Limit) 감지! 잠시 대기합니다...");
            await sleep(5000);
        }
        return null;
    }
}

async function seedMetadata() {
    await mongoose.connect(MONGODB_URI);
    console.log("📌 DB 연결됨. ITAD API 기반 인기 게임 확보 시작...");

    const TARGET_COUNT = 2000; // 목표 수집 개수
    const BATCH_SIZE = 100;    // 한 번에 가져올 목록 개수
    let totalProcessed = 0;
    let totalSaved = 0;

    try {
        // ★ [Step 1] 인기 게임 목록 가져오기 (Pagination)
        for (let offset = 0; offset < TARGET_COUNT; offset += BATCH_SIZE) {
            console.log(`\n📡 ITAD 인기 순위 조회 중... (${offset + 1} ~ ${offset + BATCH_SIZE}위)`);

            let popularList = [];
            try {
                const res = await axios.get(`https://api.isthereanydeal.com/stats/most-popular/v1`, {
                    params: {
                        key: ITAD_API_KEY,
                        limit: BATCH_SIZE,
                        offset: offset,
                        // 'trending' 등의 파라미터가 문서에 없다면 기본값 사용
                    },
                    timeout: 5000
                });
                popularList = res.data || []; // 응답이 배열 형태임
            } catch (e) {
                console.error(`❌ 목록 조회 실패 (Offset ${offset}):`, e.message);
                break; // 더 이상 진행 불가
            }

            if (popularList.length === 0) {
                console.log("⚠️ 더 이상 가져올 인기 게임이 없습니다.");
                break;
            }

            // 상세 정보 조회 및 저장 (순차 처리하여 Rate Limit 방지)
            for (const item of popularList) {
                const itadId = item.id;
                const title = item.title;

                if (isBadSteamName(title)) continue;

                // 이미 DB에 있는지 확인 (ITAD ID 기준)
                const exists = await GameMetadata.findOne({ "itad.uuid": itadId });
                if (exists) {
                    // 이미 있으면 업데이트 날짜만 갱신
                    await GameMetadata.updateOne({ _id: exists._id }, { lastUpdated: Date.now() });
                    // console.log(`   Pass: ${title}`);
                    continue;
                }

                // ★ [Step 2] 상세 정보 조회 (스팀 AppID 확보용)
                const info = await getGameInfoFromITAD(itadId);
                
                // 스팀 앱 ID가 있는 경우만 저장 (PC 게임이라도 스팀판이 아니면 제외)
                if (info && info.appid) {
                    await GameMetadata.findOneAndUpdate(
                        { steamAppId: info.appid },
                        {
                            steamAppId: info.appid,
                            title: info.title || title,
                            itad: { uuid: itadId }, // ★ UUID 저장 필수 (나중에 가격 조회용)
                            lastUpdated: Date.now()
                        },
                        { upsert: true }
                    );
                    totalSaved++;
                    console.log(`   ✅ [${++totalProcessed}] 저장: ${title} (SteamID: ${info.appid})`);
                } else {
                    // console.log(`   ❌ 스팀 미지원: ${title}`);
                }

                // API 호출 간격 준수 (가이드 준수)
                await sleep(1200); 
            }
            
            // 배치 사이 딜레이
            await sleep(2000);
        }

    } catch (err) {
        console.error("🚨 전체 프로세스 오류:", err);
    }

    console.log(`\n🎉 시딩 완료! 신규 저장/갱신된 게임: ${totalSaved}개`);
    process.exit(0);
}

seedMetadata();