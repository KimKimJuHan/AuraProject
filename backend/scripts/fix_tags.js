const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Game = require('../models/Game');

// ★ 핵심 추가: 태그 번역(매핑) 도구 불러오기
const { mapSteamTags } = require('../utils/tagMapper');

async function migrateTags() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("✅ DB 연결 성공. 데이터 강제 동기화 및 번역을 시작합니다...");

        const games = await Game.find({});
        let updateCount = 0;

        for (const game of games) {
            // 원본 데이터 확보 (tags가 없으면 옛날 smart_tags라도 끌어옴)
            const sourceTags = (game.tags && game.tags.length > 0) ? game.tags : game.smart_tags;
            
            if (!sourceTags || sourceTags.length === 0) continue;

            // 1. tagMapper를 통해 영어 -> 한국어 1차 정규화
            const mappedTags = mapSteamTags(sourceTags);
            const newSmartTags = new Set(mappedTags);

            // 2. 누락 방지: 원본에 2D, RPG 등이 있으면 강제 주입
            sourceTags.forEach(tag => {
                const t = String(tag).trim().toUpperCase();
                if (t.includes('2D')) newSmartTags.add('2D');
                if (t.includes('3D')) newSmartTags.add('3D');
                if (t.includes('RPG')) newSmartTags.add('RPG');
                if (t.includes('ACTION')) newSmartTags.add('액션');
                if (t.includes('PLATFORMER')) newSmartTags.add('사이드뷰');
            });

            // DB 업데이트: 원본이 비어있었다면 채워주고, smart_tags는 완벽히 번역된 세트로 교체
            if (!game.tags || game.tags.length === 0) {
                game.tags = sourceTags; 
            }
            game.smart_tags = Array.from(newSmartTags);
            
            await game.save();
            updateCount++;
            
            if (updateCount % 200 === 0) {
                console.log(`... ${updateCount}개 정규화 완료`);
            }
        }

        console.log(`\n🎉 수술 완료! 총 ${updateCount}개의 게임 데이터가 [한국어 스마트 태그]로 완벽하게 정규화되었습니다.`);
        process.exit(0);
    } catch (err) {
        console.error("❌ 에러:", err);
        process.exit(1);
    }
}

migrateTags();