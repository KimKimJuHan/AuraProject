/**
 * fix_tags_and_titles.js
 * 
 * 1) 태그가 없는 게임들에 대해 Steam AppDetails API(cc=kr, l=korean)를 호출하여 tags, smart_tags 복구
 * 2) title_ko가 영어 title과 똑같거나 없는 게임에 대해 한글 타이틀 복구
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const axios = require('axios');

const Game = require('../models/Game');
const { mapSteamTags } = require('../utils/tagMapper');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('❌ MONGODB_URI 없음'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getSteamDetails(appId) {
    try {
        const res = await axios.get('https://store.steampowered.com/api/appdetails', {
            params: { appids: appId, cc: 'kr', l: 'korean' },
            timeout: 8000
        });
        const data = res.data?.[appId]?.data;
        if (!data) return null;
        
        const tags = [];
        if (data.genres) data.genres.forEach(g => tags.push(g.description));
        if (data.categories) data.categories.forEach(c => tags.push(c.description));

        return {
            title_ko: data.name,
            tags: tags,
        };
    } catch { return null; }
}

async function run() {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ DB 연결 완료');

    const games = await Game.find({
        steam_appid: { $exists: true, $ne: null },
        $or: [
            { tags: { $size: 0 } },
            { smart_tags: { $size: 0 } },
            { $expr: { $eq: ["$title", "$title_ko"] } },
            { title_ko: { $exists: false } }
        ]
    }).select('_id steam_appid title title_ko tags smart_tags').lean();

    console.log(`\n📋 처리 대상 게임 수: ${games.length}개`);
    if (games.length === 0) {
        console.log('🎉 모든 게임 정상입니다.');
        process.exit(0);
    }

    let updated = 0;
    for (let i = 0; i < games.length; i++) {
        const game = games[i];
        
        const details = await getSteamDetails(game.steam_appid);
        if (!details) {
            await sleep(400);
            continue;
        }

        const updateData = {};
        
        // 1. 태그 복구
        if (!game.tags || game.tags.length === 0 || !game.smart_tags || game.smart_tags.length === 0) {
            if (details.tags.length > 0) {
                updateData.tags = details.tags;
                updateData.smart_tags = mapSteamTags(details.tags);
            }
        }

        // 2. 한글 제목 복구
        if (details.title_ko && details.title_ko !== game.title) {
            // 특수문자나 상표만 다를 수 있음
            const cleanSteam = details.title_ko.replace(/[^a-zA-Z0-9가-힣]/g, '').toLowerCase();
            const cleanOrigin = game.title.replace(/[^a-zA-Z0-9가-힣]/g, '').toLowerCase();
            if (cleanSteam !== cleanOrigin) {
                updateData.title_ko = details.title_ko;
            }
        }

        if (Object.keys(updateData).length > 0) {
            await Game.updateOne({ _id: game._id }, { $set: updateData });
            updated++;
            console.log(`[${i+1}/${games.length}] ✅ ${game.title} -> ${updateData.title_ko || game.title_ko} (태그: ${(updateData.smart_tags||game.smart_tags).length}개)`);
        }
        
        await sleep(350); // Steam API Rate limit 방지
    }

    console.log(`\n🎉 메타데이터 복구 완료! (${updated}/${games.length} 업데이트 됨)`);
    process.exit(0);
}

run().catch(err => {
    console.error('오류:', err);
    process.exit(1);
});
