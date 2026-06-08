const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Game = require('../models/Game');

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ DB 연결 완료');

    // South Park regular_price 수정 (3300 cents -> 44550 KRW)
    await Game.updateOne(
        { steam_appid: 213670 },
        { $set: { 'price_info.regular_price': 44550 } }
    );
    console.log('South Park regular_price updated to 44550');

    // 전체 게임 중 regular_price가 100~1999인 게임 수정
    const staleGames = await Game.find({
        'price_info.regular_price': { $gte: 100, $lt: 2000 },
        'price_info.isFree': { $ne: true }
    }).select('title steam_appid price_info.regular_price').lean();

    console.log('regular_price 수정 대상:', staleGames.length, '개');

    for (const g of staleGames) {
        const rp = g.price_info.regular_price;
        const fixedRp = Math.round((rp / 100) * 1350);
        await Game.updateOne({ _id: g._id }, { $set: { 'price_info.regular_price': fixedRp } });
        console.log('  수정:', g.title, rp, '->', fixedRp);
    }

    console.log('✅ 완료!');
    process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
