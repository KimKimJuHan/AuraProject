/**
 * diagnose_all.js
 * 전체 시스템 현황 진단 스크립트
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Game = require('../models/Game');
const TrendHistory = require('../models/TrendHistory');
const GameMetadata = require('../models/GameMetadata');
const User = require('../models/User');

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ DB 연결 완료\n');

    // 1. 전체 게임 수
    const totalGames = await Game.countDocuments();
    console.log('=== [1] 게임 DB 현황 ===');
    console.log('총 게임 수:', totalGames);

    // 2. 가격 관련
    const freeGames = await Game.countDocuments({ 'price_info.isFree': true });
    const withDeals = await Game.countDocuments({ 'price_info.deals': { $exists: true, $not: { $size: 0 } } });
    const zeroPricePaid = await Game.countDocuments({ 'price_info.isFree': { $ne: true }, 'price_info.current_price': { $lte: 0 } });
    const abnormalPrice = await Game.countDocuments({ 'price_info.current_price': { $gt: 2000000 } });
    const lowPriceSuspect = await Game.countDocuments({ 'price_info.isFree': { $ne: true }, 'price_info.deals': { $elemMatch: { price: { $gte: 100, $lt: 2000 } } } });
    console.log('무료 게임:', freeGames);
    console.log('deals 있는 게임:', withDeals);
    console.log('유료이지만 가격=0인 게임:', zeroPricePaid);
    console.log('비정상 가격(200만원↑):', abnormalPrice);
    console.log('deals cents 의심(100~1999):', lowPriceSuspect);

    // 3. 트렌드 데이터
    console.log('\n=== [2] 트렌드 현황 ===');
    const withChzzk = await Game.countDocuments({ chzzk_viewers: { $gt: 0 } });
    const withSoop = await Game.countDocuments({ soop_viewers: { $gt: 0 } });
    const withTwitch = await Game.countDocuments({ twitch_viewers: { $gt: 0 } });
    const withSteamCCU = await Game.countDocuments({ steam_ccu: { $gt: 0 } });
    console.log('치지직 시청자 있는 게임:', withChzzk);
    console.log('SOOP 시청자 있는 게임:', withSoop);
    console.log('트위치 시청자 있는 게임:', withTwitch);
    console.log('스팀 동접 있는 게임:', withSteamCCU);

    const historyCount = await TrendHistory.countDocuments();
    const recentHistory = await TrendHistory.find({}).sort({ recordedAt: -1 }).limit(1).lean();
    console.log('TrendHistory 레코드 수:', historyCount);
    console.log('마지막 수집:', recentHistory[0]?.recordedAt || '없음');

    // 최근 7일 체크
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentHistoryCount = await TrendHistory.countDocuments({ recordedAt: { $gte: sevenDaysAgo } });
    const chzzkHistoryCount = await TrendHistory.countDocuments({ chzzk_viewers: { $gt: 0 }, recordedAt: { $gte: sevenDaysAgo } });
    const soopHistoryCount = await TrendHistory.countDocuments({ soop_viewers: { $gt: 0 }, recordedAt: { $gte: sevenDaysAgo } });
    console.log('최근 7일 TrendHistory:', recentHistoryCount);
    console.log('최근 7일 치지직 데이터:', chzzkHistoryCount);
    console.log('최근 7일 SOOP 데이터:', soopHistoryCount);

    // 4. 환경변수 체크
    console.log('\n=== [3] 환경변수 상태 ===');
    const envVars = ['ITAD_API_KEY', 'STEAM_API_KEY', 'TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET', 
                     'CHZZK_CLIENT_ID', 'CHZZK_CLIENT_SECRET', 'SOOP_CLIENT_ID', 'SOOP_CLIENT_SECRET',
                     'MONGODB_URI', 'JWT_SECRET', 'SESSION_SECRET'];
    for (const key of envVars) {
        const val = process.env[key];
        console.log(`${key}: ${val ? '✅ 설정됨' : '❌ 누락'}`);
    }

    // 5. 태그 현황
    console.log('\n=== [4] 태그/메타데이터 현황 ===');
    const noSmartTags = await Game.countDocuments({ $or: [{ smart_tags: { $exists: false } }, { smart_tags: { $size: 0 } }] });
    const noImage = await Game.countDocuments({ $or: [{ main_image: { $exists: false } }, { main_image: '' }, { main_image: null }] });
    const noSlug = await Game.countDocuments({ $or: [{ slug: { $exists: false } }, { slug: '' }] });
    const withItadUuid = await GameMetadata.countDocuments({ 'itad.uuid': { $exists: true, $ne: null } });
    console.log('smart_tags 없는 게임:', noSmartTags);
    console.log('이미지 없는 게임:', noImage);
    console.log('slug 없는 게임:', noSlug);
    console.log('ITAD UUID 있는 게임:', withItadUuid);

    // 6. 유저 현황
    console.log('\n=== [5] 유저 현황 ===');
    const totalUsers = await User.countDocuments();
    const withSteamId = await User.countDocuments({ steamId: { $exists: true, $ne: null } });
    const withPlayerType = await User.countDocuments({ playerType: { $exists: true, $nin: [null, '', 'beginner'] } });
    console.log('총 유저:', totalUsers);
    console.log('Steam 연동 유저:', withSteamId);
    console.log('플레이어 타입 설정 유저:', withPlayerType);

    // 7. 게임 상세 데이터 샘플 확인 (인기 게임 3개)
    console.log('\n=== [6] 인기 게임 상세 데이터 샘플 ===');
    const topGames = await Game.find({ steam_ccu: { $gt: 0 } })
        .sort({ steam_ccu: -1 })
        .limit(3)
        .select('title steam_appid price_info.isFree price_info.current_price price_info.deals chzzk_viewers soop_viewers twitch_viewers steam_ccu smart_tags main_image')
        .lean();
    
    for (const g of topGames) {
        console.log(`\n[${g.title}]`);
        console.log(`  appid: ${g.steam_appid} | CCU: ${g.steam_ccu}`);
        console.log(`  isFree: ${g.price_info?.isFree} | price: ${g.price_info?.current_price}`);
        console.log(`  deals: ${g.price_info?.deals?.length || 0}개`);
        console.log(`  치지직: ${g.chzzk_viewers} | SOOP: ${g.soop_viewers} | Twitch: ${g.twitch_viewers}`);
        console.log(`  smart_tags: ${(g.smart_tags || []).slice(0, 5).join(', ')}`);
        console.log(`  image: ${g.main_image ? '있음' : '없음'}`);
    }

    process.exit(0);
}

run().catch(e => { console.error('오류:', e.message); process.exit(1); });
