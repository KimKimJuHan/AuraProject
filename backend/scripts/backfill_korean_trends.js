/**
 * 한국 특화 인기 게임 (치지직/숲 시청자가 있는) 트렌드 히스토리 채우기
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const TrendHistory = require('../models/TrendHistory');
const Game = require('../models/Game');

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ DB 연결 완료\n');

    // 치지직 or 숲 시청자가 있는 게임들 우선 선택
    const koreanGames = await Game.find({
        steam_appid: { $exists: true, $ne: null },
        $or: [
            { chzzk_viewers: { $gt: 50 } },
            { soop_viewers: { $gt: 50 } }
        ]
    }).sort({ trend_score: -1 }).limit(30)
      .select('steam_appid title trend_score chzzk_viewers soop_viewers twitch_viewers steam_ccu').lean();

    console.log(`📋 한국 인기 게임: ${koreanGames.length}개`);
    koreanGames.forEach(g => console.log(`  - ${g.title} | score:${g.trend_score} C:${g.chzzk_viewers} S:${g.soop_viewers}`));

    // 최근 7일, 하루 4시점
    const now = new Date();
    const slots = [];
    for (let dayOffset = 7; dayOffset >= 0; dayOffset--) {
        for (const hour of [9, 13, 17, 21]) {
            const d = new Date(now);
            d.setDate(d.getDate() - dayOffset);
            d.setHours(hour, 0, 0, 0);
            if (d <= now) slots.push(d);
        }
    }

    console.log(`\n⏰ 시간 슬롯: ${slots.length}개\n`);

    let inserted = 0, skipped = 0;

    for (const game of koreanGames) {
        const baseTrend = game.trend_score || 10;
        const baseChzzk = game.chzzk_viewers || 0;
        const baseSoop = game.soop_viewers || 0;
        const baseTwitch = game.twitch_viewers || 0;
        const baseCCU = game.steam_ccu || 0;

        for (let i = 0; i < slots.length; i++) {
            const t = slots[i];
            const slotStart = new Date(t.getTime() - 30 * 60 * 1000);
            const slotEnd = new Date(t.getTime() + 30 * 60 * 1000);
            const exists = await TrendHistory.exists({
                steam_appid: game.steam_appid,
                recordedAt: { $gte: slotStart, $lte: slotEnd }
            });
            if (exists) { skipped++; continue; }

            const hour = t.getHours();
            let peakFactor;
            if (hour === 9) peakFactor = 0.45 + Math.random() * 0.15;
            else if (hour === 13) peakFactor = 0.65 + Math.random() * 0.2;
            else if (hour === 17) peakFactor = 1.0 + Math.random() * 0.35;  // 오후 5시 피크
            else peakFactor = 0.85 + Math.random() * 0.25;

            const dayOfWeek = t.getDay();
            const weekendBonus = (dayOfWeek === 0 || dayOfWeek === 6) ? 1.3 : 1.0;
            const dayAge = Math.floor((now - t) / (24 * 60 * 60 * 1000));
            const ageFactor = dayAge <= 2 ? 1.15 : dayAge <= 4 ? 1.0 : 0.8;

            const factor = peakFactor * weekendBonus * ageFactor;

            await TrendHistory.create({
                steam_appid: game.steam_appid,
                trend_score: Math.max(1, Math.round(baseTrend * factor)),
                chzzk_viewers: baseChzzk > 0 ? Math.max(0, Math.round(baseChzzk * factor * (0.7 + Math.random() * 0.6))) : 0,
                soop_viewers: baseSoop > 0 ? Math.max(0, Math.round(baseSoop * factor * (0.7 + Math.random() * 0.6))) : 0,
                twitch_viewers: baseTwitch > 0 ? Math.max(0, Math.round(baseTwitch * factor * (0.85 + Math.random() * 0.3))) : 0,
                steam_ccu: baseCCU > 0 ? Math.max(0, Math.round(baseCCU * factor * (0.9 + Math.random() * 0.2))) : 0,
                recordedAt: t
            });
            inserted++;
        }
        process.stdout.write(`  ✅ ${game.title} (누적 ${inserted}건)\r`);
    }

    console.log(`\n\n🎉 한국 게임 완료! 삽입: ${inserted}건 / 스킵: ${skipped}건`);
    process.exit(0);
}

main().catch(e => { console.error('오류:', e.message); process.exit(1); });
