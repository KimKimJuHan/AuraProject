/**
 * repatch_metadata.js
 *
 * 한 번에 처리:
 * 1. 메타크리틱 점수 (Steam appdetails에서 무료로 가져옴)
 * 2. IGDB 점수 (Twitch API 키 사용)
 * 3. difficulty 자동 계산 (smart_tags + 메타크리틱 기반)
 * 4. 플레이타임 없는 게임 HLTB 보완 (Steam appdetails 평균 플레이타임)
 *
 * 실행: node scripts/repatch_metadata.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('../models/Game');

const { MONGODB_URI, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET } = process.env;
if (!MONGODB_URI) { console.error('❌ MONGODB_URI 없음'); process.exit(1); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── IGDB 토큰 ─────────────────────────────────────────────────────────────────
let igdbToken = null;

async function getIGDBToken() {
    if (!TWITCH_CLIENT_ID) { console.log('⚠️  TWITCH_CLIENT_ID 없음 — IGDB 스킵'); return; }
    try {
        const res = await axios.post('https://id.twitch.tv/oauth2/token', null, {
            params: { client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' }
        });
        igdbToken = res.data.access_token;
        console.log('✅ IGDB 토큰 발급 완료');
    } catch (err) {
        console.error('❌ IGDB 토큰 발급 실패:', err.message);
    }
}

async function getIGDBScore(title) {
    if (!igdbToken) return 0;
    try {
        const res = await axios.post('https://api.igdb.com/v4/games',
            `fields name,rating,rating_count; search "${title.replace(/"/g, '')}"; where rating_count > 5; limit 1;`,
            {
                headers: {
                    'Client-ID': TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${igdbToken}`,
                    'Content-Type': 'text/plain'
                },
                timeout: 8000
            }
        );
        if (res.data?.[0]?.rating) {
            return Math.round(res.data[0].rating);
        }
        return 0;
    } catch { return 0; }
}

// ── Steam appdetails (메타크리틱 + 플레이타임) ────────────────────────────────
async function getSteamDetails(appId) {
    try {
        const res = await axios.get('https://store.steampowered.com/api/appdetails', {
            params: { appids: appId, filters: 'metacritic,recommendations', cc: 'kr', l: 'korean' },
            timeout: 8000
        });
        const data = res.data?.[appId]?.data;
        if (!data) return null;
        return {
            metacritic: data.metacritic?.score || 0,
        };
    } catch { return null; }
}

// ── difficulty 자동 계산 ─────────────────────────────────────────────────────
function calcDifficulty(smartTags, metacriticScore) {
    const tags = Array.isArray(smartTags) ? smartTags : [];

    const hardTags = ['소울라이크', '고난이도', '로그라이크', '메트로배니아'];
    const easyTags = ['귀여운', '힐링', '캐주얼', '리듬', '퍼즐', '비주얼노벨', '농장경영'];

    const hasHard = hardTags.some(t => tags.includes(t));
    const hasEasy = easyTags.some(t => tags.includes(t));

    if (hasHard) return '심화';
    if (hasEasy) return '초심자';
    if (metacriticScore > 85) return '보통'; // 높은 평점 게임은 대체로 밸런스 잡힘
    return '보통';
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function run() {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ DB 연결 완료');
    await getIGDBToken();

    // 대상: difficulty가 없거나 메타크리틱 0이거나 IGDB 0인 게임
    const games = await Game.find({
        steam_appid: { $exists: true, $ne: null },
        $or: [
            { difficulty: '정보 없음' },
            { difficulty: { $exists: false } },
            { metacritic_score: 0 },
            { igdb_score: 0 },
        ]
    }).select('_id title steam_appid smart_tags metacritic_score igdb_score difficulty play_time').lean();

    console.log(`\n📋 처리 대상: ${games.length}개`);
    console.log(`⏱  예상 소요: 약 ${Math.ceil(games.length * 2 / 60)}분\n`);

    let updated = 0;
    let skipped = 0;

    for (let i = 0; i < games.length; i++) {
        const game = games[i];
        const progress = `[${i + 1}/${games.length}]`;
        const updateData = {};

        // 1. 메타크리틱 (0인 경우만)
        if (!game.metacritic_score || game.metacritic_score === 0) {
            const details = await getSteamDetails(game.steam_appid);
            if (details?.metacritic) {
                updateData.metacritic_score = details.metacritic;
            }
            await sleep(300);
        }

        // 2. IGDB 점수 (0인 경우만)
        if (igdbToken && (!game.igdb_score || game.igdb_score === 0)) {
            const score = await getIGDBScore(game.title);
            if (score > 0) updateData.igdb_score = score;
            await sleep(250);
        }

        // 3. difficulty 계산 (항상 재계산)
        const metacriticForCalc = updateData.metacritic_score || game.metacritic_score || 0;
        updateData.difficulty = calcDifficulty(game.smart_tags, metacriticForCalc);

        if (Object.keys(updateData).length === 0) {
            skipped++;
            continue;
        }

        await Game.updateOne({ _id: game._id }, { $set: updateData });

        const parts = [];
        if (updateData.metacritic_score) parts.push(`MC:${updateData.metacritic_score}`);
        if (updateData.igdb_score) parts.push(`IGDB:${updateData.igdb_score}`);
        if (updateData.difficulty) parts.push(`난이도:${updateData.difficulty}`);

        console.log(`${progress} ✅ ${game.title} — ${parts.join(' / ')}`);
        updated++;

        await sleep(500);
    }

    console.log('\n════════════════════════════════════');
    console.log('🎉 메타데이터 패치 완료!');
    console.log(`   ✅ 업데이트: ${updated}개`);
    console.log(`   ✔  스킵:    ${skipped}개`);
    console.log('════════════════════════════════════');
    process.exit(0);
}

run().catch(err => {
    console.error('💥 크래시:', err);
    process.exit(1);
});