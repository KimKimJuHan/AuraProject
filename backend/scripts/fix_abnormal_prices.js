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
    console.log('✅ DB 연결 완료\n');

    // ── 1. 비정상 가격 (200만원 초과) 수정 ─────────────────────────────────
    console.log('[1] 비정상 가격 게임 수정...');
    const abnormal = await Game.find({
        'price_info.current_price': { $gt: 2000000 }
    }).select('title steam_appid price_info.current_price').lean();

    console.log(`  대상: ${abnormal.length}개`);
    let fixed1 = 0, failed1 = 0;

    for (const g of abnormal) {
        if (!g.steam_appid) {
            await Game.updateOne({ _id: g._id }, { $set: { 'price_info.current_price': 0 } });
            continue;
        }
        const priceData = await getSteamPrice(g.steam_appid);
        if (priceData) {
            await Game.updateOne({ _id: g._id }, { $set: {
                'price_info.current_price': priceData.current_price,
                'price_info.regular_price': priceData.regular_price,
                'price_info.discount_percent': priceData.discount_percent,
                'price_info.isFree': priceData.isFree,
                ...(priceData.store_url ? { 'price_info.store_url': priceData.store_url } : {}),
            }});
            console.log(`  ✅ ${g.title}: ₩${g.price_info.current_price.toLocaleString()} → ₩${priceData.current_price.toLocaleString()}`);
            fixed1++;
        } else {
            // Steam도 실패 → 0으로 초기화
            await Game.updateOne({ _id: g._id }, { $set: { 'price_info.current_price': 0 } });
            failed1++;
        }
        await sleep(300);
    }
    console.log(`  결과: 수정 ${fixed1}개, 초기화 ${failed1}개\n`);

    // ── 2. 유료이지만 가격=0인 게임 Steam 재조회 ─────────────────────────
    console.log('[2] 유료게임 가격=0 수정...');
    const zeroPricePaid = await Game.find({
        'price_info.isFree': { $ne: true },
        'price_info.current_price': { $lte: 0 },
        steam_appid: { $exists: true, $ne: null }
    }).select('title steam_appid').lean();

    console.log(`  대상: ${zeroPricePaid.length}개`);
    let fixed2 = 0, nowFree = 0, noData2 = 0;

    for (const g of zeroPricePaid) {
        const priceData = await getSteamPrice(g.steam_appid);
        if (!priceData) { noData2++; await sleep(200); continue; }

        if (priceData.isFree) {
            await Game.updateOne({ _id: g._id }, { $set: {
                'price_info.isFree': true,
                'price_info.current_price': 0,
                'price_info.deals': [],
            }});
            nowFree++;
        } else if (priceData.current_price > 0) {
            await Game.updateOne({ _id: g._id }, { $set: {
                'price_info.current_price': priceData.current_price,
                'price_info.regular_price': priceData.regular_price,
                'price_info.discount_percent': priceData.discount_percent,
                'price_info.isFree': false,
                'price_info.store_url': priceData.store_url,
                'price_info.store_name': 'Steam',
            }});
            fixed2++;
            if (fixed2 % 20 === 0) console.log(`  진행: ${fixed2}개 수정됨`);
        }
        await sleep(400);
    }
    console.log(`  결과: 가격 복구 ${fixed2}개, 무료 확인 ${nowFree}개, 데이터없음 ${noData2}개\n`);

    // ── 3. isFree=true인데 deals가 있는 게임 다시 정리 ─────────────────────
    console.log('[3] 무료게임 deals 잔여 정리...');
    const freeWithDeals = await Game.countDocuments({
        'price_info.isFree': true,
        'price_info.deals': { $exists: true, $not: { $size: 0 } }
    });
    if (freeWithDeals > 0) {
        await Game.updateMany(
            { 'price_info.isFree': true },
            { $set: { 'price_info.deals': [], 'price_info.current_price': 0 } }
        );
        console.log(`  ✅ ${freeWithDeals}개 무료게임 deals 정리\n`);
    } else {
        console.log('  ✅ 무료게임 deals 없음 (이미 정리됨)\n');
    }

    // ── 최종 현황 ────────────────────────────────────────────────────────────
    const remaining = await Game.countDocuments({ 'price_info.current_price': { $gt: 2000000 } });
    const stillZero = await Game.countDocuments({ 'price_info.isFree': { $ne: true }, 'price_info.current_price': { $lte: 0 } });
    console.log('=== 수정 후 현황 ===');
    console.log('비정상 가격 잔여:', remaining, '개');
    console.log('유료가격=0 잔여:', stillZero, '개');

    process.exit(0);
}

run().catch(e => { console.error('오류:', e.message); process.exit(1); });
