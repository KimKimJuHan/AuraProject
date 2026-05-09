/**
 * repatch_prices.js
 *
 * 전체 게임 ITAD 가격 일괄 갱신
 * - GameMetadata의 itad.uuid로 prices/v3 호출
 * - deals 배열, 최저가, 할인율 업데이트
 * - 비정상 가격(100만원 초과) 자동 감지 및 수정
 *
 * 실행: node scripts/repatch_prices.js
 * 빠른 실행: node scripts/repatch_prices.js --limit 500
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

// CLI 옵션
const limitArg = process.argv.find(a => a.startsWith('--limit'));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1] || process.argv[process.argv.indexOf(limitArg) + 1]) : 0;
const BATCH_SIZE = 20; // ITAD API 한 번에 최대 20개 UUID

async function fetchBatchPrices(uuids) {
    try {
        const res = await axios.post(
            `https://api.isthereanydeal.com/games/prices/v3?key=${ITAD_API_KEY}&country=KR&capacity=20`,
            uuids,
            { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
        );
        return res.data || [];
    } catch (e) {
        console.error(`  배치 오류: ${e.response?.status} ${e.message}`);
        return [];
    }
}

async function run() {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ DB 연결 완료');

    // UUID 있는 게임 전체 조회
    const allMeta = await GameMetadata.find({
        'itad.uuid': { $exists: true, $ne: null }
    }).select('steamAppId itad.uuid').lean();

    const targets = LIMIT > 0 ? allMeta.slice(0, LIMIT) : allMeta;
    console.log(`📋 갱신 대상: ${targets.length}개 (전체: ${allMeta.length}개)`);
    console.log(`⏱  예상 소요: 약 ${Math.ceil(targets.length / BATCH_SIZE * 1.5 / 60)}분\n`);

    let updated = 0;
    let noDeals = 0;
    let abnormal = 0;
    let errors = 0;

    // BATCH_SIZE개씩 묶어서 처리
    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
        const batch = targets.slice(i, i + BATCH_SIZE);
        const uuids = batch.map(m => m.itad.uuid);
        const progress = `[${Math.min(i + BATCH_SIZE, targets.length)}/${targets.length}]`;

        const priceResults = await fetchBatchPrices(uuids);
        await sleep(800);

        const bulkOps = [];

        for (let j = 0; j < batch.length; j++) {
            const meta = batch[j];
            const priceData = priceResults[j];

            if (!priceData || !priceData.deals || priceData.deals.length === 0) {
                noDeals++;
                continue;
            }

            const deals = priceData.deals;
            const sorted = [...deals].sort((a, b) => a.price.amount - b.price.amount);
            const best = sorted[0];

            const currentPrice = Math.round(best.price.amount);
            const regularPrice = Math.round(best.regular.amount);

            // 비정상 가격 감지 (100만원 초과 = USD로 저장된 것)
            if (currentPrice > 1000000) {
                abnormal++;
                console.log(`  ⚠️  비정상 가격 스킵 (appid: ${meta.steamAppId}): ₩${currentPrice.toLocaleString()}`);
                continue;
            }

            bulkOps.push({
                updateOne: {
                    filter: { steam_appid: meta.steamAppId },
                    update: {
                        $set: {
                            'price_info.current_price': currentPrice,
                            'price_info.regular_price': regularPrice,
                            'price_info.discount_percent': best.cut || 0,
                            'price_info.store_url': best.url,
                            'price_info.store_name': best.shop?.name || 'Unknown',
                            'price_info.expiry': priceData.deals?.[0]?.until
                                ? new Date(priceData.deals[0].until) : null,
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
            updated++;
        }

        if (bulkOps.length > 0) {
            try {
                await Game.bulkWrite(bulkOps);
            } catch (e) {
                console.error(`  벌크 저장 오류: ${e.message}`);
                errors++;
            }
        }

        // 진행률 출력 (10배치마다)
        if ((i / BATCH_SIZE) % 10 === 0) {
            console.log(`${progress} 진행 중... (갱신:${updated} / 딜없음:${noDeals} / 오류:${errors})`);
        }
    }

    console.log('\n════════════════════════════════════');
    console.log('🎉 가격 갱신 완료!');
    console.log(`   ✅ 갱신: ${updated}개`);
    console.log(`   ⏩ 딜 없음: ${noDeals}개`);
    console.log(`   ⚠️  비정상 가격: ${abnormal}개`);
    console.log(`   ❌ 오류: ${errors}개`);
    console.log('════════════════════════════════════');

    // 갱신 후 현황
    const withDeals = await Game.countDocuments({
        'price_info.deals': { $exists: true, $not: { $size: 0 } }
    });
    const total = await Game.countDocuments();
    console.log(`\n멀티샵 딜 보유: ${withDeals}개 (${Math.round(withDeals/total*100)}%)`);

    process.exit(0);
}

run().catch(err => {
    console.error('💥 크래시:', err);
    process.exit(1);
});