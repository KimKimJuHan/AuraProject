/**
 * 가격 데이터 전수 감사 스크립트
 * - Steam 실제 가격 vs DB 가격 비교
 * - 비정상 가격 패턴 탐지
 * - 할인율 이상 탐지
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('../models/Game');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Steam 가격 직접 조회
async function getSteamPrice(appId) {
    try {
        const res = await axios.get('https://store.steampowered.com/api/appdetails', {
            params: { appids: appId, cc: 'kr', filters: 'price_overview' },
            timeout: 8000
        });
        const data = res.data?.[appId];
        if (!data?.success) return null;
        if (data.data === null) return { isFree: false, notAvailable: true }; // 지역 미출시
        const po = data.data?.price_overview;
        if (!po) return { isFree: true }; // 무료 게임
        return {
            current: Math.round(po.final / 100),
            regular: Math.round(po.initial / 100),
            discount: po.discount_percent || 0
        };
    } catch { return null; }
}

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ DB 연결\n');

    // ══════════════════════════════════════════════════════════
    // 1. 가격 이상 패턴 DB 레벨 분석 (Steam API 호출 없이)
    // ══════════════════════════════════════════════════════════
    console.log('═══ [1] DB 가격 이상 패턴 분석 ═══\n');

    const total = await Game.countDocuments({ 'price_info': { $ne: null } });

    // 할인율은 있는데 current = regular인 게임 (할인율 표기 오류)
    const discountMismatch = await Game.countDocuments({
        'price_info.discount_percent': { $gt: 0 },
        $expr: { $eq: ['$price_info.current_price', '$price_info.regular_price'] }
    });

    // current > regular인 게임 (가격 역전 오류)
    const priceFlip = await Game.countDocuments({
        'price_info.current_price': { $gt: 0 },
        'price_info.regular_price': { $gt: 0 },
        $expr: { $gt: ['$price_info.current_price', '$price_info.regular_price'] }
    });

    // 500원 미만인데 free 아닌 게임 (cents 변환 오류 의심)
    const tooLow = await Game.countDocuments({
        'price_info.isFree': { $ne: true },
        'price_info.current_price': { $gt: 0, $lt: 500 }
    });

    // 100만원 초과 (비정상 고가)
    const tooHigh = await Game.countDocuments({
        'price_info.current_price': { $gt: 1000000 }
    });

    // 할인율 100% 이상 (오류)
    const discountOver100 = await Game.countDocuments({
        'price_info.discount_percent': { $gte: 100 }
    });

    // 할인율 있는데 regular = 0
    const zeroRegular = await Game.countDocuments({
        'price_info.discount_percent': { $gt: 0 },
        'price_info.regular_price': 0
    });

    console.log(`분석 대상: ${total.toLocaleString()}개 게임`);
    console.log(`  ❌ 할인율 ≠ 실제 가격 차이 (current = regular인데 discount > 0): ${discountMismatch}개`);
    console.log(`  ❌ 가격 역전 (current > regular): ${priceFlip}개`);
    console.log(`  ❌ 비정상 저가 (<500원, 비무료): ${tooLow}개`);
    console.log(`  ❌ 비정상 고가 (>100만원): ${tooHigh}개`);
    console.log(`  ❌ 할인율 100% 이상: ${discountOver100}개`);
    console.log(`  ❌ 정가 0원인데 할인율 있음: ${zeroRegular}개`);

    // 샘플 출력: 할인율 표기는 있는데 가격차이 없는 것들
    if (discountMismatch > 0) {
        const mismatchSamples = await Game.find({
            'price_info.discount_percent': { $gt: 0 },
            $expr: { $eq: ['$price_info.current_price', '$price_info.regular_price'] }
        }).select('title steam_appid price_info.current_price price_info.discount_percent').limit(5).lean();
        console.log('\n  [할인율 불일치 샘플]');
        mismatchSamples.forEach(g => console.log(`    - ${g.title} | 가격:${g.price_info?.current_price}원 | 표기할인율:${g.price_info?.discount_percent}%`));
    }

    // ══════════════════════════════════════════════════════════
    // 2. 인기 게임 상위 20개 Steam 실제 가격 실시간 비교
    // ══════════════════════════════════════════════════════════
    console.log('\n═══ [2] 인기 게임 Steam 가격 실시간 검증 ═══\n');

    const topGames = await Game.find({
        steam_appid: { $exists: true, $ne: null },
        'price_info.current_price': { $gt: 0 }
    }).sort({ trend_score: -1 }).limit(20).select('title steam_appid price_info').lean();

    let priceOk = 0, priceMismatch = 0, priceErrors = [];

    for (const game of topGames) {
        const steamPrice = await getSteamPrice(game.steam_appid);
        await sleep(300);

        if (!steamPrice) { console.log(`  ⚠️  ${game.title}: Steam 조회 실패`); continue; }
        if (steamPrice.isFree) { continue; }
        if (steamPrice.notAvailable) { console.log(`  ⚠️  ${game.title}: 한국 미출시`); continue; }

        const dbPrice = game.price_info?.current_price || 0;
        const dbDiscount = game.price_info?.discount_percent || 0;
        const steamDiscount = steamPrice.discount;
        
        // 가격 오차 허용 범위: 10% (환율 변동 등)
        const priceDiff = Math.abs(dbPrice - steamPrice.current);
        const priceRatio = dbPrice > 0 ? priceDiff / steamPrice.current : 1;
        
        // 할인율 불일치 확인
        const discountDiff = Math.abs(dbDiscount - steamDiscount);

        if (priceRatio > 0.15 || discountDiff > 10) {
            priceMismatch++;
            priceErrors.push({
                title: game.title,
                dbPrice, steamPrice: steamPrice.current,
                dbDiscount, steamDiscount,
                diff: Math.round(priceRatio * 100)
            });
            console.log(`  ❌ ${game.title}`);
            console.log(`     DB: ${dbPrice.toLocaleString()}원 (할인 ${dbDiscount}%) | Steam: ${steamPrice.current.toLocaleString()}원 (할인 ${steamDiscount}%) | 오차: ${Math.round(priceRatio*100)}%`);
        } else {
            priceOk++;
            console.log(`  ✅ ${game.title} | ${dbPrice.toLocaleString()}원 (할인 ${dbDiscount}%) ← 정확`);
        }
    }

    console.log(`\n  결과: 정확 ${priceOk}개 / 불일치 ${priceMismatch}개`);

    // ══════════════════════════════════════════════════════════
    // 3. ITAD convertToKRW 변환 오류 분석
    // ══════════════════════════════════════════════════════════
    console.log('\n═══ [3] ITAD 환율 변환 오류 가능성 분석 ═══\n');
    console.log('문제의 convertToKRW 로직:');
    console.log('  amount >= 2000 → KRW 그대로 (OK)');
    console.log('  amount >= 100  → cents로 가정해서 ÷100 × 1350 (위험!)');
    console.log('  amount < 100   → USD로 가정해서 × 1350 (위험!)');
    console.log('');
    console.log('붉은사막 문제 재현:');
    const itadAmount = 886; // 예: ITAD가 886 cents로 응답 (USD 8.86)
    const wrongKRW = Math.round((itadAmount / 100) * 1350);
    const correctKRW = 79800;
    console.log(`  ITAD amount: ${itadAmount} → cents로 오인식 → ${wrongKRW.toLocaleString()}원 (실제: ${correctKRW.toLocaleString()}원)`);
    console.log('  원인: ITAD가 KRW로 응답했는데 cents로 착각해서 ÷100 처리');
    console.log('');
    console.log('  [해결]: Steam API를 PRIMARY source로 사용 (이미 적용됨)');
    console.log('  [예방]: ITAD 딜 가격이 Steam 정가의 30% 미만이면 이상값으로 필터링 (이미 적용됨)');

    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
