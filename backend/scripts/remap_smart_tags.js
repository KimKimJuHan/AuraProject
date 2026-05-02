/**
 * retry_skipped_tags.js
 *
 * 이전 remap_smart_tags.js 실행에서 스킵된 게임들
 * (tags 없는 게임) 을 재시도합니다.
 *
 * Steam API rate limit 대응:
 * - 429 또는 빈 응답 시 최대 3회 재시도 (지수 백오프)
 * - 재시도 간격: 5s → 15s → 30s
 *
 * 실행: node scripts/retry_skipped_tags.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('../models/Game');
const { mapSteamTags } = require('../utils/tagMapper');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('❌ MONGODB_URI 없음'); process.exit(1); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchTagsWithRetry(appId, maxRetry = 3) {
    const delays = [5000, 15000, 30000];

    for (let attempt = 0; attempt <= maxRetry; attempt++) {
        try {
            const res = await axios.get('https://store.steampowered.com/api/appdetails', {
                params: { appids: appId, filters: 'genres,categories', cc: 'kr' },
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept-Language': 'ko-KR,ko;q=0.9'
                }
            });

            // rate limit 감지
            if (res.status === 429) {
                const wait = delays[attempt] || 30000;
                console.log(`     ⏳ rate limit (429) — ${wait / 1000}초 대기 후 재시도 (${attempt + 1}/${maxRetry})`);
                await sleep(wait);
                continue;
            }

            const data = res.data?.[appId]?.data;
            // 응답은 왔는데 data가 null → 실제로 없는 앱 (DLC, 삭제됨 등)
            if (!data) return { tags: [], reallyMissing: true };

            const genres = (data.genres || []).map(g => g.description);
            const categories = (data.categories || []).map(c => c.description);
            return { tags: [...new Set([...genres, ...categories])], reallyMissing: false };

        } catch (err) {
            const status = err.response?.status;
            if ((status === 429 || status === 503 || !status) && attempt < maxRetry) {
                const wait = delays[attempt] || 30000;
                console.log(`     ⏳ 오류(${status || 'timeout'}) — ${wait / 1000}초 대기 후 재시도 (${attempt + 1}/${maxRetry})`);
                await sleep(wait);
            } else {
                return { tags: [], reallyMissing: false }; // 재시도 소진
            }
        }
    }
    return { tags: [], reallyMissing: false };
}

async function run() {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ DB 연결 완료');

    // 이전에 스킵된 게임: tags 없는 게임
    const games = await Game.find({
        steam_appid: { $exists: true, $ne: null },
        $or: [
            { tags: { $exists: false } },
            { tags: { $size: 0 } }
        ]
    }).select('_id title steam_appid smart_tags').lean();

    console.log(`📋 재시도 대상: ${games.length}개`);
    console.log(`⏱  예상 소요: 약 ${Math.ceil(games.length * 1.5 / 60)}분 (rate limit 대기 포함)\n`);

    let saved = 0;
    let reallyMissing = 0;   // 실제로 Steam에 없는 앱
    let exhausted = 0;        // 재시도 소진
    let noMapping = 0;        // API는 왔는데 TAG_MAPPING에 해당 없음

    for (let i = 0; i < games.length; i++) {
        const game = games[i];
        const progress = `[${i + 1}/${games.length}]`;

        const { tags: sourceTags, reallyMissing: isMissing } = await fetchTagsWithRetry(game.steam_appid);

        if (isMissing) {
            console.log(`${progress} ❌ 실제 없는 앱 (DLC/삭제): ${game.title} (appid: ${game.steam_appid})`);
            reallyMissing++;
            await sleep(400);
            continue;
        }

        if (sourceTags.length === 0) {
            console.log(`${progress} ⏩ 재시도 소진: ${game.title}`);
            exhausted++;
            await sleep(400);
            continue;
        }

        const newSmartTags = mapSteamTags(sourceTags);

        if (newSmartTags.length === 0) {
            // 원본 tags는 저장 (나중에 매핑 추가 시 활용)
            await Game.updateOne({ _id: game._id }, { $set: { tags: sourceTags } });
            console.log(`${progress} ⚠️  매핑 없음 (원본 저장): ${game.title}`);
            console.log(`     원본: [${sourceTags.slice(0, 5).join(', ')}]`);
            noMapping++;
            await sleep(600);
            continue;
        }

        await Game.updateOne(
            { _id: game._id },
            { $set: { tags: sourceTags, smart_tags: newSmartTags } }
        );
        console.log(`${progress} ✅ ${game.title}`);
        console.log(`     변환: [${newSmartTags.join(', ')}]`);
        saved++;

        // 정상 처리 후 딜레이 (rate limit 방지)
        await sleep(800);
    }

    console.log('\n════════════════════════════════════');
    console.log('🎉 재시도 완료!');
    console.log(`   ✅ 저장: ${saved}개`);
    console.log(`   ❌ 실제 없는 앱: ${reallyMissing}개`);
    console.log(`   ⏩ 재시도 소진: ${exhausted}개`);
    console.log(`   ⚠️  매핑 없음: ${noMapping}개`);
    console.log('════════════════════════════════════');

    if (reallyMissing > 0) {
        console.log(`\n💡 '실제 없는 앱' ${reallyMissing}개는 DLC나 삭제된 게임입니다.`);
        console.log(`   정리하려면: node scripts/cleanup_missing_games.js`);
    }

    process.exit(0);
}

run().catch(err => {
    console.error('💥 크래시:', err);
    process.exit(1);
});