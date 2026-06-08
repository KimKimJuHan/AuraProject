/**
 * fix_abnormal_prices.js
 * 비정상 가격(200만원↑) 62개 수정 + 유료이지만 가격=0인 게임 Steam 재조회
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('../models/Game');
const GameMetadata = require('../models/GameMetadata');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getSteamPrice(appId) {
    try {
        const res = await axios.get('https://store.steampowered.com/api/appdetails', {
            params: { appids: appId, cc: 'kr', filters: 'price_overview,is_free' },
            timeout: 8000
        });
        const data = res.data?.[appId]?.data;
        if (!data) return null;
        if (data.is_free === true) return { isFree: true, current_price: 0, regular_price: 0, discount_percent: 0 };
        const po = data.price_overview;
        if (!po) return null;
        return {
            isFree: false,
            current_price: Math.round((po.final || 0) / 100),      // Steam은 cents 단위로 줌 → 원화로
            regular_price: Math.round((po.initial || 0) / 100),
            discount_percent: po.discount_percent || 0,
            store_url: `https://store.steampowered.com/app/${appId}`,
            store_name: 'Steam',
        };
    } catch { return null; }
}

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    // ── 1. deals 배열의 뻥튀기 가격 역산정 ─────────────────────────────────
    console.log('[1] deals 배열의 뻥튀기 가격 복구...');
    const abnormal = await Game.find({
        'price_info.deals': { $exists: true, $not: { $size: 0 } },
        'price_info.current_price': { $gt: 0 }
    }).select('title price_info').lean();

    console.log(`  검사 대상: ${abnormal.length}개`);
    let fixedDealsCount = 0;

    for (const g of abnormal) {
        if (!g.price_info || !g.price_info.deals || g.price_info.deals.length === 0) continue;

        const steamDeal = g.price_info.deals.find(d => (d.shopName || '').toLowerCase().includes('steam'));
        const cp = g.price_info.current_price;
        
        // Steam deal 가격이 DB current_price보다 3배 이상 비싸면 (13.5배 곱해진 것으로 추정)
        if (steamDeal && steamDeal.price > cp * 3) {
            console.log(`\n  ⚠️ ${g.title} | DB 현재가: ₩${cp.toLocaleString()} / Steam Deal: ₩${steamDeal.price.toLocaleString()}`);
            
            const newDeals = g.price_info.deals.map(d => {
                const fixedPrice = Math.round((d.price / 1350) * 100);
                const fixedRegular = Math.round((d.regularPrice / 1350) * 100);
                return { ...d, price: fixedPrice, regularPrice: fixedRegular };
            });

            await Game.updateOne(
                { _id: g._id },
                { $set: { 'price_info.deals': newDeals } }
            );

            console.log(`  ✅ 복구완료 | Steam Deal ₩${steamDeal.price.toLocaleString()} → ₩${Math.round((steamDeal.price / 1350) * 100).toLocaleString()}`);
            fixedDealsCount++;
        }
    }

    console.log('\n=== 복구 결과 ===');
    console.log('deals 뻥튀기 복구 완료:', fixedDealsCount, '개');

    process.exit(0);
}

run().catch(e => { console.error('오류:', e.message); process.exit(1); });
