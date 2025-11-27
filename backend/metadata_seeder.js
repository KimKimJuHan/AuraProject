// backend/metadata_seeder.js

require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const GameMetadata = require('./models/GameMetadata');

const { MONGODB_URI, ITAD_API_KEY } = process.env;

if (!ITAD_API_KEY) {
    console.error("🚨 ITAD_API_KEY 누락");
    process.exit(1);
}

const MANUAL_OVERRIDES = [
    { id: 271590, title: "Grand Theft Auto V", itad: "game_v2_f80169116c4f877f24022421713d6d03f0b21a8d" },
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 스팀 상점 검증
async function verifySteamStore(appId) {
    try {
        const res = await axios.get(`https://store.steampowered.com/api/appdetails`, {
            params: { appids: appId, filters: 'basic,price_overview,release_date', cc: 'us' } // cc=us로 영어 정보 확인
        });
        
        const data = res.data[appId];
        if (!data || !data.success) return false;
        
        const details = data.data;
        if (details.type !== 'game') return false;

        // 무료이거나 가격 정보가 있어야 함
        const isPlayable = details.is_free === true || (details.price_overview && details.price_overview.final !== undefined);
        
        return isPlayable; 
    } catch (e) { return false; }
}

async function seedMetadata() {
    if (!MONGODB_URI) { console.error("❌ DB URI 없음"); process.exit(1); }
    
    await mongoose.connect(MONGODB_URI);
    console.log("✅ DB 연결됨. 족보 갱신 시작...");

    // 1. 수동 데이터
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
        console.log("🚀 ITAD 인기 게임 300개 조회 중...");
        const popularRes = await axios.get(`https://api.isthereanydeal.com/stats/most-popular/v1`, {
            params: { key: ITAD_API_KEY, limit: 300 } 
        });
        const popularList = popularRes.data || [];
        
        console.log(`📦 후보 ${popularList.length}개 확보. 검증 시작...`);

        let count = 0;
        let skipped = 0;

        for (const game of popularList) {
            // 불량 키워드 필터링
            const titleLower = game.title.toLowerCase();
            if (titleLower.includes('legacy') || titleLower.includes('soundtrack') || titleLower.includes(' dlc')) {
                skipped++;
                continue;
            }

            const exists = await GameMetadata.findOne({ 'itad.uuid': game.id });
            if (exists && exists.itad.manualOverride) continue;

            await sleep(300); 

            try {
                // ITAD 정보 조회 -> 여기서 얻은 'game.title'은 깔끔한 영어 제목임
                const infoRes = await axios.get(`https://api.isthereanydeal.com/games/info/v2`, {
                    params: { key: ITAD_API_KEY, id: game.id } 
                });
                const foundGame = infoRes.data;
                
                if (foundGame && foundGame.appid) {
                    const isValid = await verifySteamStore(foundGame.appid);
                    
                    if (isValid) {
                        // ★ 핵심: 스팀 제목 대신 ITAD의 깔끔한 영어 제목(foundGame.title)을 저장
                        await GameMetadata.findOneAndUpdate({ steamAppId: foundGame.appid }, {
                            steamAppId: foundGame.appid,
                            title: foundGame.title, 
                            itad: { uuid: foundGame.id },
                            lastUpdated: Date.now()
                        }, { upsert: true });
                        process.stdout.write(`.`); 
                        count++;
                    } else {
                        process.stdout.write(`x`); 
                        skipped++;
                    }
                }
            } catch (e) {}
        }
        console.log(`\n🎉 갱신 완료! (저장: ${count} / 제외: ${skipped})`);

    } catch (e) { console.error("\n🚨 오류:", e.message); }

    process.exit(0);
}

seedMetadata();