// backend/metadata_seeder.js (최종: 판매/다운로드 가능 여부 검증 추가)

require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const GameMetadata = require('./models/GameMetadata');

const { MONGODB_URI, ITAD_API_KEY } = process.env;

if (!ITAD_API_KEY) { console.error("🚨 ITAD_API_KEY가 없습니다."); process.exit(1); }

// 수동 오버라이드 (필요 시 유지)
const MANUAL_OVERRIDES = [
    { id: 271590, title: "Grand Theft Auto V", itad: "game_v2_f80169116c4f877f24022421713d6d03f0b21a8d" },
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ★ [검증 함수] 스팀 상점에서 실제 판매/다운로드 가능한지 확인
async function verifySteamStore(appId) {
    try {
        // 필터를 사용하여 데이터 전송량 최소화 (기본정보, 가격, 출시일)
        const res = await axios.get(`https://store.steampowered.com/api/appdetails`, {
            params: { appids: appId, filters: 'basic,price_overview,release_date', cc: 'kr' }
        });
        
        const data = res.data[appId];

        // 1. 상점 페이지 존재 여부 확인
        if (!data || !data.success) {
            // console.log(`   ❌ [Steam] 상점 페이지 없음 (${appId})`);
            return false;
        }

        const details = data.data;

        // 2. '게임' 본편인지 확인 (DLC, 사운드트랙 등 제외)
        if (details.type !== 'game') {
            // console.log(`   ⚠️ [Steam] 게임이 아님 (${details.type})`);
            return false;
        }

        // 3. 판매 중(가격 있음) 또는 무료 게임인지 확인
        // GTA 5 Legacy 같은 경우 price_overview가 없고 is_free도 false임 -> 걸러짐
        const isPlayable = details.is_free === true || (details.price_overview && details.price_overview.final !== undefined);
        
        // (선택) 출시 예정작 포함 여부: 출시 예정작은 가격이 없을 수 있음.
        // 여기서는 "다운로드 할 수 있는" 게임을 원하셨으므로 출시 예정작도 가격 없으면 제외됩니다.
        // 만약 출시 예정작도 포함하고 싶다면 details.release_date.coming_soon 체크를 추가하세요.

        if (!isPlayable) {
            // console.log(`   🚫 [Steam] 구매/다운로드 불가 (${details.name})`);
            return false;
        }

        return details.name; // 검증 성공 시 스팀 제목 반환 (참고용)

    } catch (e) {
        // API 오류 시 일단 보수적으로 패스 (혹은 재시도 로직)
        return false;
    }
}

async function seedMetadata() {
    if (!MONGODB_URI) { console.error("❌ DB URI 없음"); process.exit(1); }
    
    await mongoose.connect(MONGODB_URI);
    console.log("✅ DB 연결됨. ITAD 및 Steam 검증을 통한 족보 갱신 시작...");

    // 1. 수동 데이터 등록
    for (const manual of MANUAL_OVERRIDES) {
        await GameMetadata.findOneAndUpdate({ steamAppId: manual.id }, {
            steamAppId: manual.id,
            title: manual.title,
            itad: { uuid: manual.itad, manualOverride: true },
            lastUpdated: Date.now()
        }, { upsert: true });
    }

    // 2. ITAD 인기 게임 조회
    try {
        console.log("🚀 ITAD 인기 게임 리스트 조회 중...");
        const popularRes = await axios.get(`https://api.isthereanydeal.com/stats/most-popular/v1`, {
            params: { key: ITAD_API_KEY, limit: 200 } // 검증 과정에서 많이 걸러지므로 넉넉하게 조회
        });
        const popularList = popularRes.data || [];
        
        console.log(`📦 후보 ${popularList.length}개 확보. Steam 교차 검증 시작...`);

        let count = 0;
        let skipped = 0;

        for (const game of popularList) {
            // 1차 필터: 제목 키워드 (Legacy 등 명시적 제외)
            const titleLower = game.title.toLowerCase();
            if (titleLower.includes('legacy') || 
                titleLower.includes('soundtrack') || 
                titleLower.includes(' artbook') ||
                titleLower.includes(' pack') ||
                titleLower.includes(' dlc')) {
                skipped++;
                continue;
            }

            // 이미 수동 등록된 게임은 건너뜀
            const exists = await GameMetadata.findOne({ 'itad.uuid': game.id });
            if (exists && exists.itad.manualOverride) continue;

            // API 속도 조절 (Steam API 제한 고려)
            await sleep(800); 

            try {
                // ITAD 상세 정보 조회 (스팀 ID 확보용)
                const infoRes = await axios.get(`https://api.isthereanydeal.com/games/info/v2`, {
                    params: { key: ITAD_API_KEY, id: game.id } 
                });

                const foundGame = infoRes.data;
                const steamAppId = foundGame?.appid; 
                const itadUuid = foundGame?.id;
                const itadTitle = foundGame?.title; // 깔끔한 영어 제목
                
                if (steamAppId && itadUuid) {
                    // ★ 2차 필터: Steam 상점 검증 (판매중/무료 여부 확인)
                    const steamName = await verifySteamStore(steamAppId);
                    
                    if (steamName) {
                        // 검증 통과 시 DB 저장
                        // 제목은 ITAD의 깔끔한 영어 제목을 우선 저장 (HLTB 검색용)
                        await GameMetadata.findOneAndUpdate({ steamAppId }, {
                            steamAppId: steamAppId,
                            title: itadTitle, 
                            itad: { uuid: itadUuid },
                            lastUpdated: Date.now()
                        }, { upsert: true });
                        
                        process.stdout.write(`.`); // 성공
                        count++;
                    } else {
                        process.stdout.write(`x`); // 검증 실패 (판매 안함 등)
                        skipped++;
                    }
                }
            } catch (e) {
                // console.error(`Error processing ${game.title}`);
            }
        }
        console.log(`\n🎉 갱신 완료! (저장됨: ${count}개 / 제외됨: ${skipped}개)`);

    } catch (e) {
        console.error("\n🚨 오류 발생:", e.message);
    }

    process.exit(0);
}

seedMetadata();