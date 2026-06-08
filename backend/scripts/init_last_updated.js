/**
 * 누락된 lastUpdated 필드를 초기화하여 일일 수집기가 골고루 순환(Round-robin)할 수 있도록 큐 분산
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Game = require('../models/Game');

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const games = await Game.find({ lastUpdated: { $exists: false } }).select('_id').lean();
    console.log(`초기화 대상: ${games.length}개`);

    if (games.length === 0) {
        console.log('초기화할 대상이 없습니다.');
        process.exit(0);
    }

    // 30일 간격으로 골고루 분산 (오래된 날짜로 세팅하여 수집기가 바로 물어가게 함)
    // 단, 순서는 유지되도록 하여 큐가 형성되게 함
    const now = Date.now();
    let updated = 0;

    for (let i = 0; i < games.length; i++) {
        const g = games[i];
        const spreadMs = (i % 30) * 24 * 60 * 60 * 1000 + (Math.random() * 86400000);
        const pastDate = new Date(now - (30 * 24 * 60 * 60 * 1000) - spreadMs);

        await Game.updateOne({ _id: g._id }, { $set: { lastUpdated: pastDate } });
        updated++;
        if (updated % 500 === 0) console.log(`${updated}개 갱신...`);
    }

    console.log(`✅ lastUpdated 초기화 완료: ${updated}개 분산 적용`);
    process.exit(0);
}

main().catch(console.error);
