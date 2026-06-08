/**
 * 전역 데이터 무결성 및 시스템 구조 감사 스크립트
 * - 가격 외의 메타데이터(리뷰, 트렌드, 태그 등) 오류 탐지
 * - 잠재적인 구조적 결함 식별
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Game = require('../models/Game');

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ DB 연결 성공 - 전역 데이터 감사 시작\n');

    const totalGames = await Game.countDocuments();
    console.log(`총 게임 수: ${totalGames.toLocaleString()}개\n`);

    // 1. 트렌드/시청자 수 데이터 무결성
    console.log('═══ [1] 트렌드 데이터 무결성 ═══');
    const negativeViewers = await Game.countDocuments({
        $or: [
            { twitch_viewers: { $lt: 0 } },
            { chzzk_viewers: { $lt: 0 } },
            { soop_viewers: { $lt: 0 } },
            { steam_ccu: { $lt: 0 } }
        ]
    });
    
    // 비정상적으로 높은 시청자 수 (예: 500만명 이상 - 롤드컵 결승 수준이라 일반적으론 오류 의심)
    const unrealisticallyHighViewers = await Game.find({
        $or: [
            { twitch_viewers: { $gt: 5000000 } },
            { chzzk_viewers: { $gt: 1000000 } },
            { soop_viewers: { $gt: 1000000 } },
            { steam_ccu: { $gt: 5000000 } }
        ]
    }).select('title twitch_viewers chzzk_viewers soop_viewers steam_ccu').lean();

    console.log(`  ❌ 음수 시청자 수: ${negativeViewers}개`);
    console.log(`  ⚠️ 비정상적으로 높은 시청자 수(수집 오류 의심): ${unrealisticallyHighViewers.length}개`);
    if (unrealisticallyHighViewers.length > 0) {
        unrealisticallyHighViewers.forEach(g => console.log(`    - ${g.title} (T:${g.twitch_viewers}, C:${g.chzzk_viewers}, S:${g.soop_viewers}, CCU:${g.steam_ccu})`));
    }

    // 2. 리뷰 데이터 무결성
    console.log('\n═══ [2] 리뷰 데이터 무결성 ═══');
    const invalidReviewPercent = await Game.countDocuments({
        $or: [
            { 'steam_reviews.overall.percent': { $lt: 0 } },
            { 'steam_reviews.overall.percent': { $gt: 100 } }
        ]
    });
    const reviewsMathMismatch = await Game.countDocuments({
        $expr: { $lt: ['$steam_reviews.overall.total', '$steam_reviews.overall.positive'] }
    });

    console.log(`  ❌ 리뷰 퍼센트가 0~100 범위를 벗어남: ${invalidReviewPercent}개`);
    console.log(`  ❌ 긍정 리뷰 수가 총 리뷰 수보다 많음(수학적 오류): ${reviewsMathMismatch}개`);

    // 3. 태그 및 분류 무결성
    console.log('\n═══ [3] 태그 및 분류 무결성 ═══');
    const missingSmartTags = await Game.countDocuments({
        steam_appid: { $exists: true, $ne: null },
        $or: [{ smart_tags: { $exists: false } }, { smart_tags: { $size: 0 } }],
        tags: { $exists: true, $not: { $size: 0 } } // 원본 태그는 있는데 스마트 태그가 없는 경우
    });

    const validDifficulties = ['초심자', '보통', '심화', '정보 없음'];
    const invalidDifficulty = await Game.countDocuments({
        difficulty: { $nin: validDifficulties }
    });

    console.log(`  ❌ 원본 태그는 있지만 스마트 태그 매핑 누락: ${missingSmartTags}개 (컬렉터가 채워야 함)`);
    console.log(`  ❌ 잘못된 난이도 값(스키마 위반): ${invalidDifficulty}개`);

    // 4. 구조적 중복/필수 필드 누락
    console.log('\n═══ [4] 식별자 무결성 ═══');
    const missingSlug = await Game.countDocuments({ $or: [{ slug: null }, { slug: '' }] });
    const missingTitle = await Game.countDocuments({ $or: [{ title: null }, { title: '' }] });
    
    console.log(`  ❌ Slug 누락(라우팅 불가): ${missingSlug}개`);
    console.log(`  ❌ Title 누락: ${missingTitle}개`);

    // 중복 Steam AppID 검사
    const duplicateAppIds = await Game.aggregate([
        { $match: { steam_appid: { $ne: null } } },
        { $group: { _id: '$steam_appid', count: { $sum: 1 }, titles: { $push: '$title' } } },
        { $match: { count: { $gt: 1 } } }
    ]);
    
    console.log(`  ❌ 중복된 Steam AppID를 가진 문서: ${duplicateAppIds.length}개`);
    if (duplicateAppIds.length > 0) {
        duplicateAppIds.slice(0, 5).forEach(d => console.log(`    - AppID ${d._id}: ${d.count}개 (${d.titles.join(', ')})`));
        if (duplicateAppIds.length > 5) console.log(`    ... 외 ${duplicateAppIds.length - 5}개`);
    }

    // 5. 수집기 실행 공백 확인 (마지막 업데이트가 너무 오래된 게임)
    console.log('\n═══ [5] 데이터 최신화 상태 (Stale Data) ═══');
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const staleData = await Game.countDocuments({
        steam_appid: { $exists: true, $ne: null },
        $or: [{ lastUpdated: { $lt: thirtyDaysAgo } }, { lastUpdated: { $exists: false } }]
    });
    console.log(`  ⚠️ 30일 이상 가격/트렌드 갱신 안 된 게임: ${staleData}개 (수집기 큐 적체 현상 확인용)`);

    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
