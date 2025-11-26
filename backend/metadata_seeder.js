// backend/metadata_seeder.js (ITAD 기반 동적 수집 버전)

require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const GameMetadata = require('./models/GameMetadata');

const { MONGODB_URI, ITAD_API_KEY } = process.env;

if (!ITAD_API_KEY) {
    console.error("🚨 ITAD_API_KEY가 없습니다.");
    process.exit(1);
}

// GTA 5 같은 특수 케이스는 하드코딩으로 관리 (필요시)
const MANUAL_OVERRIDES = [
    { id: 271590, title: "Grand Theft Auto V", itad: "game_v2_f80169116c4f877f24022421713d6d03f0b21a8d" },
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function seedMetadata() {
    if (!MONGODB_URI) { console.error("❌ DB URI 없음"); process.exit(1); }
    
    await mongoose.connect(MONGODB_URI);
    console.log("✅ DB 연결됨. ITAD에서 인기 게임 목록 갱신 시작...");

    // 1. 수동 오버라이드 게임 먼저 등록
    for (const manual of MANUAL_OVERRIDES) {
        await GameMetadata.findOneAndUpdate({ steamAppId: manual.id }, {
            steamAppId: manual.id,
            title: manual.title,
            itad: { uuid: manual.itad, manualOverride: true },
            lastUpdated: Date.now()
        }, { upsert: true });
    }
    console.log(`🔧 수동 설정 게임 ${MANUAL_OVERRIDES.length}개 등록 완료.`);

    // 2. ITAD 인기 게임 TOP 150 조회
    try {
        console.log("🚀 ITAD API 호출 중...");
        const popularRes = await axios.get(`https://api.isthereanydeal.com/stats/most-popular/v1`, {
            params: { key: ITAD_API_KEY, limit: 150 } // 150개로 확장
        });
        const popularList = popularRes.data || [];

        console.log(`📦 인기 게임 ${popularList.length}개 발견. 상세 정보 매핑 시작...`);

        let count = 0;
        for (const game of popularList) {
            // 이미 수동으로 등록된 건 패스
            const exists = await GameMetadata.findOne({ 'itad.uuid': game.id });
            if (exists && exists.itad.manualOverride) continue;

            await sleep(300); // API 부하 방지

            try {
                // 게임 상세 정보 조회 (스팀 ID 확인용)
                const infoRes = await axios.get(`https://api.isthereanydeal.com/games/info/v2`, {
                    params: { key: ITAD_API_KEY, id: game.id } 
                });

                const foundGame = infoRes.data;
                const steamAppId = foundGame?.appid; 
                const itadUuid = foundGame?.id;
                const gameTitle = foundGame?.title;
                
                if (steamAppId && itadUuid) {
                    await GameMetadata.findOneAndUpdate({ steamAppId }, {
                        steamAppId: steamAppId,
                        title: gameTitle,
                        itad: { uuid: itadUuid },
                        lastUpdated: Date.now()
                    }, { upsert: true });
                    process.stdout.write(`.`); // 진행 표시
                    count++;
                }
            } catch (e) {
                // 개별 조회 실패는 무시하고 진행
            }
        }
        console.log(`\n🎉 총 ${count}개의 메타데이터가 갱신되었습니다.`);

    } catch (e) {
        console.error("\n🚨 ITAD API 호출 실패:", e.message);
    }

    process.exit(0);
}

seedMetadata();