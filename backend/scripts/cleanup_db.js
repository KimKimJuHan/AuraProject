/**
 * cleanup_db.js
 *
 * DB 데이터 품질 정리:
 * 1. 비게임 앱 (Wallpaper Engine, 소프트웨어 등) → isAdult로 숨김 처리
 * 2. slug 중복 또는 잘못된 store_url 수정 (appid 기반으로 재생성)
 * 3. 평점 없고 가격도 없는 빈 데이터 게임 정리
 * 4. 발표용 성인 게임 확인
 *
 * 실행: node scripts/cleanup_db.js --dry-run  (확인만)
 * 실행: node scripts/cleanup_db.js            (실제 적용)
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const Game = require('../models/Game');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('❌ MONGODB_URI 없음'); process.exit(1); }

const isDryRun = process.argv.includes('--dry-run');

// 비게임 앱 키워드 (제목에 포함되면 숨김)
const NON_GAME_KEYWORDS = [
    'wallpaper engine', 'wallpaper', 'soundtrack', 'artbook', 'art book',
    'bongo cat', 'software', 'tool', 'utility', 'server', 'dedicated server',
    'demo', 'prologue', 'playtest', 'beta test'
];

// 명확히 소프트웨어인 Steam appid 목록
const NON_GAME_APPIDS = [
    431960,  // Wallpaper Engine
    1918870, // Bongo Cat
    365670,  // Blender
    250820,  // SteamVR
];

async function run() {
    await mongoose.connect(MONGODB_URI);
    console.log(`✅ DB 연결 완료 [${isDryRun ? 'DRY RUN' : '실제 적용'}]\n`);

    let hidden = 0;
    let urlFixed = 0;
    let slugFixed = 0;
    let deleted = 0;

    // ── 1. 비게임 앱 숨김 처리 ──────────────────────────────────────────
    console.log('=== 1. 비게임 앱 숨김 처리 ===');

    // appid 기반
    const nonGameByAppId = await Game.find({
        steam_appid: { $in: NON_GAME_APPIDS },
        isAdult: { $ne: true }
    }).select('title steam_appid isAdult').lean();

    for (const game of nonGameByAppId) {
        console.log(`  🗑  [appid] 숨김: ${game.title} (${game.steam_appid})`);
        if (!isDryRun) await Game.updateOne({ _id: game._id }, { $set: { isAdult: true } });
        hidden++;
    }

    // 키워드 기반
    for (const keyword of NON_GAME_KEYWORDS) {
        const matches = await Game.find({
            title: { $regex: keyword, $options: 'i' },
            isAdult: { $ne: true }
        }).select('title steam_appid').lean();

        for (const game of matches) {
            console.log(`  🗑  [키워드: ${keyword}] 숨김: ${game.title}`);
            if (!isDryRun) await Game.updateOne({ _id: game._id }, { $set: { isAdult: true } });
            hidden++;
        }
    }
    console.log(`  → 총 ${hidden}개 숨김 처리\n`);

    // ── 2. store_url appid 불일치 수정 ──────────────────────────────────
    console.log('=== 2. store_url 잘못된 게임 수정 ===');
    const gamesWithUrl = await Game.find({
        steam_appid: { $exists: true, $ne: null },
        'price_info.store_url': { $exists: true }
    }).select('title steam_appid price_info.store_url').lean();

    for (const game of gamesWithUrl) {
        const url = game.price_info?.store_url || '';
        // Steam URL에서 appid 추출
        const urlAppId = url.match(/store\.steampowered\.com\/app\/(\d+)/)?.[1];
        if (urlAppId && parseInt(urlAppId) !== game.steam_appid) {
            const correctUrl = `https://store.steampowered.com/app/${game.steam_appid}`;
            console.log(`  🔧 URL 수정: ${game.title}`);
            console.log(`     잘못된 appid ${urlAppId} → ${game.steam_appid}`);
            if (!isDryRun) {
                await Game.updateOne(
                    { _id: game._id },
                    { $set: { 'price_info.store_url': correctUrl } }
                );
            }
            urlFixed++;
        }
    }
    console.log(`  → 총 ${urlFixed}개 URL 수정\n`);

    // ── 3. slug 중복 확인 ───────────────────────────────────────────────
    console.log('=== 3. slug 중복 확인 ===');
    const slugDupes = await Game.aggregate([
        { $group: { _id: '$slug', count: { $sum: 1 }, ids: { $push: '$_id' }, titles: { $push: '$title' } } },
        { $match: { count: { $gt: 1 } } }
    ]);

    for (const dupe of slugDupes) {
        console.log(`  ⚠️  중복 slug: ${dupe._id} (${dupe.count}개) — ${dupe.titles.join(', ')}`);
        // 첫 번째 제외하고 나머지 slug 재생성
        for (let i = 1; i < dupe.ids.length; i++) {
            const game = await Game.findById(dupe.ids[i]).select('steam_appid title').lean();
            if (game?.steam_appid) {
                const newSlug = `steam-${game.steam_appid}`;
                console.log(`    → ${game.title} slug 수정: ${dupe._id} → ${newSlug}`);
                if (!isDryRun) await Game.updateOne({ _id: dupe.ids[i] }, { $set: { slug: newSlug } });
                slugFixed++;
            }
        }
    }
    if (slugDupes.length === 0) console.log('  ✅ 중복 없음');
    console.log(`  → 총 ${slugFixed}개 slug 수정\n`);

    // ── 4. 성인 게임 현황 확인 ──────────────────────────────────────────
    console.log('=== 4. 성인 게임 현황 ===');
    const adultGames = await Game.find({ isAdult: true }).select('title steam_appid').lean();
    console.log(`  총 ${adultGames.length}개 (추천/검색에서 제외됨)`);
    adultGames.slice(0, 10).forEach(g => console.log(`  - ${g.title}`));
    if (adultGames.length > 10) console.log(`  ... 외 ${adultGames.length - 10}개`);

    // ── 5. 빈 데이터 게임 확인 (리뷰 0 + 가격 0 + smart_tags 0) ─────────
    console.log('\n=== 5. 빈 데이터 게임 ===');
    const emptyGames = await Game.find({
        'steam_reviews.overall.total': 0,
        'price_info.current_price': 0,
        'price_info.isFree': { $ne: true },
        smart_tags: { $size: 0 }
    }).select('title steam_appid').lean();

    console.log(`  빈 데이터 게임: ${emptyGames.length}개`);
    emptyGames.slice(0, 10).forEach(g => console.log(`  - ${g.title} (appid: ${g.steam_appid})`));

    console.log('\n════════════════════════════════════');
    console.log('🎉 정리 완료!');
    console.log(`   숨김 처리: ${hidden}개`);
    console.log(`   URL 수정: ${urlFixed}개`);
    console.log(`   slug 수정: ${slugFixed}개`);
    if (isDryRun) console.log('\n실제 적용하려면 --dry-run 없이 실행하세요.');
    console.log('════════════════════════════════════');
    process.exit(0);
}

run().catch(err => {
    console.error('💥 크래시:', err);
    process.exit(1);
});