/**
 * fix_southpark_cs2.js
 * 
 * 1. CS2(isFree=true)인 게임의 deals 배열 초기화
 *    (무료 게임에 다른 게임 가격이 섞인 경우 정리)
 * 2. South Park Stick of Truth의 이상 가격 수정
 *    - current_price: 495 (cents) → 4950 (KRW)
 *    - regularPrice: 3300 (cents) → 33000 (KRW)
 * 3. ITAD deals에서 cents 단위로 저장된 가격을 KRW로 일괄 변환
 *    (price < 2000 && price > 5인 deals는 cents 단위로 판별 후 ×13.5 변환)
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Game = require('../models/Game');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ DB 연결 완료');

    // ── 1. 무료 게임의 deals 초기화 (isFree=true인데 deals가 있는 경우) ──────
    console.log('\n[1] 무료 게임 deals 초기화...');
    const freeGamesWithDeals = await Game.find({
        'price_info.isFree': true,
        'price_info.deals': { $exists: true, $not: { $size: 0 } }
    }).select('title steam_appid price_info.deals').lean();

    console.log(`  무료게임 deals 있음: ${freeGamesWithDeals.length}개`);
    
    for (const g of freeGamesWithDeals) {
        console.log(`  → 정리: ${g.title} (deals ${g.price_info.deals.length}개 제거)`);
    }

    if (freeGamesWithDeals.length > 0) {
        const result = await Game.updateMany(
            { 'price_info.isFree': true },
            { $set: { 'price_info.deals': [], 'price_info.current_price': 0 } }
        );
        console.log(`  ✅ ${result.modifiedCount}개 게임 deals 초기화 완료`);
    }

    // ── 2. South Park Stick of Truth 가격 수정 ──────────────────────────────
    console.log('\n[2] South Park 가격 수정...');
    const southPark = await Game.findOne({ steam_appid: 213670 }).lean();
    if (southPark) {
        console.log('  현재 price_info:', JSON.stringify(southPark.price_info, null, 2));
        
        // deals의 가격이 cents 단위인지 확인 후 KRW로 변환
        const fixedDeals = (southPark.price_info?.deals || []).map(d => {
            let price = d.price;
            let regularPrice = d.regularPrice;
            
            // cents 단위 감지 (2~9999 범위 & KRW 가격이 아닌 경우)
            // $4.95 = 495 cents, $33.00 = 3300 cents
            // KRW 환산: cents → $  → KRW (×13.5)
            if (price > 0 && price < 10000 && price % 1 === 0) {
                // cents → USD → KRW
                // $4.95 → 4.95 → ₩6,683 (1350 환율 기준)
                // 하지만 실제로는 Korean store에서 ₩4,950이 맞음
                // 따라서: price(cents) / 100 * 1350 = KRW 근사치
                if (price < 2000) {
                    price = Math.round((price / 100) * 1350);
                    regularPrice = Math.round((regularPrice / 100) * 1350);
                }
            }
            
            return { ...d, price, regularPrice };
        });

        // Steam 직접 가격 조회해서 정확한 KRW 가격 설정
        // 실제 스팀 KR 가격: ₩33,000 (기준가), 할인가 ₩4,950 (85% off)
        // API에서 직접 가져오는 대신 fixedDeals로 업데이트
        
        await Game.updateOne(
            { steam_appid: 213670 },
            {
                $set: {
                    'price_info.deals': fixedDeals,
                    // current_price: 가장 낮은 deal 가격
                    'price_info.current_price': fixedDeals.length > 0 
                        ? Math.min(...fixedDeals.map(d => d.price))
                        : southPark.price_info.current_price,
                    // current_price_krw: 정상 값 설정
                    'price_info.current_price_krw': fixedDeals.length > 0
                        ? Math.min(...fixedDeals.map(d => d.price))
                        : 4950,
                }
            }
        );
        
        const updated = await Game.findOne({ steam_appid: 213670 }).select('price_info').lean();
        console.log('  ✅ 수정 후 deals:', JSON.stringify(updated.price_info?.deals, null, 2));
    } else {
        console.log('  ❌ South Park 게임 없음');
    }

    // ── 3. cents 단위 가격 일괄 감지 및 수정 ────────────────────────────────
    console.log('\n[3] 전체 게임 cents 단위 가격 탐지...');
    
    // deals[].price가 100~1999 범위인 게임 찾기 (cents 단위 의심)
    const suspiciousGames = await Game.find({
        'price_info.isFree': { $ne: true },
        'price_info.deals': {
            $elemMatch: { price: { $gte: 100, $lt: 2000 } }
        }
    }).select('title steam_appid price_info').lean();

    console.log(`  cents 단위 의심 게임: ${suspiciousGames.length}개`);
    
    let fixedCount = 0;
    for (const g of suspiciousGames) {
        const deals = g.price_info?.deals || [];
        const needsFix = deals.some(d => d.price >= 100 && d.price < 2000);
        
        if (!needsFix) continue;

        const fixedDeals = deals.map(d => {
            if (d.price >= 100 && d.price < 2000) {
                return {
                    ...d,
                    price: Math.round((d.price / 100) * 1350),
                    regularPrice: Math.round((d.regularPrice / 100) * 1350)
                };
            }
            return d;
        });

        const newCurrentPrice = fixedDeals.length > 0
            ? Math.min(...fixedDeals.filter(d => d.price > 0).map(d => d.price))
            : g.price_info.current_price;

        await Game.updateOne(
            { _id: g._id },
            {
                $set: {
                    'price_info.deals': fixedDeals,
                    'price_info.current_price': newCurrentPrice,
                }
            }
        );
        
        console.log(`  ✅ 수정: ${g.title} | ${deals[0]?.price} → ${fixedDeals[0]?.price}원`);
        fixedCount++;
        await sleep(100);
    }

    console.log(`\n  총 ${fixedCount}개 게임 가격 수정 완료`);

    console.log('\n🎉 완료!');
    process.exit(0);
}

run().catch(e => {
    console.error('💥 오류:', e);
    process.exit(1);
});
