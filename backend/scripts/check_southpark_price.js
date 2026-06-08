const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Game = require('../models/Game');

async function check() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ DB 연결 완료');

    // South Park 검색
    const games = await Game.find({
        $or: [
            { title: /south park.*stick/i },
            { title_ko: /south park.*stick/i }
        ]
    }).select('title title_ko slug steam_appid price_info').lean();

    if (games.length === 0) {
        console.log('❌ South Park: Stick of Truth 게임을 찾을 수 없습니다.');
    } else {
        for (const g of games) {
            console.log('\n=== 게임 정보 ===');
            console.log('제목:', g.title);
            console.log('slug:', g.slug);
            console.log('appid:', g.steam_appid);
            console.log('--- price_info ---');
            console.log('isFree:', g.price_info?.isFree);
            console.log('current_price:', g.price_info?.current_price);
            console.log('current_price_krw:', g.price_info?.current_price_krw);
            console.log('regular_price:', g.price_info?.regular_price);
            console.log('discount_percent:', g.price_info?.discount_percent);
            console.log('deals:', JSON.stringify(g.price_info?.deals || [], null, 2));
        }
    }

    // CS2 확인
    console.log('\n\n=== CS2 확인 ===');
    const cs2 = await Game.find({
        $or: [
            { title: /counter-strike 2/i },
            { title: /counter.strike.*2/i },
            { steam_appid: 730 }
        ]
    }).select('title slug steam_appid price_info').lean();

    for (const g of cs2) {
        console.log('제목:', g.title, '| appid:', g.steam_appid);
        console.log('isFree:', g.price_info?.isFree);
        console.log('current_price:', g.price_info?.current_price);
        console.log('deals 수:', g.price_info?.deals?.length || 0);
        if (g.price_info?.deals?.length > 0) {
            console.log('deals:', JSON.stringify(g.price_info.deals.slice(0, 3), null, 2));
        }
    }

    process.exit(0);
}

check().catch(e => { console.error(e); process.exit(1); });
