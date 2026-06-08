/**
 * 게이머 관점에서 필요한 데이터 채워짐 진단
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Game = require('../models/Game');
const TrendHistory = require('../models/TrendHistory');

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    const total = await Game.countDocuments();
    console.log(`\n🎮 전체 게임 수: ${total}개\n`);

    // ── 1. 기본 정보 충족률 ─────────────────────────
    console.log('=== [1] 기본 정보 충족률 ===');
    const checks = [
        { label: '제목(title)', q: { title: { $nin: [null, ''] } } },
        { label: '한글 제목(title_ko)', q: { title_ko: { $nin: [null, ''] } } },
        { label: '대표 이미지', q: { main_image: { $nin: [null, ''] } } },
        { label: '게임 설명', q: { description: { $nin: [null, ''] } } },
        { label: '출시일', q: { releaseDate: { $ne: null } } },
        { label: '개발사', q: { developers: { $ne: [] } } },
        { label: '장르 태그', q: { tags: { $exists: true, $not: { $size: 0 } } } },
    ];
    for (const c of checks) {
        const n = await Game.countDocuments(c.q);
        const pct = ((n / total) * 100).toFixed(1);
        const bar = pct >= 80 ? '✅' : pct >= 50 ? '⚠️' : '❌';
        console.log(`  ${bar} ${c.label}: ${n.toLocaleString()}개 (${pct}%)`);
    }

    // ── 2. 스팀 리뷰 ─────────────────────────────────
    console.log('\n=== [2] 스팀 리뷰 데이터 ===');
    const hasReview = await Game.countDocuments({ 'steam_reviews.overall.total': { $gt: 0 } });
    const hasPercent = await Game.countDocuments({ 'steam_reviews.overall.percent': { $gt: 0 } });
    const hasRating = await Game.countDocuments({ 'steam_reviews.overall.summary': { $nin: [null, '', '정보 없음'] } });
    console.log(`  ✅ 리뷰 수(total > 0): ${hasReview.toLocaleString()}개 (${((hasReview/total)*100).toFixed(1)}%)`);
    console.log(`  ✅ 긍정률(%): ${hasPercent.toLocaleString()}개 (${((hasPercent/total)*100).toFixed(1)}%)`);
    console.log(`  ✅ 등급 문구(summary): ${hasRating.toLocaleString()}개 (${((hasRating/total)*100).toFixed(1)}%)`);

    // ── 3. 가격 정보 ──────────────────────────────────
    console.log('\n=== [3] 가격 정보 ===');
    const hasPriceInfo = await Game.countDocuments({ 'price_info': { $ne: null } });
    const hasFree = await Game.countDocuments({ 'price_info.isFree': true });
    const hasPaidPrice = await Game.countDocuments({ 'price_info.current_price': { $gte: 2000, $lte: 500000 } });
    const hasDiscount = await Game.countDocuments({ 'price_info.discount_percent': { $gt: 0 } });
    const hasDeals = await Game.countDocuments({ 'price_info.deals': { $exists: true, $not: { $size: 0 } } });
    console.log(`  ✅ 가격 정보 있음: ${hasPriceInfo.toLocaleString()}개 (${((hasPriceInfo/total)*100).toFixed(1)}%)`);
    console.log(`  ✅ 무료 게임: ${hasFree.toLocaleString()}개`);
    console.log(`  ✅ 유료 가격 정상(2천~50만): ${hasPaidPrice.toLocaleString()}개`);
    console.log(`  ✅ 할인 중: ${hasDiscount.toLocaleString()}개`);
    console.log(`  ✅ 멀티 스토어 딜(deals): ${hasDeals.toLocaleString()}개`);

    // ── 4. 미디어(스크린샷/트레일러) ──────────────────
    console.log('\n=== [4] 미디어 (스크린샷/트레일러) ===');
    const hasScreenshots = await Game.countDocuments({ 'screenshots.0': { $exists: true } });
    const hasTrailer = await Game.countDocuments({ 'trailer_url': { $nin: [null, ''] } });
    console.log(`  ✅ 스크린샷: ${hasScreenshots.toLocaleString()}개 (${((hasScreenshots/total)*100).toFixed(1)}%)`);
    console.log(`  ${hasTrailer > total*0.3 ? '✅' : '⚠️'} 트레일러 URL: ${hasTrailer.toLocaleString()}개 (${((hasTrailer/total)*100).toFixed(1)}%)`);

    // ── 5. 게이머 친화 데이터 ────────────────────────
    console.log('\n=== [5] 게이머 친화 데이터 ===');
    const hasPlaytime = await Game.countDocuments({ 'play_time': { $ne: null } });
    const hasMetacritic = await Game.countDocuments({ 'metacritic_score': { $gt: 0 } });
    const hasSteamCCU = await Game.countDocuments({ 'steam_ccu': { $gt: 0 } });
    const hasMinReqs = await Game.countDocuments({ 'minimum_requirements': { $nin: [null, ''] } });
    const hasPCBadge = await Game.countDocuments({ 'pc_compatibility': { $ne: null } });
    console.log(`  ${hasPlaytime > total*0.5 ? '✅' : '⚠️'} 평균 플레이타임: ${hasPlaytime.toLocaleString()}개 (${((hasPlaytime/total)*100).toFixed(1)}%)`);
    console.log(`  ${hasMetacritic > total*0.2 ? '✅' : '⚠️'} 메타크리틱 점수: ${hasMetacritic.toLocaleString()}개 (${((hasMetacritic/total)*100).toFixed(1)}%)`);
    console.log(`  ✅ 스팀 동접자(steam_ccu): ${hasSteamCCU.toLocaleString()}개 (${((hasSteamCCU/total)*100).toFixed(1)}%)`);
    console.log(`  ${hasMinReqs > total*0.5 ? '✅' : '⚠️'} 최소 사양: ${hasMinReqs.toLocaleString()}개 (${((hasMinReqs/total)*100).toFixed(1)}%)`);
    console.log(`  ${hasPCBadge > total*0.3 ? '✅' : '⚠️'} PC 호환성 배지: ${hasPCBadge.toLocaleString()}개 (${((hasPCBadge/total)*100).toFixed(1)}%)`);

    // ── 6. 트렌드 히스토리(그래프) ───────────────────
    console.log('\n=== [6] 트렌드 그래프 데이터 ===');
    const thTotal = await TrendHistory.countDocuments();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thRecent = await TrendHistory.countDocuments({ recordedAt: { $gte: weekAgo } });
    const thWithChzzk = await TrendHistory.countDocuments({ chzzk_viewers: { $gt: 0 } });
    const thWithSoop = await TrendHistory.countDocuments({ soop_viewers: { $gt: 0 } });
    const thDistinct = (await TrendHistory.distinct('steam_appid')).length;
    const thMultiDay = await TrendHistory.aggregate([
        { $group: { _id: '$steam_appid', days: { $addToSet: { $dayOfYear: '$recordedAt' } } } },
        { $match: { 'days.3': { $exists: true } } },
        { $count: 'total' }
    ]);
    console.log(`  ✅ 전체 히스토리 레코드: ${thTotal.toLocaleString()}건`);
    console.log(`  ✅ 최근 7일 레코드: ${thRecent.toLocaleString()}건`);
    console.log(`  ✅ 치지직 데이터 있는 레코드: ${thWithChzzk.toLocaleString()}건`);
    console.log(`  ✅ 숲 데이터 있는 레코드: ${thWithSoop.toLocaleString()}건`);
    console.log(`  ✅ 그래프 있는 고유 게임 수: ${thDistinct.toLocaleString()}개`);
    console.log(`  ✅ 3일 이상 데이터 있는 게임: ${thMultiDay[0]?.total || 0}개`);

    // ── 7. 비어있어서 문제되는 게임 샘플 ──────────────
    console.log('\n=== [7] 데이터 공백 문제 게임 (상위 인기 게임 중) ===');
    const popularMissing = await Game.find({
        trend_score: { $gt: 100 },
        $or: [
            { description: { $in: [null, ''] } },
            { main_image: { $in: [null, ''] } },
            { releaseDate: null }
        ]
    }).select('title trend_score description main_image releaseDate').limit(10).lean();
    if (popularMissing.length === 0) {
        console.log('  ✅ 인기 게임 중 심각한 공백 없음!');
    } else {
        popularMissing.forEach(g => {
            const missing = [];
            if (!g.description) missing.push('설명');
            if (!g.main_image) missing.push('이미지');
            if (!g.releaseDate) missing.push('출시일');
            console.log(`  ❌ [${g.title}] (score:${g.trend_score}) - 누락: ${missing.join(', ')}`);
        });
    }

    console.log('\n');
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
