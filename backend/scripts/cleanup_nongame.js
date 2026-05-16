/**
 * cleanup_nongame.js
 *
 * DB에서 게임이 아닌 앱(소프트웨어, DLC, 데모 등) 정리
 * - smart_tags가 없거나 비어있는 게임 목록 출력
 * - Steam API로 type 확인 후 'game'이 아니면 삭제
 *
 * 실행: node scripts/cleanup_nongame.js
 * 확인만: node scripts/cleanup_nongame.js --dry-run
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('../models/Game');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('❌ MONGODB_URI 없음'); process.exit(1); }

const isDryRun = process.argv.includes('--dry-run');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function checkSteamType(appId, retries = 3) {
    const delays = [3000, 8000, 15000];

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await axios.get('https://store.steampowered.com/api/appdetails', {
                params: { appids: appId, filters: 'basic', cc: 'kr' },
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept-Language': 'ko-KR,ko;q=0.9'
                }
            });

            // rate limit
            if (res.status === 429) {
                const wait = delays[attempt] || 15000;
                console.log(`  ⏳ rate limit — ${wait/1000}초 대기 후 재시도 (${attempt+1}/${retries})`);
                await sleep(wait);
                continue;
            }

            const data = res.data?.[appId];
            if (!data?.success) return 'unknown';
            return data.data?.type || 'unknown';

        } catch (err) {
            const status = err.response?.status;
            if (attempt < retries) {
                const wait = delays[attempt] || 15000;
                console.log(`  ⏳ 오류(${status || 'timeout'}) — ${wait/1000}초 대기 후 재시도 (${attempt+1}/${retries})`);
                await sleep(wait);
            } else {
                return 'error';
            }
        }
    }
    return 'error';
}

async function run() {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ DB 연결 완료');
    console.log(isDryRun ? '🔍 DRY RUN 모드 (실제 삭제 없음)\n' : '⚠️  실제 삭제 모드\n');

    // 검사 대상:
    // 기본: smart_tags가 없는 게임 (비게임 앱 가능성 높음)
    // --check-all: 전체 게임 Steam type 검증 (시간 오래 걸림)
    const isCheckAll = process.argv.includes('--check-all');
    const query = isCheckAll
        ? { steam_appid: { $exists: true, $ne: null } }
        : {
            $or: [
                { smart_tags: { $exists: false } },
                { smart_tags: { $size: 0 } }
            ],
            steam_appid: { $exists: true, $ne: null }
          };

    if (isCheckAll) console.log('🔍 전체 게임 검사 모드 (--check-all)\n');

    const candidates = await Game.find(query).select('_id title steam_appid').lean();

    console.log(`📋 검사 대상: ${candidates.length}개\n`);

    let deleted = 0;
    let kept = 0;
    let unknown = 0;

    let unknownStreak = 0;
    const STREAK_LIMIT = 8; // 8연속 실패 시 30초 휴식

    for (let i = 0; i < candidates.length; i++) {
        const game = candidates[i];
        const progress = `[${i + 1}/${candidates.length}]`;

        if (unknownStreak >= STREAK_LIMIT) {
            console.log(`\n  ⏸  ${STREAK_LIMIT}연속 확인 불가 — 30초 휴식 중...\n`);
            await sleep(30000);
            unknownStreak = 0;
        }

        const type = await checkSteamType(game.steam_appid);
        await sleep(800);

        if (type === 'game') {
            console.log(`${progress} ✅ 게임 확인 (유지): ${game.title}`);
            kept++;
            unknownStreak = 0;
        } else if (type === 'unknown' || type === 'error' || type === 'beta') {
            console.log(`${progress} ❓ 확인 불가 (유지): ${game.title} (appid: ${game.steam_appid})`);
            unknown++;
            unknownStreak++;
        } else {
            // application, dlc, demo, mod, video, music 등
            console.log(`${progress} 🗑  비게임 (${type}) ${isDryRun ? '[삭제 예정]' : '[삭제]'}: ${game.title} (appid: ${game.steam_appid})`);
            if (!isDryRun) {
                await Game.deleteOne({ _id: game._id });
            }
            deleted++;
            unknownStreak = 0;
        }
    }

    console.log('\n════════════════════════════════════');
    console.log('🎉 정리 완료!');
    console.log(`   ✅ 게임 유지: ${kept}개`);
    console.log(`   🗑  ${isDryRun ? '삭제 예정' : '삭제됨'}: ${deleted}개`);
    console.log(`   ❓ 확인 불가: ${unknown}개`);
    if (isDryRun) console.log('\n실제 삭제하려면 --dry-run 없이 실행하세요.');
    console.log('════════════════════════════════════');
    process.exit(0);
}

run().catch(err => {
    console.error('💥 크래시:', err);
    process.exit(1);
});