const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Game = require('../models/Game');

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);

    // 붉은사막 확인
    const g = await Game.findOne({ $or: [{ title: /붉은사막/i }, { title: /red desert/i }, { title: /reddesert/i }] }).lean();
    if (!g) { console.log('붉은사막 못찾음'); }
    else {
        console.log('=== 붉은사막 ===');
        console.log('title:', g.title, '| title_ko:', g.title_ko);
        console.log('steam_appid:', g.steam_appid);
        console.log('current_price:', g.price_info?.current_price);
        console.log('regular_price:', g.price_info?.regular_price);
        console.log('isFree:', g.price_info?.isFree);
        console.log('deals:', JSON.stringify(g.price_info?.deals?.slice(0,3), null, 2));
    }

    // 일반적인 가격 이상 게임 샘플 (스팀 실제가격이랑 멀리 떨어진)
    console.log('\n=== 가격 이상 의심 게임 (1000~15000원이면서 steam_ccu 높은 게임) ===');
    const suspects = await Game.find({
        'price_info.current_price': { $gte: 5000, $lte: 20000 },
        steam_ccu: { $gt: 1000 }
    }).sort({ steam_ccu: -1 }).limit(10).select('title steam_appid price_info.current_price price_info.regular_price steam_ccu').lean();
    suspects.forEach(s => console.log(`  ${s.title} | 현재:${s.price_info?.current_price}원 | 정가:${s.price_info?.regular_price}원 | CCU:${s.steam_ccu}`));

    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
