// backend/metadata_seeder.js
// 역할: ITAD에서 인기 게임 목록을 가져오고, Steam에서 실제 판매 중인지 검증하여 '족보(Metadata)'를 만듦

require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const GameMetadata = require('./models/GameMetadata');

const { MONGODB_URI, ITAD_API_KEY } = process.env;

if (!ITAD_API_KEY) {
    console.error("🚨 ITAD_API_KEY 누락: .env 파일을 확인해주세요.");
    process.exit(1);
}

// 수동으로 꼭 추가하고 싶은 게임들 (예: GTA 5는 ITAD와 Steam ID 매핑이 까다로워 수동 지정)
const MANUAL_OVERRIDES = [
    { id: 271590, title: "Grand Theft Auto V", itad: "game_v2_f80169116c4f877f24022421713d6d03f0b21a8d" },
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * 스팀 상점 페이지를 조회하여 실제 유효한 게임인지 검증하는 함수
 * @param {number} appId - 스팀 앱 ID
 * @returns {string|boolean} - 유효하면 게임 제목(String), 아니면 false
 */
async function verifySteamStore(appId) {
    try {
        // filters 옵션으로 필요한 필드만 가져와 속도 최적화
        const res = await axios.get(`https://store.steampowered.com/api/appdetails`, {
            params: { appids: appId, filters: 'basic,price_overview,release_date', cc: 'kr' }
        });
        
        const data = res.data[appId];

        // 1. 상점 페이지 존재 여부 확인 (지역락 걸린 게임 등은 여기서 걸러짐)
        if (!data || !data.success) return false;
        
        const details = data.data;

        // 2. '게임' 본편인지 확인 (DLC, Soundtrack, Demo 등 제외)
        if (details.type !== 'game') return false;

        // 3. 판매 중이거나 무료 게임인지 확인
        // 가격 정보가 있거나(price_overview), 무료(is_free)여야 함.
        // "Legacy" 버전이나 구매 버튼이 없는 구버전 게임을 거르기 위함.
        const isPlayable = details.is_free === true || (details.price_overview && details.price_overview.final !== undefined);
        
        if (!isPlayable) return false;

        return details.name; // 검증 성공 시 스팀 제목 반환

    } catch (e) {
        // API 호출 실패 시 안전하게 false 반환
        return false;
    }
}

async function seedMetadata() {
    if (!MONGODB_URI) { console.error("❌ DB URI 없음"); process.exit(1); }
    
    await mongoose.connect(MONGODB_URI);
    console.log("✅ DB 연결됨. ITAD & Steam 교차 검증을 통한 족보 갱신 시작...");

    // 1. 수동 데이터 우선 등록
    console.log("🔧 수동 지정 게임 등록 중...");
    for (const manual of MANUAL_OVERRIDES) {
        await GameMetadata.findOneAndUpdate({ steamAppId: manual.id }, {
            steamAppId: manual.id,
            title: manual.title,
            itad: { uuid: manual.itad, manualOverride: true },
            lastUpdated: Date.now()
        }, { upsert: true });
    }

    // 2. ITAD 인기 게임 목록 조회
    try {
        // limit: 300 -> 검증 과정에서 많이 탈락하므로 넉넉하게 조회
        console.log("🚀 ITAD 인기 게임 300개 조회 중...");
        const popularRes = await axios.get(`https://api.isthereanydeal.com/stats/most-popular/v1`, {
            params: { key: ITAD_API_KEY, limit: 300 } 
        });
        const popularList = popularRes.data || [];
        
        console.log(`📦 후보 ${popularList.length}개 확보. 상세 검증 시작 (시간이 좀 걸립니다)...`);

        let count = 0;
        let skipped = 0;

        for (const game of popularList) {
            // [1차 필터] 제목에 불필요한 키워드가 있으면 즉시 제외
            const titleLower = game.title.toLowerCase();
            if (titleLower.includes('legacy') || 
                titleLower.includes('soundtrack') || 
                titleLower.includes(' artbook') ||
                titleLower.includes(' pack') ||
                titleLower.includes(' bundle') ||
                titleLower.includes(' dlc')) {
                skipped++;
                continue;
            }

            // 이미 수동으로 등록된 게임은 패스
            const exists = await GameMetadata.findOne({ 'itad.uuid': game.id });
            if (exists && exists.itad.manualOverride) continue;

            // Steam API 호출 제한 방지 (0.5초 대기)
            await sleep(500); 

            try {
                // ITAD 상세 정보 조회 (스팀 ID 확인용)
                const infoRes = await axios.get(`https://api.isthereanydeal.com/games/info/v2`, {
                    params: { key: ITAD_API_KEY, id: game.id } 
                });

                const foundGame = infoRes.data;
                const steamAppId = foundGame?.appid; 
                const itadUuid = foundGame?.id;
                const itadTitle = foundGame?.title; // ITAD의 깔끔한 영어 제목
                
                if (steamAppId && itadUuid) {
                    // [2차 필터] Steam 상점 검증 (판매/다운로드 가능 여부)
                    const steamName = await verifySteamStore(steamAppId);
                    
                    if (steamName) {
                        // 검증 통과! DB에 저장
                        // title 필드에는 ITAD의 영어 제목을 저장하여 나중에 HLTB 검색에 활용함
                        await GameMetadata.findOneAndUpdate({ steamAppId }, {
                            steamAppId: steamAppId,
                            title: itadTitle, 
                            itad: { uuid: itadUuid },
                            lastUpdated: Date.now()
                        }, { upsert: true });
                        
                        process.stdout.write(`.`); // 진행바 (.)
                        count++;
                    } else {
                        process.stdout.write(`x`); // 탈락 (x)
                        skipped++;
                    }
                }
            } catch (e) {
                // 개별 게임 에러는 무시하고 계속 진행
            }
        }
        console.log(`\n\n🎉 갱신 완료!`);
        console.log(`✅ 저장됨: ${count}개`);
        console.log(`🗑️ 제외됨: ${skipped}개 (판매 중단, DLC, 번들 등)`);

    } catch (e) {
        console.error("\n🚨 ITAD API 호출 중 치명적 오류:", e.message);
    }

    process.exit(0);
}

seedMetadata();