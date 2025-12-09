// backend/scripts/repair_tags_final.js
// 기능: 미국 스토어(cc=us)로 접속하여 '영어 태그'를 강제로 가져와 매핑률을 100%로 높임

require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('../models/Game');
const { mapSteamTags } = require('../utils/tagMapper');

const { MONGODB_URI } = process.env;

// ★ [핵심] 헤더에서 언어 설정 제거 (URL 파라미터가 우선순위를 갖도록)
const STEAM_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9', // 브라우저 언어 설정도 영어로
    'Cookie': 'birthtime=0; lastagecheckage=1-0-1900; wants_mature_content=1;' // Steam_Language 쿠키 제거
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchTagsFromStorePage(appId) {
    try {
        // ★ [수정] l=english 뿐만 아니라 cc=us (국가 코드)를 추가하여 확실하게 영문 페이지 로드
        const url = `https://store.steampowered.com/app/${appId}/?l=english&cc=us`;
        const { data: html } = await axios.get(url, { 
            headers: STEAM_HEADERS,
            timeout: 5000 
        });

        // HTML에서 태그 추출
        const tagRegex = /<a[^>]*class=["']app_tag["'][^>]*>([^<]+)<\/a>/g;
        const tags = [];
        let match;
        
        while ((match = tagRegex.exec(html)) !== null) {
            const rawTag = match[1].trim();
            if (rawTag !== '+') { 
                tags.push(rawTag);
            }
        }
        return tags;
    } catch (e) {
        if (e.response && e.response.status === 429) {
            return 'RATE_LIMIT';
        }
        return [];
    }
}

async function repairTagsFinal() {
    if (!MONGODB_URI) { console.error("❌ MONGODB_URI 없음"); process.exit(1); }
    
    await mongoose.connect(MONGODB_URI);
    console.log("✅ DB 연결됨. [최종] 태그 복구 모드 (Force English)...");

    // 태그가 없거나, '2D'/'RPG' 하나만 덜렁 있는 게임(매핑 실패 의심군)도 다시 검사
    // smart_tags 배열 길이가 2개 미만인 게임들을 대상으로 재수집
    const games = await Game.find({ 
        $or: [
            { smart_tags: { $exists: false } },
            { smart_tags: { $size: 0 } },
            { smart_tags: { $size: 1 } } // "2D" 하나만 있는 게임도 복구 대상에 포함
        ]
    }).select('steam_appid title smart_tags');

    console.log(`🔍 태그 보강이 필요한 게임 ${games.length}개 발견! 작업 시작...`);

    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < games.length; i++) {
        const game = games[i];
        
        process.stdout.write(`[${i + 1}/${games.length}] ${game.title} 처리 중... `);

        try {
            // 1. 영어 태그 수집
            const scrapedTags = await fetchTagsFromStorePage(game.steam_appid);

            if (scrapedTags === 'RATE_LIMIT') {
                console.log("⚠️ Rate Limit! 10초 대기 후 재시도...");
                await sleep(10000);
                i--; 
                continue;
            }

            if (scrapedTags && scrapedTags.length > 0) {
                // 2. 태그 매핑 (영어 -> 한글)
                const mappedTags = mapSteamTags(scrapedTags);
                
                // 3. 병합 (기존 태그 + 새 태그 + 원본 영어 태그 중복 제거)
                // 매핑된 게 3개 미만이면 원본 영어 태그라도 넣어서 데이터 풍부하게 유지
                let finalTags = mappedTags;
                if (finalTags.length < 3) {
                    finalTags = Array.from(new Set([...mappedTags, ...scrapedTags]));
                }

                // 기존 데이터보다 더 나은 경우에만 업데이트
                if (finalTags.length > (game.smart_tags?.length || 0)) {
                    game.smart_tags = finalTags;
                    await game.save();
                    successCount++;
                    console.log(`✅ 업데이트 (${finalTags.length}개): ${finalTags.slice(0, 3).join(', ')}...`);
                } else {
                    console.log(`⏩ 변화 없음 (기존 데이터 유지)`);
                }
            } else {
                failCount++;
                console.log(`❌ 태그 수집 실패 (페이지 오류 등)`);
            }

        } catch (err) {
            failCount++;
            console.log(`❌ 에러: ${err.message}`);
        }

        await sleep(800); // 0.8초 딜레이
    }

    console.log(`\n🎉 최종 작업 완료!`);
    console.log(`   - 업데이트된 게임: ${successCount}`);
    console.log(`   - 실패/건너뜀: ${failCount}`);
    
    process.exit(0);
}

repairTagsFinal();