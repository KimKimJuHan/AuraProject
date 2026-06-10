const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Game = require('../models/Game');

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ DB 연결 완료');

    const games = await Game.find({ 'play_time': { $type: 'string' } }).select('title play_time').lean();
    console.log(`\n📋 문자열 playtime 처리 대상: ${games.length}개 게임`);

    let updated = 0;
    let failed = 0;

    for (const game of games) {
        const pt = game.play_time;
        if (!pt) continue;

        let main = 0, extra = 0, completionist = 0;

        const parseHours = (str) => {
            if (!str) return 0;
            return parseFloat(str.replace('½', '.5')) || 0;
        };

        const mainMatch = pt.match(/Main Story\s*([\d½\.]+)\s*Hours/i);
        if (mainMatch) main = parseHours(mainMatch[1]);

        const extraMatch = pt.match(/Main \+ Extra\s*([\d½\.]+)\s*Hours/i);
        if (extraMatch) extra = parseHours(extraMatch[1]);

        const compMatch = pt.match(/Completionist\s*([\d½\.]+)\s*Hours/i);
        if (compMatch) completionist = parseHours(compMatch[1]);

        if (main === 0 && extra === 0 && completionist === 0) {
            const newPlayTime = {
                main: 0,
                extra: 0,
                completionist: 0,
                raw: pt.substring(0, 50) + (pt.length > 50 ? '...' : '')
            };
            await Game.updateOne({ _id: game._id }, { $set: { play_time: newPlayTime } });
            failed++;
        } else {
            const newPlayTime = {
                main,
                extra,
                completionist,
                raw: `메인 ${main}시간`
            };
            await Game.updateOne({ _id: game._id }, { $set: { play_time: newPlayTime } });
            updated++;
        }
    }

    console.log('\n════════════════════════════════════');
    console.log('🎉 문자열 플레이타임 파싱 완료!');
    console.log(`   ✅ 정규식 추출 성공: ${updated}개`);
    console.log(`   ⚠️ 추출 실패 (raw 변환): ${failed}개`);
    console.log('════════════════════════════════════');
    process.exit(0);
}

run().catch(console.error);
