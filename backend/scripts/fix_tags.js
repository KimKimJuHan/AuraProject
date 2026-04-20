const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Game = require('../models/Game');

// 정밀 매핑 테이블 (tagMapper.js의 로직을 그대로 가져옴)
const TAG_MAPPING = {
    "RPG": "RPG", "Role-Playing": "RPG", "JRPG": "RPG", "Action RPG": "RPG",
    "FPS": "FPS", "First-Person Shooter": "FPS", "Shooter": "FPS",
    "Simulation": "시뮬레이션", "Sim": "시뮬레이션",
    "Strategy": "전략", "RTS": "전략", "Turn-Based Strategy": "전략",
    "Sports": "스포츠", "Racing": "레이싱", "Puzzle": "퍼즐",
    "Survival": "생존", "Horror": "공포", "Action": "액션", "Adventure": "어드벤처",
    "First-Person": "1인칭", "Third-Person": "3인칭", 
    "Isometric": "쿼터뷰", "Top-Down": "탑다운", "Side Scroller": "사이드뷰", "Platformer": "사이드뷰",
    "Pixel Graphics": "픽셀 그래픽", "Pixel": "픽셀 그래픽", "2D": "2D", "3D": "3D", 
    "Anime": "애니메이션", "Realistic": "현실적", "Fantasy": "판타지", "Sci-fi": "공상과학",
    "Open World": "오픈 월드", "Story Rich": "스토리 중심", "Choices Matter": "선택의 중요성",
    "Multiplayer": "멀티플레이", "PvP": "경쟁/PvP", "Singleplayer": "싱글플레이",
    "Roguelike": "로그라이크", "Souls-like": "소울라이크"
};

async function migrateTags() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("✅ DB 연결 성공. 데이터 전수 조사를 시작합니다...");

        const games = await Game.find({});
        console.log(`🔎 총 ${games.length}개의 게임을 발견했습니다.`);

        let updateCount = 0;

        for (const game of games) {
            // 원본 tags 필드(스팀에서 가져온 것) 확인
            const rawTags = game.tags || [];
            if (rawTags.length === 0) continue;

            const newSmartTags = new Set();

            // 원본 태그를 돌면서 매핑 테이블에 있는지 확인
            rawTags.forEach(tag => {
                // 1. 정확히 일치하는 경우
                if (TAG_MAPPING[tag]) {
                    newSmartTags.add(TAG_MAPPING[tag]);
                }
                // 2. 대소문자 무시하고 일치하는 경우
                const key = Object.keys(TAG_MAPPING).find(k => k.toLowerCase() === tag.toLowerCase());
                if (key) newSmartTags.add(TAG_MAPPING[key]);

                // 3. '2D'나 '3D'가 포함된 경우 강제 매핑 (가장 중요)
                if (tag.toUpperCase().includes('2D')) newSmartTags.add('2D');
                if (tag.toUpperCase().includes('3D')) newSmartTags.add('3D');
                if (tag.toUpperCase().includes('RPG')) newSmartTags.add('RPG');
                if (tag.toUpperCase().includes('FPS')) newSmartTags.add('FPS');
            });

            // 결과 업데이트
            if (newSmartTags.size > 0) {
                game.smart_tags = Array.from(newSmartTags);
                await game.save();
                updateCount++;
                if (updateCount % 100 === 0) console.log(`... ${updateCount}개 처리 완료`);
            }
        }

        console.log(`\n🎉 수술 완료! 총 ${updateCount}개의 게임 태그를 정규화했습니다.`);
        process.exit(0);
    } catch (err) {
        console.error("❌ 에러 발생:", err);
        process.exit(1);
    }
}

migrateTags();