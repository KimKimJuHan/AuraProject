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

    // ── 1. 환율 중복 곱셈으로 부풀려진 가격 수정 ─────────────────────────────────
    console.log('[1] 비정상 고가(4.5만원 이상) 게임 원가 복구...');
    const abnormal = await Game.find({
        $or: [
            { 'price_info.current_price': { $gte: 45000 } },
            { 'price_info.regular_price': { $gte: 45000 } }
        ],
        steam_appid: { $exists: true, $ne: null }
    }).select('title steam_appid price_info').lean();

    console.log(`  대상: ${abnormal.length}개`);
    let fixed1 = 0, failed1 = 0;

    for (const g of abnormal) {
        if (!g.steam_appid) {
            await Game.updateOne({ _id: g._id }, { $set: { 'price_info.current_price': 0 } });
            continue;
        }
        const priceData = await getSteamPrice(g.steam_appid);
        if (priceData && priceData.regular_price > 0 && priceData.regular_price < g.price_info.regular_price * 0.6) {
            // Steam 정가가 현재 DB 정가보다 40% 이상 저렴하다면 (뻥튀기된 경우)
            await Game.updateOne({ _id: g._id }, { $set: {
                'price_info.current_price': priceData.current_price,
                'price_info.regular_price': priceData.regular_price,
                'price_info.discount_percent': priceData.discount_percent,
                'price_info.isFree': priceData.isFree,
                ...(priceData.store_url ? { 'price_info.store_url': priceData.store_url } : {}),
            }});
            console.log(`  ✅ 복구완료 | ${g.title}: 현재가 ₩${g.price_info.current_price.toLocaleString()} → ₩${priceData.current_price.toLocaleString()} / 정가 ₩${g.price_info.regular_price?.toLocaleString()} → ₩${priceData.regular_price.toLocaleString()}`);
            fixed1++;
        } else if (priceData && priceData.current_price === 0 && priceData.isFree) {
             // 무료 게임으로 바뀐 경우
             await Game.updateOne({ _id: g._id }, { $set: {
                'price_info.current_price': 0,
                'price_info.regular_price': 0,
                'price_info.discount_percent': 0,
                'price_info.isFree': true,
            }});
             console.log(`  ✅ 무료전환 | ${g.title}`);
             fixed1++;
        } else {
            // Steam도 실패 → 0으로 초기화
            await Game.updateOne({ _id: g._id }, { $set: { 'price_info.current_price': 0 } });
            failed1++;
        }
        await sleep(300);
    }
    console.log(`  결과: 수정 ${fixed1}개, 초기화 ${failed1}개\n`);

    console.log('=== 복구 결과 ===');
    console.log('뻥튀기 가격 복구 완료:', fixed1, '개');

    process.exit(0);
}

run().catch(e => { console.error('오류:', e.message); process.exit(1); });
