/**
 * test_itad.js
 *
 * ITAD API 연동 전체 테스트
 * 1. API 키 유효성 확인
 * 2. DB의 실제 게임 샘플로 가격 조회 테스트
 * 3. ITAD UUID 없는 게임 비율 파악
 * 4. 가격 데이터 품질 확인 (비정상 가격 감지)
 *
 * 실행: node scripts/test_itad.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('../models/Game');
const GameMetadata = require('../models/GameMetadata');

const { MONGODB_URI, ITAD_API_KEY } = process.env;

if (!MONGODB_URI) { console.error('❌ MONGODB_URI 없음'); process.exit(1); }
if (!ITAD_API_KEY) { console.error('❌ ITAD_API_KEY 없음'); process.exit(1); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── ITAD UUID 조회 (steamAppId → ITAD uuid) ────────────────────────────────
async function lookupITADUuid(steamAppId) {
    try {
        // ITAD lookup: steamAppId → ITAD uuid
        const res = await axios.get(
            `https://api.isthereanydeal.com/games/lookup/v1?key=${ITAD_API_KEY}&appid=${steamAppId}`,
            { timeout: 8000 }
        );
        return res.data?.game?.id || res.data?.id || null;
    } catch (e) {
        return null;
    }
}

// ── ITAD 가격 조회 ──────────────────────────────────────────────────────────
async function getITADPrice(itadUuid) {
    try {
        const res = await axios.post(
            `https://api.isthereanydeal.com/games/prices/v3?key=${ITAD_API_KEY}&country=KR&capacity=5`,
            [itadUuid],
            { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
        );
        const deals = res.data?.[0]?.deals || [];
        if (deals.length === 0) return null;
        const sorted = [...deals].sort((a, b) => a.price.amount - b.price.amount);
        const best = sorted[0];
        return {
            current_price: Math.round(best.price.amount),
            regular_price: Math.round(best.regular.amount),
            discount_percent: best.cut || 0,
            store_name: best.shop?.name || 'Unknown',
            deal_count: deals.length,
        };
    } catch (e) {
        return null;
    }
}

async function run() {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ DB 연결 완료\n');

    // ── 1. API 키 유효성 확인 ─────────────────────────────────────────────
    console.log('=== 1. ITAD API 키 유효성 확인 ===');
    // Hades ITAD uuid로 가격 조회 → API 키 유효성 + 엔드포인트 동시 확인
    const TEST_UUID = '018d937e-c2a1-7000-a58c-52b5cae9d5c7'; // Hades
    try {
        const res = await axios.post(
            `https://api.isthereanydeal.com/games/prices/v3?key=${ITAD_API_KEY}&country=KR&capacity=5`,
            [TEST_UUID],
            { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
        );
        const deals = res.data?.[0]?.deals || [];
        console.log(`✅ API 키 유효 — Hades 가격 딜 ${deals.length}개 확인\n`);
    } catch (e) {
        const status = e.response?.status;
        console.error(`❌ API 오류 (${status}): ${e.message}`);
        console.error('   응답:', JSON.stringify(e.response?.data)?.slice(0, 200));
        if (status === 401 || status === 403) {
            console.error('   → API 키를 확인하세요: https://isthereanydeal.com/dev/');
        } else if (status === 404) {
            console.error('   → ITAD API 엔드포인트가 변경됐을 수 있습니다');
        }
        process.exit(1);
    }

    // ── 2. GameMetadata UUID 보유 현황 ────────────────────────────────────
    console.log('=== 2. ITAD UUID 보유 현황 ===');
    const totalGames = await Game.countDocuments();
    const totalMeta = await GameMetadata.countDocuments();
    const hasUuid = await GameMetadata.countDocuments({ 'itad.uuid': { $exists: true, $ne: null, $ne: '' } });
    const noUuid = totalMeta - hasUuid;

    console.log(`전체 게임: ${totalGames}개`);
    console.log(`GameMetadata 보유: ${totalMeta}개`);
    console.log(`ITAD UUID 있음: ${hasUuid}개 (${Math.round(hasUuid/totalGames*100)}%)`);
    console.log(`ITAD UUID 없음: ${noUuid}개\n`);

    // ── 3. 실제 가격 조회 테스트 (샘플 10개) ─────────────────────────────
    console.log('=== 3. 실제 가격 조회 테스트 (샘플 10개) ===');
    const sampleMeta = await GameMetadata.find({
        'itad.uuid': { $exists: true, $ne: null }
    }).limit(10).lean();

    let priceOk = 0;
    let priceNull = 0;
    let priceAbnormal = 0;

    for (const meta of sampleMeta) {
        const game = await Game.findOne({ steam_appid: meta.steamAppId }).select('title price_info').lean();
        const price = await getITADPrice(meta.itad.uuid);
        await sleep(500);

        if (!price) {
            console.log(`  ❌ 가격 없음: ${game?.title || meta.steamAppId}`);
            priceNull++;
            continue;
        }

        // 비정상 가격 감지 (100만원 초과)
        if (price.current_price > 1000000) {
            console.log(`  ⚠️  비정상 가격 (USD?): ${game?.title} — ₩${price.current_price.toLocaleString()} (${price.store_name})`);
            priceAbnormal++;
            continue;
        }

        const dbPrice = game?.price_info?.current_price || 0;
        const diff = dbPrice > 0 ? Math.abs(dbPrice - price.current_price) : 0;
        const diffNote = dbPrice > 0 ? ` [DB:₩${dbPrice.toLocaleString()} 차이:₩${diff.toLocaleString()}]` : '';

        console.log(`  ✅ ${game?.title}`);
        console.log(`     최저가: ₩${price.current_price.toLocaleString()} (${price.store_name}) | 할인: ${price.discount_percent}% | 샵수: ${price.deal_count}${diffNote}`);
        priceOk++;
    }

    console.log(`\n결과: 정상 ${priceOk} / 없음 ${priceNull} / 비정상 ${priceAbnormal}\n`);

    // ── 4. UUID 없는 게임 Steam API로 UUID 조회 테스트 (샘플 5개) ─────────
    console.log('=== 4. UUID 없는 게임 → ITAD 조회 테스트 (샘플 5개) ===');
    const noUuidGames = await Game.find({
        steam_appid: { $exists: true, $ne: null },
        'price_info.current_price': { $in: [0, null] }
    }).select('title steam_appid').limit(5).lean();

    for (const game of noUuidGames) {
        const uuid = await lookupITADUuid(game.steam_appid);
        await sleep(500);
        if (uuid) {
            const price = await getITADPrice(uuid);
            await sleep(500);
            if (price) {
                console.log(`  ✅ ${game.title} → uuid: ${uuid} → ₩${price.current_price.toLocaleString()}`);
            } else {
                console.log(`  🟡 ${game.title} → uuid: ${uuid} → 가격 없음`);
            }
        } else {
            console.log(`  ❌ ${game.title} → ITAD UUID 없음`);
        }
    }

    // ── 5. 가격 0원 게임 현황 ─────────────────────────────────────────────
    console.log('\n=== 5. 가격 0원 게임 현황 ===');
    const freeGames = await Game.countDocuments({ 'price_info.isFree': true });
    const zeroPriceGames = await Game.countDocuments({
        'price_info.isFree': { $ne: true },
        $or: [{ 'price_info.current_price': 0 }, { 'price_info.current_price': { $exists: false } }]
    });
    const hasDeal = await Game.countDocuments({ 'price_info.deals': { $exists: true, $not: { $size: 0 } } });

    console.log(`무료 게임: ${freeGames}개`);
    console.log(`가격 0원 (유료인데 가격 없음): ${zeroPriceGames}개`);
    console.log(`멀티샵 딜 있음: ${hasDeal}개 (${Math.round(hasDeal/totalGames*100)}%)`);

    console.log('\n════════════════════════════════════');
    console.log('테스트 완료!');
    console.log('════════════════════════════════════');
    process.exit(0);
}

run().catch(err => {
    console.error('💥 크래시:', err);
    process.exit(1);
});