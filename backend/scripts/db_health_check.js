/**
 * db_health_check.js - DB 데이터 충실도 진단
 * 사용: node scripts/db_health_check.js
 * 추천/정렬/프리셋이 제대로 작동하는지 데이터 관점에서 점검
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Game = require('../models/Game');

async function check() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ DB 연결\n');

    const total = await Game.countDocuments();
    console.log(`📊 전체 게임: ${total}개\n`);

    const pct = (n) => `${n}개 (${Math.round(n/total*100)}%)`;

    // ── 핵심 필드 충실도 ──
    console.log('═══ 핵심 필드 충실도 ═══');
    console.log('trend_score 있음:', pct(await Game.countDocuments({ trend_score: { $gt: 0 } })));
    console.log('가격 있음:      ', pct(await Game.countDocuments({ 'price_info.current_price': { $gt: 0 } })));
    console.log('평점 있음:      ', pct(await Game.countDocuments({ 'steam_reviews.overall.percent': { $gt: 0 } })));
    console.log('태그 있음:      ', pct(await Game.countDocuments({ smart_tags: { $exists: true, $ne: [] } })));
    console.log('이미지 있음:    ', pct(await Game.countDocuments({ main_image: { $exists: true, $ne: '' } })));
    console.log('트레일러 있음:  ', pct(await Game.countDocuments({ trailers: { $exists: true, $ne: [] } })));
    console.log('할인중:         ', pct(await Game.countDocuments({ 'price_info.discount_percent': { $gte: 1 } })));

    // ── 프리셋별 매칭 게임 수 ──
    console.log('\n═══ 빠른 필터 프리셋 매칭 ═══');
    console.log('🤝 코옵(협동/멀티):', await Game.countDocuments({ smart_tags: { $in: ['협동', '멀티플레이'] } }), '개');
    console.log('🌱 입문(캐주얼/힐링):', await Game.countDocuments({ smart_tags: { $in: ['캐주얼', '힐링'] } }), '개');
    console.log('💰 할인중:', await Game.countDocuments({ 'price_info.discount_percent': { $gte: 25 } }), '개');
    console.log('💸 가성비(~1만):', await Game.countDocuments({ 'price_info.current_price': { $gt: 0, $lte: 10000 } }), '개');

    // ── 태그 분포 (상위 20개) ──
    console.log('\n═══ 태그 분포 (상위 20) ═══');
    const tagAgg = await Game.aggregate([
        { $unwind: '$smart_tags' },
        { $group: { _id: '$smart_tags', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 }
    ]);
    tagAgg.forEach(t => console.log(`  ${t._id}: ${t.count}개`));

    // ── 문제 게임 ──
    console.log('\n═══ 보완 필요 ═══');
    console.log('태그 없는 게임:    ', await Game.countDocuments({ $or: [{ smart_tags: { $exists: false } }, { smart_tags: { $size: 0 } }] }), '개');
    console.log('이미지 없는 게임:  ', await Game.countDocuments({ $or: [{ main_image: { $exists: false } }, { main_image: '' }] }), '개');
    console.log('가격 없는 게임:    ', await Game.countDocuments({ $or: [{ 'price_info.current_price': { $exists: false } }, { 'price_info.current_price': 0 }] }), '개');

    console.log('\n🎉 진단 완료');
    process.exit(0);
}

check().catch(e => { console.error('진단 실패:', e.message); process.exit(1); });