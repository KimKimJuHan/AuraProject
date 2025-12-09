// backend/scripts/remove_future_games.js
// 기능: 현재 시점보다 미래에 출시되는 게임 데이터를 DB에서 삭제 (데이터 정화)

require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const Game = require('../models/Game');

const { MONGODB_URI } = process.env;

if (!MONGODB_URI) { console.error("❌ MONGODB_URI 없음"); process.exit(1); }

(async () => {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("✅ DB 연결됨. 미래 출시작 삭제 작업 시작...");

        const now = new Date();
        
        // releaseDate가 현재 시간보다 미래인 게임 삭제
        const result = await Game.deleteMany({
            releaseDate: { $gt: now }
        });

        console.log(`🧹 미래 출시일 게임 삭제 완료: ${result.deletedCount}개`);
        
    } catch (e) {
        console.error("❌ 작업 중 오류 발생:", e);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
})();