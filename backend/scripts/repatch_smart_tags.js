/**
 * repatch_review_percent.js
 *
 * steam_reviews.overall.percent가 0이고 total > 0인 게임만 대상으로
 * Steam appreviews API에서 실제 긍정 비율을 계산해서 업데이트합니다.
 * (이미 percent가 채워진 게임은 건드리지 않습니다)
 *
 * 실행: node scripts/repatch_review_percent.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('../models/Game');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('❌ MONGODB_URI 없음'); process.exit(1); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function run() {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ DB 연결 완료');

    // percent === 0 이고 total > 0인 게임만 (이미 채워진 건 제외)
    const games = await Game.find({
        steam_appid: { $exists: true, $ne: null },
        $or: [
            { 'steam_reviews.overall.percent': 0 },
            { 'steam_reviews.overall.percent': { $exists: false } }
        ],
        'steam_reviews.overall.total': { $gt: 0 }
    }).select('_id title steam_appid steam_reviews').lean();

    console.log(`📋 패치 대상: ${games.length}개`);
    console.log(`⏱  예상 소요: 약 ${Math.ceil(games.length * 0.8 / 60)}분\n`);

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < games.length; i++) {
        const game = games[i];
        const progress = `[${i + 1}/${games.length}]`;

        try {
            const res = await axios.get(
                `https://store.steampowered.com/appreviews/${game.steam_appid}?json=1&language=all`,
                { timeout: 8000 }
            );

            const qs = res.data?.query_summary;
            if (!qs) {
                console.log(`${progress} ⏩ 스킵 (응답 없음): ${game.title}`);
                skipped++;
                await sleep(500);
                continue;
            }

            const total = qs.total_reviews || 0;
            const positive = qs.total_positive || 0;
            const percent = total > 0 ? Math.round((positive / total) * 100) : 0;

            if (percent === 0) {
                console.log(`${progress} ⏩ 스킵 (리뷰 없음): ${game.title}`);
                skipped++;
                await sleep(300);
                continue;
            }

            await Game.updateOne(
                { _id: game._id },
                {
                    $set: {
                        'steam_reviews.overall.percent': percent,
                        'steam_reviews.overall.positive': positive,
                        'steam_reviews.overall.total': total,
                        'steam_reviews.overall.summary': qs.review_score_desc || game.steam_reviews?.overall?.summary
                    }
                }
            );

            console.log(`${progress} ✅ ${game.title} → ${percent}% (${positive.toLocaleString()}/${total.toLocaleString()})`);
            updated++;

        } catch (err) {
            console.error(`${progress} ❌ 실패: ${game.title} — ${err.message}`);
            failed++;
        }

        await sleep(800);
    }

    console.log('\n════════════════════════════════════');
    console.log('🎉 패치 완료!');
    console.log(`   ✅ 업데이트: ${updated}개`);
    console.log(`   ✔  스킵:    ${skipped}개`);
    console.log(`   ❌ 실패:    ${failed}개`);
    console.log('════════════════════════════════════');
    process.exit(0);
}

run().catch(err => {
    console.error('💥 크래시:', err);
    process.exit(1);
});