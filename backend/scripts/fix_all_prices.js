/**
 * 전체 가격 일괄 수정 스크립트 (Steam API 기준)
 * - 가격 역전(current > regular) 게임
 * - 할인율 100% 이상 게임
 * - 인기 상위 100개 게임 즉시 갱신
 * Steam API를 기준으로 삼아 DB를 정확한 값으로 덮어씀
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('../models/Game');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getSteamPrice(appId) {
    try {
        const res = await axios.get('https://store.steampowered.com/api/appdetails', {
            params: { appids: appId, cc: 'kr', filters: 'price_overview,basic_info' },
            timeout: 8000
        });
        const d = res.data?.[appId];
        if (!d?.success) return null;
        if (d.data === null) return { skip: true }; // 지역 미출시
        if (d.data?.is_free) return { isFree: true, current: 0, regular: 0, discount: 0 };
        const po = d.data?.price_overview;
        if (!po) return null;
        return {
            current: Math.round(po.final / 100),
            regular: Math.round(po.initial / 100),
            discount: po.discount_percent || 0,
            isFree: false
        };
    } catch { return null; }
}

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ DB 연결\n');

    // 수정 대상 수집
    const targets = new Map(); // steamAppId → game

    // 1. 가격 역전 게임
    const flipped = await Game.find({
        steam_appid: { $exists: true, $ne: null },
        'price_info.current_price': { $gt: 0 },
        'price_info.regular_price': { $gt: 0 },
        $expr: { $gt: ['$price_info.current_price', '$price_info.regular_price'] }
    }).select('_id title steam_appid price_info').lean();
    for (const g of flipped) targets.set(g.steam_appid, g);
    console.log(`가격 역전 게임: ${flipped.length}개`);

    // 2. 할인율 100% 이상 게임
    const badDiscount = await Game.find({
        steam_appid: { $exists: true, $ne: null },
        'price_info.discount_percent': { $gte: 100 }
    }).select('_id title steam_appid price_info').lean();
    for (const g of badDiscount) targets.set(g.steam_appid, g);
    console.log(`할인율 100%↑ 게임: ${badDiscount.length}개`);

    // 3. 정가 0원인데 할인율 있는 게임
    const zeroBase = await Game.find({
        steam_appid: { $exists: true, $ne: null },
        'price_info.discount_percent': { $gt: 0 },
        'price_info.regular_price': 0
    }).select('_id title steam_appid price_info').lean();
    for (const g of zeroBase) targets.set(g.steam_appid, g);
    console.log(`정가 0원 + 할인율 게임: ${zeroBase.length}개`);

    // 4. 인기 상위 100개 (트렌드 높은 게임들 먼저 갱신)
    const topGames = await Game.find({
        steam_appid: { $exists: true, $ne: null },
        'price_info.current_price': { $gt: 0 }
    }).sort({ trend_score: -1 }).limit(100).select('_id title steam_appid price_info').lean();
    for (const g of topGames) {
        if (!targets.has(g.steam_appid)) targets.set(g.steam_appid, g);
    }

    const gameList = Array.from(targets.values());
    console.log(`\n총 수정 대상: ${gameList.length}개\n`);

    let fixed = 0, skipped = 0, failed = 0;

    for (let i = 0; i < gameList.length; i++) {
        const game = gameList[i];
        const steamPrice = await getSteamPrice(game.steam_appid);
        await sleep(400);

        if (!steamPrice || steamPrice.skip) { skipped++; continue; }

        const expiry = steamPrice.discount > 0
            ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            : null;

        const steamDeal = {
            shopName: 'Steam',
            price: steamPrice.current,
            regularPrice: steamPrice.regular,
            discount: steamPrice.discount,
            url: `https://store.steampowered.com/app/${game.steam_appid}/`
        };

        try {
            await Game.updateOne(
                { _id: game._id },
                { $set: {
                    'price_info.current_price': steamPrice.current,
                    'price_info.regular_price': steamPrice.regular,
                    'price_info.discount_percent': steamPrice.discount,
                    'price_info.isFree': steamPrice.isFree,
                    'price_info.expiry': expiry,
                    'price_info.deals.0': steamDeal, // Steam 딜을 첫 번째로
                    lastUpdated: new Date()
                }}
            );
            fixed++;

            const wasBad = game.price_info?.current_price !== steamPrice.current;
            const marker = wasBad ? '🔧' : '✅';
            if (i % 10 === 0 || wasBad) {
                console.log(`${marker} [${i+1}/${gameList.length}] ${game.title}`);
                if (wasBad) {
                    console.log(`    DB: ${game.price_info?.current_price?.toLocaleString()}원 → Steam: ${steamPrice.current.toLocaleString()}원 (할인 ${steamPrice.discount}%)`);
                }
            }
        } catch (e) {
            failed++;
            console.error(`  ❌ ${game.title}: ${e.message}`);
        }
    }

    console.log(`\n🎉 완료: 수정 ${fixed}개 / 스킵 ${skipped}개 / 실패 ${failed}개`);
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
