/**
 * fill_itad_uuid.js
 *
 * itad.uuid가 없는 GameMetadata에 UUID를 채우고
 * 가격 정보까지 한 번에 저장합니다.
 *
 * 실행: node scripts/fill_itad_uuid.js
 * 테스트: node scripts/fill_itad_uuid.js --limit 50
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
const limitArg = process.argv.find(a => a.startsWith('--limit'));
const LIMIT = limitArg ? parseInt(process.argv[process.argv.indexOf(limitArg) + 1] || limitArg.split('=')[1]) : 0;

// Steam appid → ITAD UUID 단건 조회
async function lookupUUID(steamAppId, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await axios.get(
                `https://api.isthereanydeal.com/games/lookup/v1?key=${ITAD_API_KEY}&appid=${steamAppId}`,
                { timeout: 8000 }
            );
            return res.data?.game?.id || res.data?.id || null;
        } catch (e) {
            const status = e.response?.status;
            if (status === 429 && attempt < retries) {
                console.log(`  ⏳ rate limit — 10초 대기`);
                await sleep(10000);
            } else if (attempt < retries) {
                await sleep(2000);
            }
        }
    }
    return null;
}

// ITAD 가격 배치 조회
async function fetchPrices(uuids) {
    try {
        const res = await axios.post(
            `https://api.isthereanydeal.com/games/prices/v3?key=${ITAD_API_KEY}&country=KR&capacity=15`,
            uuids,
            { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
        );
        return res.data || [];
    } catch { return []; }
}

async function run() {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ DB 연결 완료');

    // itad.uuid 없는 GameMetadata 조회
    const noUuidMeta = await GameMetadata.find({
        $or: [
            { 'itad.uuid': { $exists: false } },
            { 'itad.uuid': null },
            { 'itad.uuid': '' }
        ]
    }).select('steamAppId').lean();

    const targets = LIMIT > 0 ? noUuidMeta.slice(0, LIMIT) : noUuidMeta;

    console.log(`📋 UUID 없는 GameMetadata: ${noUuidMeta.length}개`);
    console.log(`   처리 대상: ${targets.length}개`);
    console.log(`⏱  예상 소요: 약 ${Math.ceil(targets.length * 0.5 / 60)}분\n`);

    let uuidFound = 0;
    let uuidNotFound = 0;
    let priceUpdated = 0;
    let failStreak = 0;
    const FAIL_LIMIT = 10;

    const pendingPrices = []; // { steamAppId, uuid }

    for (let i = 0; i < targets.length; i++) {
        const meta = targets[i];
        const progress = `[${i + 1}/${targets.length}]`;

        // 연속 실패 시 휴식
        if (failStreak >= FAIL_LIMIT) {
            console.log(`\n  ⏸  ${FAIL_LIMIT}연속 실패 — 30초 휴식\n`);
            await sleep(30000);
            failStreak = 0;
        }

        const uuid = await lookupUUID(meta.steamAppId);
        await sleep(400);

        if (!uuid) {
            failStreak++;
            uuidNotFound++;
            continue;
        }

        failStreak = 0;

        // GameMetadata UUID 저장
        await GameMetadata.updateOne(
            { steamAppId: meta.steamAppId },
            { $set: { 'itad.uuid': uuid } }
        );
        uuidFound++;
        pendingPrices.push({ steamAppId: meta.steamAppId, uuid });

        // 20개 모이면 가격 배치 조회
        if (pendingPrices.length >= 20 || i === targets.length - 1) {
            const uuids = pendingPrices.map(p => p.uuid);
            const prices = await fetchPrices(uuids);
            await sleep(600);

            const bulkOps = [];
            for (let j = 0; j < pendingPrices.length; j++) {
                const priceData = prices[j];
                if (!priceData?.deals?.length) continue;

                const sorted = [...priceData.deals].sort((a, b) => a.price.amount - b.price.amount);
                const best = sorted[0];
                const currentPrice = Math.round(best.price.amount);
                if (currentPrice > 1000000) continue;

                bulkOps.push({
                    updateOne: {
                        filter: { steam_appid: pendingPrices[j].steamAppId },
                        update: {
                            $set: {
                                'price_info.current_price': currentPrice,
                                'price_info.regular_price': Math.round(best.regular.amount),
                                'price_info.discount_percent': best.cut || 0,
                                'price_info.store_url': best.url,
                                'price_info.store_name': best.shop?.name || 'Unknown',
                                'price_info.expiry': best.drm?.[0]?.expiry
                                    ? new Date(best.drm[0].expiry)
                                    : (priceData.until ? new Date(priceData.until) : null),
                                'price_info.deals': sorted.slice(0, 15).map(d => ({
                                    shopName: d.shop?.name || '',
                                    price: Math.round(d.price.amount),
                                    regularPrice: Math.round(d.regular.amount),
                                    discount: d.cut || 0,
                                    url: d.url,
                                    until: d.until || null
                                })),
                                lastUpdated: new Date()
                            }
                        }
                    }
                });
                priceUpdated++;
            }

            if (bulkOps.length > 0) await Game.bulkWrite(bulkOps);
            pendingPrices.length = 0;
        }

        // 50개마다 진행률 출력
        if ((i + 1) % 50 === 0) {
            console.log(`${progress} UUID:${uuidFound} / 미발견:${uuidNotFound} / 가격:${priceUpdated}`);
        }
    }

    const withDeals = await Game.countDocuments({ 'price_info.deals': { $exists: true, $not: { $size: 0 } } });
    const total = await Game.countDocuments();

    console.log('\n════════════════════════════════════');
    console.log('🎉 완료!');
    console.log(`   UUID 획득: ${uuidFound}개`);
    console.log(`   UUID 미발견: ${uuidNotFound}개`);
    console.log(`   가격 갱신: ${priceUpdated}개`);
    console.log(`   멀티샵 딜 보유: ${withDeals}개 (${Math.round(withDeals/total*100)}%)`);
    console.log('════════════════════════════════════');
    process.exit(0);
}

run().catch(err => {
    console.error('💥 크래시:', err);
    process.exit(1);
});