/**
 * cleanup_wrong_games.js
 * Steam API로 실제 게임명을 확인해서 DB의 title과 다른 것들을 찾아냅니다.
 * --dry-run: 목록만 출력 (기본값)
 * --fix: 실제 삭제 실행
 *
 * 사용법:
 *   node cleanup_wrong_games.js          (dry-run, 확인만)
 *   node cleanup_wrong_games.js --fix    (실제 삭제)
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('../models/Game');

const FIX_MODE = process.argv.includes('--fix');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getSteamName(appid) {
    try {
        const res = await axios.get('https://store.steampowered.com/api/appdetails', {
            params: { appids: appid, filters: 'basic' },
            timeout: 8000
        });
        const info = res.data?.[String(appid)];
        if (!info?.success) return null;
        return info.data?.name || null;
    } catch { return null; }
}

function nameSimilar(a, b) {
    if (!a || !b) return false;
    const clean = s => s.toLowerCase().replace(/[^a-z0-9가-힣]/g, '').trim();
    const ca = clean(a), cb = clean(b);
    if (ca === cb) return true;
    if (ca.includes(cb) || cb.includes(ca)) return true;
    // 첫 단어 비교
    const wa = ca.split(/\s+/)[0], wb = cb.split(/\s+/)[0];
    if (wa.length > 2 && wb.length > 2 && (wa === wb)) return true;
    return false;
}

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ DB 연결');
    console.log(`모드: ${FIX_MODE ? '🗑  실제 삭제' : '🔍 확인만 (--fix 옵션으로 삭제)'}\n`);

    // steam_appid 있는 게임만 조회
    const games = await Game.find({
        steam_appid: { $exists: true, $gt: 0 }
    }).select('steam_appid title title_ko slug').lean();

    console.log(`DB 게임 수: ${games.length}개 검사 시작...\n`);

    const wrong = [];
    let checked = 0;

    for (const game of games) {
        const steamName = await getSteamName(game.steam_appid);
        checked++;

        if (!steamName) {
            // Steam에서 못 찾음 → 삭제 대상
            console.log(`❌ [${game.steam_appid}] Steam에서 없음 | DB: "${game.title_ko || game.title}"`);
            wrong.push({ game, steamName: null, reason: 'Steam에 없음' });
        } else if (!nameSimilar(steamName, game.title_ko || game.title)) {
            // 이름 불일치 → 삭제 대상
            console.log(`⚠️  [${game.steam_appid}] 이름 불일치`);
            console.log(`    Steam: "${steamName}"`);
            console.log(`    DB:    "${game.title_ko || game.title}"`);
            wrong.push({ game, steamName, reason: '이름 불일치' });
        } else {
            process.stdout.write(`✅ ${game.steam_appid} `);
        }

        if (checked % 10 === 0) console.log(`\n--- ${checked}/${games.length} 완료 ---`);
        await sleep(1500); // Rate limit 방지
    }

    console.log(`\n\n${'='.repeat(60)}`);
    console.log(`검사 완료: ${games.length}개 중 ${wrong.length}개 문제 발견`);

    if (wrong.length === 0) {
        console.log('✅ 잘못 저장된 게임 없음!');
        await mongoose.disconnect();
        process.exit(0);
    }

    console.log('\n[삭제 대상 목록]');
    wrong.forEach(({ game, steamName, reason }) => {
        console.log(`  ${game.steam_appid}: "${game.title_ko || game.title}" (${reason})`);
        if (steamName) console.log(`    → Steam 실제 이름: "${steamName}"`);
    });

    if (FIX_MODE) {
        console.log('\n🗑  삭제 중...');
        let deleted = 0;
        for (const { game } of wrong) {
            await Game.deleteOne({ steam_appid: game.steam_appid });
            console.log(`  🗑  삭제: ${game.steam_appid} "${game.title_ko || game.title}"`);
            deleted++;
        }
        console.log(`\n✅ ${deleted}개 삭제 완료`);
    } else {
        console.log('\n⚠️  실제 삭제하려면: node cleanup_wrong_games.js --fix');
    }

    await mongoose.disconnect();
    process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });