/**
 * repatch_trailers.js
 *
 * trailers 필드가 비어있는 게임에 Steam API로 트레일러 URL 채우기
 *
 * 실행: node scripts/repatch_trailers.js
 * 테스트: node scripts/repatch_trailers.js --limit 50
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('../models/Game');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('❌ MONGODB_URI 없음'); process.exit(1); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const limitArg = process.argv.find(a => a.startsWith('--limit'));
const LIMIT = limitArg ? parseInt(process.argv[process.argv.indexOf(limitArg) + 1] || limitArg.split('=')[1]) : 0;

async function getTrailers(appId) {
    try {
        const res = await axios.get('https://store.steampowered.com/api/appdetails', {
            params: { appids: appId },  // filters 제거 - 전체 받아서 movies 추출
            timeout: 8000
        });
        const movies = res.data?.[String(appId)]?.data?.movies || [];
        return movies
            .map(m =>
                // 신규 API 형식 (2024년 이후)
                m.hls_h264 || m.dash_h264 || m.dash_av1 ||
                // 구버전 API 형식
                m.webm?.max || m.mp4?.max || m.webm?.['480'] || m.mp4?.['480'] || ''
            )
            .filter(Boolean)
            .slice(0, 3);
    } catch { return []; }
}

async function run() {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ DB 연결 완료');

    const missingOnly = process.argv.includes('--missing-only');
    const query = { steam_appid: { $exists: true, $ne: null } };
    if (missingOnly) {
        // 트레일러 없는 게임만 (enrich_all용 - 빠름)
        query.$or = [{ trailers: { $exists: false } }, { trailers: { $size: 0 } }];
    }
    const games = await Game.find(query).select('_id title steam_appid').lean();

    const targets = LIMIT > 0 ? games.slice(0, LIMIT) : games;
    console.log(`📋 트레일러 없는 게임: ${games.length}개 → 처리: ${targets.length}개`);
    console.log(`⏱  예상 소요: 약 ${Math.ceil(targets.length * 0.5 / 60)}분\n`);

    let updated = 0;
    let noTrailer = 0;

    for (let i = 0; i < targets.length; i++) {
        const game = targets[i];
        const trailers = await getTrailers(game.steam_appid);
        await sleep(400);

        if (trailers.length === 0) {
            noTrailer++;
            continue;
        }

        await Game.updateOne({ _id: game._id }, { $set: { trailers } });
        console.log(`[${i + 1}/${targets.length}] ✅ ${game.title} — ${trailers.length}개`);
        updated++;
    }

    console.log('\n════════════════════════════════════');
    console.log('🎉 완료!');
    console.log(`   ✅ 트레일러 추가: ${updated}개`);
    console.log(`   ⏩ 트레일러 없음: ${noTrailer}개`);
    console.log('════════════════════════════════════');
    process.exit(0);
}

run().catch(err => {
    console.error('💥 크래시:', err);
    process.exit(1);
});