const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('../models/Game');

// 서버 과부하를 막기 위한 딜레이 함수
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function recoverLostTags() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("🚑 [긴급] 잃어버린 태그 복구 작전을 시작합니다...");

        // DB에 있는 모든 게임 가져오기
        const games = await Game.find({}).select('steam_appid title tags smart_tags');
        console.log(`총 ${games.length}개의 게임을 검사합니다.\n`);

        let successCount = 0;

        for (let i = 0; i < games.length; i++) {
            const game = games[i];
            
            try {
                // SteamSpy API를 통해 해당 게임의 진짜 원본 태그들을 가져옴
                const response = await axios.get(`https://steamspy.com/api.php?request=appdetails&appid=${game.steam_appid}`);
                
                if (response.data && response.data.tags) {
                    // "2D": 150, "Action": 100 형태로 오므로 키값(단어)만 추출
                    const rawTags = Object.keys(response.data.tags);
                    
                    if (rawTags.length > 0) {
                        // 스팀 원본 태그를 DB의 tags 필드에 복구 (이게 핵심!)
                        game.tags = rawTags;
                        
                        // 한국어 스마트 태그로 즉시 번역 (간이 동의어 매핑)
                        const newSmartTags = new Set();
                        rawTags.forEach(tag => {
                            const t = tag.toUpperCase();
                            if (t.includes('2D')) newSmartTags.add('2D');
                            if (t.includes('3D')) newSmartTags.add('3D');
                            if (t.includes('RPG')) newSmartTags.add('RPG');
                            if (t.includes('ACTION')) newSmartTags.add('액션');
                            if (t.includes('ADVENTURE')) newSmartTags.add('어드벤처');
                            if (t.includes('SIMULATION') || t.includes('SIM')) newSmartTags.add('시뮬레이션');
                            if (t.includes('STRATEGY')) newSmartTags.add('전략');
                            if (t.includes('SURVIVAL')) newSmartTags.add('생존');
                            if (t.includes('HORROR')) newSmartTags.add('공포');
                            if (t.includes('SCROLLER') || t.includes('PLATFORMER')) newSmartTags.add('사이드뷰');
                            if (t.includes('ISOMETRIC') || t.includes('TOP-DOWN')) newSmartTags.add('쿼터뷰');
                            if (t.includes('MULTI') || t.includes('CO-OP')) newSmartTags.add('멀티플레이');
                            if (t.includes('OPEN WORLD')) newSmartTags.add('오픈 월드');
                        });

                        game.smart_tags = Array.from(newSmartTags);
                        await game.save();
                        successCount++;
                    }
                }
                
                // 진행 상황 표시 (100개마다)
                if ((i + 1) % 100 === 0) {
                    console.log(`... ${i + 1}개 검사 완료 (복구됨: ${successCount}개)`);
                }

                // SteamSpy API 속도 제한 회피 (1초에 3~4개씩만 처리)
                await sleep(300); 

            } catch (apiErr) {
                // 특정 게임 API 호출 실패 시 스킵하고 계속 진행
                console.log(`⚠️ 스킵: ${game.title} (API 응답 없음)`);
            }
        }

        console.log(`\n🎉 복구 완료! 총 ${successCount}개 게임의 잃어버린 태그(2D 등)를 찾아냈습니다.`);
        process.exit(0);

    } catch (err) {
        console.error("❌ 치명적 에러:", err);
        process.exit(1);
    }
}

recoverLostTags();