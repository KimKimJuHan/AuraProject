/**
 * enrich_all.js - DB 데이터 전체 점검 + 부족한 필드 일괄 보완
 *
 * 실행: node scripts/enrich_all.js
 * 옵션: node scripts/enrich_all.js --skip-trailers   (특정 단계 건너뛰기)
 *
 * 동작:
 *  1. 보완 전 데이터 충실도 측정
 *  2. 부족한 필드별 보완 스크립트 순차 실행 (가격→트레일러→평점→트렌드)
 *  3. 보완 후 충실도 재측정 + 개선폭 보고
 *
 * 각 단계는 독립 자식 프로세스로 실행되어 메모리 격리 + 한 단계 실패해도 나머지 진행
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { execSync } = require('child_process');
const path = require('path');
const Game = require('../models/Game');

const args = process.argv.slice(2);
const skip = (name) => args.includes(`--skip-${name}`);

async function measure() {
    const total = await Game.countDocuments();
    const [trend, price, review, tags, trailer, image, playtime] = await Promise.all([
        Game.countDocuments({ trend_score: { $gt: 0 } }),
        Game.countDocuments({ 'price_info.current_price': { $gt: 0 } }),
        Game.countDocuments({ 'steam_reviews.overall.percent': { $gt: 0 } }),
        Game.countDocuments({ smart_tags: { $exists: true, $ne: [] } }),
        Game.countDocuments({ trailers: { $exists: true, $ne: [] } }),
        Game.countDocuments({ main_image: { $exists: true, $ne: '' } }),
        Game.countDocuments({ 'play_time.main': { $gt: 0 } })
    ]);
    return { total, trend, price, review, tags, trailer, image, playtime };
}

function report(label, m) {
    const p = (n) => `${n} (${Math.round(n / m.total * 100)}%)`;
    console.log(`\n━━━ ${label} (전체 ${m.total}개) ━━━`);
    console.log(`  trend_score: ${p(m.trend)}`);
    console.log(`  가격:        ${p(m.price)}`);
    console.log(`  평점:        ${p(m.review)}`);
    console.log(`  태그:        ${p(m.tags)}`);
    console.log(`  트레일러:    ${p(m.trailer)}`);
    console.log(`  이미지:      ${p(m.image)}`);
    console.log(`  플레이타임:  ${p(m.playtime)}`);
}

function runStep(label, scriptName, extraArgs = '') {
    console.log(`\n\n########## ${label} ##########`);
    const scriptPath = path.join(__dirname, scriptName);
    try {
        execSync(`node "${scriptPath}" ${extraArgs}`.trim(), { stdio: 'inherit', timeout: 40 * 60 * 1000 });
        console.log(`✅ ${label} 완료`);
    } catch (e) {
        console.error(`⚠️ ${label} 실패 (계속 진행):`, e.message);
    }
}

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ DB 연결');

    // 1. 보완 전 측정
    const before = await measure();
    report('보완 전', before);
    await mongoose.disconnect(); // 자식 프로세스가 각자 연결하므로 해제

    // 2. 순차 보완 (가벼운 것 → 무거운 것)
    if (!skip('prices'))   runStep('가격 보완',   'repatch_prices.js');
    if (!skip('reviews'))  runStep('평점 보완',   'repatch_review_percent.js');
    if (!skip('trailers')) runStep('트레일러 보완', 'repatch_trailers.js', '--missing-only');
    if (!skip('playtime')) runStep('온라인게임 플탐', 'repatch_playtime_online.js');
    if (!skip('trend'))    runStep('트렌드 수집',  'trend_collector.js');

    // 3. 보완 후 재측정
    await mongoose.connect(process.env.MONGODB_URI);
    const after = await measure();
    report('보완 후', after);

    // 4. 개선폭
    console.log('\n\n═══════ 개선 결과 ═══════');
    const diff = (k, name) => {
        const d = after[k] - before[k];
        const sign = d > 0 ? `+${d}` : `${d}`;
        console.log(`  ${name}: ${before[k]} → ${after[k]} (${sign})`);
    };
    diff('trend', 'trend_score');
    diff('price', '가격');
    diff('review', '평점');
    diff('trailer', '트레일러');
    diff('playtime', '플탐');

    console.log('\n🎉 전체 보완 완료');
    process.exit(0);
}

main().catch(e => { console.error('보완 실패:', e.message); process.exit(1); });