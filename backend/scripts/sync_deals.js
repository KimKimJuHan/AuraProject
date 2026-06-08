const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Game = require('../models/Game');

    const games = await Game.find({
        'price_info.deals': { $exists: true, $not: { $size: 0 } },
        'price_info.current_price': { $gt: 0 }
    });

    let count = 0;
    for (const g of games) {
        let changed = false;
        
        // Steam, Epic, Microsoft 등등 ITAD 딜의 가격이 current_price와 괴리가 큰 경우
        // 여기선 Steam만 현재가와 완벽 동기화시킴
        for (const d of g.price_info.deals) {
            if ((d.shopName || '').toLowerCase().includes('steam')) {
                if (d.price !== g.price_info.current_price || d.regularPrice !== g.price_info.regular_price) {
                    d.price = g.price_info.current_price;
                    d.regularPrice = g.price_info.regular_price;
                    
                    // 만약 할인율도 안맞으면 재계산
                    if (d.regularPrice > 0) {
                        d.discount = Math.round((1 - d.price / d.regularPrice) * 100);
                    } else {
                        d.discount = 0;
                    }
                    changed = true;
                }
            } else {
                // 다른 스토어도 Steam 가격과 너무 차이나면 (예: 69800 vs 10700) 
                // 그냥 Steam 가격을 덮어씌움 (최소한 69800 같은 뻥튀기는 방지)
                if (d.price > g.price_info.current_price * 2) {
                    d.price = g.price_info.current_price;
                    d.regularPrice = g.price_info.regular_price;
                    changed = true;
                }
            }
        }

        if (changed) {
            await Game.updateOne(
                { _id: g._id },
                { $set: { 'price_info.deals': g.price_info.deals } }
            );
            count++;
        }
    }
    console.log(`Synced ${count} deals to match current_price`);
    process.exit(0);
}

run().catch(console.error);
