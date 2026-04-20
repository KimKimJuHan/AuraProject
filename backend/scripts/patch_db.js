const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Game = require('../models/Game');

async function runPatch() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("✅ DB 연결 성공. 한글명(title_ko) 패치 시작...");

        const patchList = [
            { title: "DARK SOULS™ III", title_ko: "다크 소울 3" },
            { title: "DARK SOULS™ II: Scholar of the First Sin", title_ko: "다크 소울 2" },
            { title: "DARK SOULS™: REMASTERED", title_ko: "다크 소울" },
            { title: "Factorio", title_ko: "팩토리오" },
            { title: "Grand Theft Auto V", title_ko: "GTA 5" },
            { title: "Apex 레전드™", title_ko: "에이펙스 레전드" },
            { title: "Sid Meier’s Civilization® VI", title_ko: "문명 6" }
        ];

        for (const target of patchList) {
            const result = await Game.updateOne(
                { title: target.title }, 
                { $set: { title_ko: target.title_ko } }
            );
            if (result.modifiedCount > 0) {
                console.log(`✔️ [성공] ${target.title} -> ${target.title_ko} 업데이트 완료`);
            } else {
                console.log(`⚠️ [스킵] ${target.title} (이미 적용되어 있거나 게임을 찾을 수 없음)`);
            }
        }

        console.log("🎉 DB 패치 작업 완료!");
        process.exit(0);
    } catch (err) {
        console.error("❌ 에러 발생:", err);
        process.exit(1);
    }
}

runPatch();