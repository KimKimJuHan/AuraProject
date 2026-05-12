/**
 * fix_adult_flag.js
 *
 * isAdult 플래그 재정리:
 * - 잘못 분류된 138개 일반 게임 → isAdult: false (복원)
 * - 실제 성인 콘텐츠 4개 + 비게임 앱 3개 → isAdult: true 유지
 *
 * 실행: node scripts/fix_adult_flag.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const Game = require('../models/Game');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('❌ MONGODB_URI 없음'); process.exit(1); }

// 복원할 게임 (138개 - 잘못 분류된 일반 게임)
const RESTORE_APPIDS = [752590,2187230,34010,2208920,812140,418370,883710,2050650,222480,3764200,924970,208650,1238840,2807960,1238810,8850,7670,1196590,49520,729040,261640,209650,2933620,3606480,292730,476600,1677280,1091500,1252330,2016590,221100,2507950,337000,631510,1845910,2054970,1172710,2515020,1151340,233270,2369390,493520,1097840,1593500,271590,1546990,553850,1659040,236870,1583230,203140,1151640,2561580,594650,225540,379430,110800,1256670,532210,1973530,2417610,214560,1328670,12150,204100,261550,3287520,1063730,1113560,524220,1928980,3681010,680420,102600,578080,1205520,1627720,611500,2124490,2947440,2461850,750920,488790,50300,1716740,65930,2223840,939850,67370,2623190,2531310,578650,20920,292030,20900,2221490,203160,2172010,532790,230410,2183900,200510,339340,2322010,1371980,1548520,1281590,1238040,1222690,2344520,409720,409710,3321460,2853730,3489700,2012510,3159330,834530,927380,3937550,638970,1088710,1105500,1105510,1235140,2375550,2072450,3061810,2058180,601050,1938090,1962663,1903340,2074920,2680010,304390,2475010,2420110];

// 유지할 성인 콘텐츠 + 비게임 앱 (7개)
const KEEP_ADULT = {
    311730:  'DEAD OR ALIVE 5 (노출)',
    3557620: '블루 아카이브 (미소녀 가챠)',
    1190130: '아라하 (성인 공포)',
    3920610: '제로 붉은 나비 REMAKE (성인 공포)',
    431960:  'Wallpaper Engine (앱)',
    3419430: 'Bongo Cat (앱)',
    362620:  'Software Inc (앱)',
};

async function run() {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ DB 연결 완료\n');

    // 138개 복원
    const result = await Game.updateMany(
        { steam_appid: { $in: RESTORE_APPIDS } },
        { $set: { isAdult: false } }
    );
    console.log(`✅ 일반 게임 복원: ${result.modifiedCount}개`);

    // 유지 목록 확인
    console.log('\n🔒 성인/비게임 유지 목록:');
    for (const [appid, desc] of Object.entries(KEEP_ADULT)) {
        const game = await Game.findOne({ steam_appid: Number(appid) }).select('title isAdult').lean();
        if (game) {
            console.log(`   ${game.isAdult ? '✅' : '⚠️ '} ${game.title} — ${desc}`);
        }
    }

    // 최종 현황
    const adultCount = await Game.countDocuments({ isAdult: true });
    const total = await Game.countDocuments();
    console.log(`\n📊 최종: 전체 ${total}개 중 숨김 ${adultCount}개`);

    process.exit(0);
}

run().catch(err => {
    console.error('💥 크래시:', err);
    process.exit(1);
});