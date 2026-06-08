/**
 * 데모용 트렌드 히스토리 채우기 스크립트
 * 
 * 전략:
 * - 현재 trend_score가 높은 인기 게임들의 과거 7일치 데이터를 시간별로 생성
 * - 오후 5시(17시) 기준으로 하루 4개 시점 (9시, 13시, 17시, 21시)으로 기록
 * - 트렌드가 올라갔다 내려가는 자연스러운 패턴을 반영
 * - 이미 데이터가 있는 시간대는 중복 삽입하지 않음
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const TrendHistory = require('../models/TrendHistory');
const Game = require('../models/Game');

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ DB 연결 완료\n');

    // 현재 트렌드 점수 기준 인기 게임 상위 30개 선택
    const topGames = await Game.find({
        trend_score: { $gt: 50 },
        steam_appid: { $exists: true, $ne: null }
    }).sort({ trend_score: -1 }).limit(30).select('steam_appid title trend_score chzzk_viewers soop_viewers twitch_viewers steam_ccu').lean();

    console.log(`📋 대상 게임: ${topGames.length}개`);
    topGames.forEach(g => console.log(`  - [${g.steam_appid}] ${g.title} | score:${g.trend_score}`));

    // 최근 7일 기준, 하루 4개 시점 생성 (9, 13, 17, 21시)
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

    console.log(`\n⏰ 생성할 시간 슬롯: ${slots.length}개 (${slots[0]?.toLocaleDateString()} ~ ${slots[slots.length-1]?.toLocaleDateString()})\n`);

    let inserted = 0;
    let skipped = 0;

    for (const game of topGames) {
        const baseTrend = game.trend_score || 10;
        const baseChzzk = game.chzzk_viewers || 0;
        const baseSoop = game.soop_viewers || 0;
        const baseTwitch = game.twitch_viewers || 0;
        const baseCCU = game.steam_ccu || 0;

        for (let i = 0; i < slots.length; i++) {
            const t = slots[i];

            // 이미 해당 시간대에 레코드가 있으면 스킵
            const slotStart = new Date(t.getTime() - 30 * 60 * 1000);
            const slotEnd = new Date(t.getTime() + 30 * 60 * 1000);
            const exists = await TrendHistory.exists({
                steam_appid: game.steam_appid,
                recordedAt: { $gte: slotStart, $lte: slotEnd }
            });
            if (exists) { skipped++; continue; }

            // 자연스러운 트렌드 곡선 생성:
            // - 오후 17시~21시 피크 (게임 황금 시간대)
            // - 오전 9시가 가장 낮고 저녁에 올라가는 패턴
            // - 랜덤 변동 ±20%
            const hour = t.getHours();
            let peakFactor;
            if (hour === 9) peakFactor = 0.5 + Math.random() * 0.2;       // 오전: 낮음
            else if (hour === 13) peakFactor = 0.7 + Math.random() * 0.2; // 낮: 보통
            else if (hour === 17) peakFactor = 1.0 + Math.random() * 0.3; // 저녁: 피크
            else peakFactor = 0.9 + Math.random() * 0.2;                  // 밤: 살짝 감소

            // 일별 변동: 주말(토=6, 일=0)에 조금 높음
            const dayOfWeek = t.getDay();
            const weekendBonus = (dayOfWeek === 0 || dayOfWeek === 6) ? 1.2 : 1.0;

            // 최근 3일 살짝 하강 패턴 (트렌드가 변화하는 것처럼 보이게)
            const dayAge = Math.floor((now - t) / (24 * 60 * 60 * 1000));
            const ageFactor = dayAge <= 2 ? 1.1 : dayAge <= 4 ? 1.0 : 0.85;

            const factor = peakFactor * weekendBonus * ageFactor;

            const trendScore = Math.max(1, Math.round(baseTrend * factor));
            const chzzkV = baseChzzk > 0 ? Math.max(0, Math.round(baseChzzk * factor * (0.8 + Math.random() * 0.4))) : 0;
            const soopV = baseSoop > 0 ? Math.max(0, Math.round(baseSoop * factor * (0.8 + Math.random() * 0.4))) : 0;
            const twitchV = baseTwitch > 0 ? Math.max(0, Math.round(baseTwitch * factor * (0.9 + Math.random() * 0.2))) : 0;
            const ccuV = baseCCU > 0 ? Math.max(0, Math.round(baseCCU * factor * (0.9 + Math.random() * 0.2))) : 0;

            await TrendHistory.create({
                steam_appid: game.steam_appid,
                trend_score: trendScore,
                chzzk_viewers: chzzkV,
                soop_viewers: soopV,
                twitch_viewers: twitchV,
                steam_ccu: ccuV,
                recordedAt: t
            });
            inserted++;
        }
        process.stdout.write(`  ✅ ${game.title} (${inserted}건 삽입)\r`);
    }

    console.log(`\n\n🎉 완료! 삽입: ${inserted}건 / 스킵(중복): ${skipped}건`);
    process.exit(0);
}

main().catch(e => { console.error('오류:', e.message); process.exit(1); });
