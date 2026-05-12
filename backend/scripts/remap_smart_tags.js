/**
 * remap_smart_tags.js
 *
 * 새 TAG_MAPPING 기준으로 smart_tags 전면 재매핑
 * - tags 원본이 있으면 → 즉시 재매핑 (벌크, 빠름)
 * - tags 없으면 → Steam appdetails API로 보완 후 저장
 * 모두 자동 처리 (인터랙션 없음)
 *
 * 실행: node scripts/remap_smart_tags.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('../models/Game');
const { mapSteamTags } = require('../utils/tagMapper');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('❌ MONGODB_URI 없음'); process.exit(1); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchTagsFromApi(appId, retries = 3) {
    const delays = [5000, 15000, 30000];

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await axios.get('https://store.steampowered.com/api/appdetails', {
                params: { appids: appId, filters: 'genres,categories', cc: 'kr' },
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept-Language': 'ko-KR,ko;q=0.9'
                }
            });

            // rate limit
            if (res.status === 429) {
                const wait = delays[attempt] || 30000;
                console.log(`     ⏳ rate limit — ${wait / 1000}초 대기 (${attempt + 1}/${retries})`);
                await sleep(wait);
                continue;
            }

            const data = res.data?.[appId]?.data;
            if (!data) return null; // DLC/삭제된 앱
            const genres = (data.genres || []).map(g => g.description);
            const categories = (data.categories || []).map(c => c.description);
            return [...new Set([...genres, ...categories])];

        } catch (err) {
            const status = err.response?.status;
            if (attempt < retries) {
                const wait = delays[attempt] || 30000;
                console.log(`     ⏳ 오류(${status || 'timeout'}) — ${wait / 1000}초 대기 후 재시도 (${attempt + 1}/${retries})`);
                await sleep(wait);
            } else {
                return []; // 재시도 소진
            }
        }
    }
    return [];
}

async function run() {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ DB 연결 완료');

    const games = await Game.find({
        steam_appid: { $exists: true, $ne: null }
    }).select('_id title steam_appid tags smart_tags').lean();

    const withTags    = games.filter(g => Array.isArray(g.tags) && g.tags.length > 0);
    const withoutTags = games.filter(g => !Array.isArray(g.tags) || g.tags.length === 0);

    console.log(`📋 전체: ${games.length}개`);
    console.log(`   tags 있음 (즉시 재매핑): ${withTags.length}개`);
    console.log(`   tags 없음 (API 보완):    ${withoutTags.length}개\n`);

    // ── 1단계: tags 있는 게임 벌크 재매핑 ──────────────────────────────────
    console.log('1단계: 즉시 재매핑 중...');
    const bulkOps = [];
    let changed = 0;
    let unchanged = 0;

    for (const game of withTags) {
        const newSmartTags = mapSteamTags(game.tags);
        const oldStr = Array.isArray(game.smart_tags) ? [...game.smart_tags].sort().join(',') : '';
        const newStr = [...newSmartTags].sort().join(',');
        if (oldStr === newStr) { unchanged++; continue; }
        bulkOps.push({
            updateOne: {
                filter: { _id: game._id },
                update: { $set: { smart_tags: newSmartTags } }
            }
        });
        changed++;
    }

    if (bulkOps.length > 0) {
        for (let i = 0; i < bulkOps.length; i += 500) {
            await Game.bulkWrite(bulkOps.slice(i, i + 500));
        }
    }
    console.log(`   ✅ 변경: ${changed}개 / 동일: ${unchanged}개\n`);

    // ── 2단계: tags 없는 게임 API 보완 (자동) ───────────────────────────────
    if (withoutTags.length === 0) {
        console.log('2단계: 보완 대상 없음.');
    } else {
        console.log(`2단계: ${withoutTags.length}개 API 보완 중...`);
        let apiSaved = 0;
        let apiMissing = 0;
        let apiFailed = 0;
        let apiNoMap = 0;
        let failStreak = 0;
        const STREAK_LIMIT = 10; // 10연속 실패 시 60초 휴식

        for (let i = 0; i < withoutTags.length; i++) {
            const game = withoutTags[i];
            const progress = `[${i + 1}/${withoutTags.length}]`;

            // 연속 실패 시 강제 휴식
            if (failStreak >= STREAK_LIMIT) {
                console.log(`\n  ⏸  ${STREAK_LIMIT}연속 실패 — 60초 휴식 중...\n`);
                await sleep(60000);
                failStreak = 0;
            }

            const sourceTags = await fetchTagsFromApi(game.steam_appid);

            if (sourceTags === null) {
                console.log(`${progress} ❌ 없는 앱 (DLC/삭제 추정): ${game.title}`);
                apiMissing++;
                failStreak++;
                await sleep(300);
                continue;
            }

            if (sourceTags.length === 0) {
                console.log(`${progress} ⏩ API 오류 스킵: ${game.title}`);
                apiFailed++;
                failStreak++;
                await sleep(500);
                continue;
            }

            failStreak = 0;
            const newSmartTags = mapSteamTags(sourceTags);

            if (newSmartTags.length === 0) {
                await Game.updateOne({ _id: game._id }, { $set: { tags: sourceTags } });
                console.log(`${progress} ⚠️  매핑 없음 (원본만 저장): ${game.title}`);
                apiNoMap++;
                await sleep(500);
                continue;
            }

            await Game.updateOne(
                { _id: game._id },
                { $set: { tags: sourceTags, smart_tags: newSmartTags } }
            );
            console.log(`${progress} ✅ ${game.title} → [${newSmartTags.join(', ')}]`);
            apiSaved++;
            await sleep(800);
        }

        console.log(`\n   ✅ 저장: ${apiSaved}개`);
        console.log(`   ❌ 없는 앱: ${apiMissing}개`);
        console.log(`   ⏩ API 오류: ${apiFailed}개`);
        console.log(`   ⚠️  매핑 없음: ${apiNoMap}개`);
        changed += apiSaved;
    }

    console.log('\n════════════════════════════════════');
    console.log('🎉 재매핑 완료!');
    console.log(`   ✅ 총 변경: ${changed}개`);
    console.log(`   ✔  동일 스킵: ${unchanged}개`);
    console.log('════════════════════════════════════');
    process.exit(0);
}

run().catch(err => {
    console.error('💥 크래시:', err);
    process.exit(1);
});