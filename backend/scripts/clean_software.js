const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Game = require('../models/Game');

async function cleanNonGames() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("✅ DB 연결 성공. 비게임 소프트웨어 숙청 시작...");

        // 스팀에서 흔히 '소프트웨어'로 분류되지만 상위권에 있어 수집된 항목들
        const softwareTitles = [
            "Wallpaper Engine", 
            "Bongo Cat", 
            "Soundpad", 
            "Aseprite", 
            "OBS Studio", 
            "Lossless Scaling",
            "FPS Monitor",
            "CPUCores :: Maximize Your FPS",
            "3DMark"
        ];

        const result = await Game.deleteMany({ title: { $in: softwareTitles } });
        
        console.log(`🎉 숙청 완료! 총 ${result.deletedCount}개의 소프트웨어가 DB에서 삭제되었습니다.`);
        process.exit(0);
    } catch (err) {
        console.error("❌ 에러 발생:", err);
        process.exit(1);
    }
}

cleanNonGames();