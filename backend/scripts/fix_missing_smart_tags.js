/**
 * 누락된 smart_tags 복구 스크립트
 * - 컬렉터가 채우기 전에 이미 원본 tags가 있는 게임들은 즉시 매핑 적용
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Game = require('../models/Game');
const { mapSteamTags } = require('../utils/tagMapper');

// 난이도 계산 (기존 calcDifficulty와 동일 로직)
function calcDifficulty(tags) {
    const hardTags = ['Souls-like', 'Rogue-like', 'Rogue-lite', 'Difficult', 'Perma Death', 'Hardcore'];
    const easyTags = ['Casual', 'Relaxing', 'Family Friendly', 'Cute', 'Cozy'];

    let score = 0;
    tags.forEach(t => {
        if (hardTags.includes(t)) score += 2;
        if (easyTags.includes(t)) score -= 1;
    });

    if (score >= 2) return '심화';
    if (score <= -1) return '초심자';
    return '보통';
}

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const missing = await Game.find({
        steam_appid: { $exists: true, $ne: null },
        $or: [{ smart_tags: { $exists: false } }, { smart_tags: { $size: 0 } }],
        tags: { $exists: true, $not: { $size: 0 } }
    }).select('_id title tags').lean();

    console.log(`복구 대상: ${missing.length}개`);

    let fixed = 0;
    for (const game of missing) {
        if (!game.tags || game.tags.length === 0) continue;
        const smartTags = mapSteamTags(game.tags);
        const diff = calcDifficulty(smartTags);
        
        await Game.updateOne(
            { _id: game._id },
            { $set: { smart_tags: smartTags, difficulty: diff } }
        );
        fixed++;
    }

    console.log(`✅ 스마트 태그 복구 완료: ${fixed}개`);
    process.exit(0);
}

main().catch(console.error);
