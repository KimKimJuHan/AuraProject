/**
 * repatch_playtime_online.js
 * 
 * HLTB(HowLongToBeat)에서 '정보 없음'으로 처리된 온라인/멀티플레이 게임들의
 * 평균 플레이타임을 SteamSpy의 playtime_forever 데이터로 보완합니다.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('../models/Game');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ DB 연결 완료');

    // play_time.main 이 없거나 0인 게임들 조회
    const games = await Game.find({
        steam_appid: { $exists: true, $ne: null },
        $or: [
            { 'play_time': { $exists: false } },
            { 'play_time': null },
            { 'play_time.main': 0 },
            { 'play_time.main': { $exists: false } }
        ]
    }).select('title steam_appid play_time').lean();

    console.log(`\n📋 처리 대상: ${games.length}개 게임`);

    let updated = 0;
    let skipped = 0;

    for (let i = 0; i < games.length; i++) {
        const game = games[i];
        
        try {
            const res = await axios.get(`https://steamspy.com/api.php?request=appdetails&appid=${game.steam_appid}`, {
                timeout: 8000
            });

            const data = res.data;
            if (data && data.playtime_forever > 0) {
                // 분 단위를 시간 단위로 변환 (소수점 반올림)
                const hours = Math.round(data.playtime_forever / 60);

                if (hours > 0) {
                    const newPlayTime = {
                        main: hours,
                        extra: 0,
                        completionist: 0,
                        raw: `평균 ${hours}시간`
                    };

                    await Game.updateOne(
                        { _id: game._id },
                        { $set: { play_time: newPlayTime } }
                    );

                    console.log(`[${i+1}/${games.length}] ✅ ${game.title} - SteamSpy 평균 ${hours}시간 저장완료`);
                    updated++;
                } else {
                    skipped++;
                }
            } else {
                skipped++;
            }
        } catch (err) {
            console.log(`[${i+1}/${games.length}] ❌ ${game.title} - SteamSpy API 실패`);
            skipped++;
        }

        // SteamSpy API Rate Limit (4 requests per second)
        await sleep(300);
    }

    console.log('\n════════════════════════════════════');
    console.log('🎉 플레이타임 보완 완료!');
    console.log(`   ✅ 업데이트: ${updated}개`);
    console.log(`   ✔  스킵:    ${skipped}개`);
    console.log('════════════════════════════════════');
    process.exit(0);
}

run().catch(err => {
    console.error('💥 크래시:', err);
    process.exit(1);
});
