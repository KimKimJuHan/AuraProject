/**
 * fix_store_urls.js
 * steam_appid와 store_url의 appid가 불일치하는 게임을 찾아 수정합니다.
 * (예: 오버워치 데이터인데 URL이 건담 게임으로 되어있는 경우)
 *
 * 사용법: node fix_store_urls.js          (확인만)
 *         node fix_store_urls.js --fix    (실제 수정)
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Game = require('../models/Game');

const FIX_MODE = process.argv.includes('--fix');

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ DB 연결');
    console.log(`모드: ${FIX_MODE ? '✏️  실제 수정' : '🔍 확인만 (--fix 옵션으로 수정)'}\n`);

    // steam_appid 있는 전체 게임
    const games = await Game.find({
        steam_appid: { $exists: true, $gt: 0 }
    }).select('steam_appid title title_ko price_info').lean();

    console.log(`전체 게임: ${games.length}개 검사 중...\n`);

    const toFix = [];

    for (const g of games) {
        const appid = g.steam_appid;
        const url = g.price_info?.store_url || '';
        const correctUrl = `https://store.steampowered.com/app/${appid}`;

        // 문제 케이스 3가지:
        // 1. store_url이 없음
        // 2. store_url이 steampowered URL인데 appid가 다름
        // 3. store_url이 steampowered가 아닌 완전히 다른 URL

        let reason = null;

        if (!url) {
            reason = 'URL 없음';
        } else {
            const match = url.match(/store\.steampowered\.com\/app\/(\d+)/);
            if (match) {
                const urlAppId = parseInt(match[1]);
                if (urlAppId !== appid) {
                    reason = `AppID 불일치 (URL:${urlAppId} ≠ DB:${appid})`;
                }
            }
            // steampowered URL이 아닌 경우는 건드리지 않음 (ITAD 등 다른 스토어)
        }

        if (reason) {
            toFix.push({ game: g, correctUrl, reason });
            console.log(`⚠️  [${appid}] "${g.title_ko || g.title}"`);
            console.log(`    현재: "${url || '없음'}"`);
            console.log(`    수정: "${correctUrl}" (${reason})`);
        }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`문제 발견: ${toFix.length}개`);

    if (toFix.length === 0) {
        console.log('✅ 모든 store_url이 정상입니다.');
        await mongoose.disconnect();
        process.exit(0);
    }

    if (FIX_MODE) {
        let fixed = 0;
        for (const { game, correctUrl } of toFix) {
            await require('../models/Game').updateOne(
                { steam_appid: game.steam_appid },
                { $set: { 'price_info.store_url': correctUrl } }
            );
            fixed++;
        }
        console.log(`\n✅ ${fixed}개 수정 완료`);
    } else {
        console.log('\n위 목록을 확인하고 수정하려면: node fix_store_urls.js --fix');
    }

    await mongoose.disconnect();
    process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });