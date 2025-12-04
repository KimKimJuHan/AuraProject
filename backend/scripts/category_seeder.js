// backend/scripts/category_seeder.js

require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const axios = require('axios');

const GameCategory = require('../models/GameCategory');
const GameMetadata = require('../models/GameMetadata');
const Game = require('../models/Game'); 

const { MONGODB_URI, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, CHZZK_CLIENT_ID, CHZZK_CLIENT_SECRET } = process.env;

const MANUAL_CHZZK_MAPPING = {
    "DARK SOULS III": "DARK_SOULS_III",
    "Among Us": "Among_Us",
    "Grand Theft Auto V": "Grand_Theft_Auto_V",
    "Counter-Strike 2": "Counter-Strike",
    "BioShock Infinite": "BioShock_Infinite",
    "Cuphead": "Cuphead",
    "Dead Cells": "Dead_Cells",
    "Stray": "Stray",
    "Elden Ring": "ELDEN_RING", 
    "Subnautica": "Subnautica",
    "Rust": "Rust"
};

const MANUAL_TWITCH_MAPPING = {
    "Wallpaper Engine": { id: "491578", name: "Wallpaper Engine" },
    "Street Fighter 30th Anniversary Collection": { id: "504461", name: "Street Fighter 30th Anniversary Collection" },
    "The Henry Stickmin Collection": { id: "512820", name: "The Henry Stickmin Collection" },
    "Castlevania Advance Collection": { id: "1547006883", name: "Castlevania Advance Collection" },
    "Command & Conquer™ Remastered Collection": { id: "516629", name: "Command & Conquer Remastered Collection" },
    "WRC 10 FIA World Rally Championship": { id: "1230656096", name: "WRC 10" },
    "WRC 9 FIA World Rally Championship": { id: "518753", name: "WRC 9" },
    "WRC Generations – The FIA WRC Official Game": { id: "1093566164", name: "WRC Generations" }
};

if (!MONGODB_URI) { 
    console.error("❌ 오류: MONGODB_URI 환경 변수 누락. DB 연결 불가."); 
    process.exit(1);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let twitchToken = null;

async function getTwitchToken() {
    if (!TWITCH_CLIENT_ID) return;
    try {
        const res = await axios.post('https://id.twitch.tv/oauth2/token', null, {
            params: { client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' }
        });
        twitchToken = res.data.access_token;
        console.log("💜 Twitch Token 확보 완료");
    } catch (e) { console.error("❌ Twitch Token 실패"); }
}

function buildTwitchBaseTitle(name) {
    if (!name) return "";
    let base = name;
    base = base.replace(/^\[.*?\]\s*/, "");
    base = base.replace(/[®™©]/g, "");
    base = base.replace(/\(.*?\)/g, "").trim();
    if (base.includes('+')) base = base.split('+')[0].trim();
  
    const editionWords = [
      "complete edition", "game of the year edition", "game of the year", "goty edition", "goty",
      "definitive edition", "remastered", "remaster", "hd remaster", "hd collection", "hd",
      "legendary edition", "ultimate edition", "director's cut", "intergrade", "reload",
      "reloaded edition", "anniversary edition", "special edition", "enhanced edition", "enhanced",
      "steam edition", "windows edition", "collection", "trilogy"
    ];
  
    const lower = base.toLowerCase();
    for (const word of editionWords) {
      const idx = lower.lastIndexOf(word);
      if (idx !== -1) {
        if (idx + word.length === lower.length || base[idx - 1] === ' ') {
            base = base.slice(0, idx).trim();
            break;
        }
      }
    }
    if (base.includes(':')) base = base.split(':')[0].trim();
    if (base.includes(' - ')) base = base.split(' - ')[0].trim();
    base = base.replace(/\s+/g, ' ').trim();
    return base;
}

async function searchTwitch(gameName, korTitleOptional) {
    if (!twitchToken) await getTwitchToken();
    if (!TWITCH_CLIENT_ID || !twitchToken) return null; 

    if (MANUAL_TWITCH_MAPPING[gameName]) return MANUAL_TWITCH_MAPPING[gameName];

    const baseTitle = buildTwitchBaseTitle(gameName);
    const searchQueries = [
        baseTitle, gameName, gameName.replace(/[®™©]/g, '').trim(),
        gameName.split(':')[0].trim(), korTitleOptional || null
    ].filter(q => q && q.length >= 2);

    const uniqueQueries = [...new Set(searchQueries)];

    for (const query of uniqueQueries) {
        try {
            const res = await axios.get('https://api.twitch.tv/helix/search/categories', {
                headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchToken}` },
                params: { query: query, first: 1 } 
            });
            const data = res.data?.data?.[0];
            if (data) return { id: data.id, name: data.name, boxArt: data.box_art_url };
        } catch (e) { }
        await sleep(100);
    }
    return null;
}

async function searchChzzk(gameName, korName) { 
    const manualSlug = MANUAL_CHZZK_MAPPING[gameName] || (korName && MANUAL_CHZZK_MAPPING[korName]);
    if (manualSlug) return { categoryValue: manualSlug, posterImageUrl: "" };
    
    const inferredSlug = gameName.normalize("NFKD").replace(/[^\w\s]/g, '').trim().replace(/\s+/g, '_').toUpperCase();

    if (CHZZK_CLIENT_ID && CHZZK_CLIENT_SECRET) {
        const cleanName = gameName.replace(/[-:™®©]/g, ' ').trim();
        const noSpecial = gameName.replace(/[^\w\s가-힣]/g, '').trim();
        const searchTerms = [
            korName, gameName, cleanName, noSpecial, gameName.toLowerCase(), inferredSlug 
        ].filter(n => n && n.length > 1);

        const uniqueTerms = [...new Set(searchTerms)];

        for (const term of uniqueTerms) {
            try {
                const res = await axios.get(`https://api.chzzk.naver.com/open/v1/categories/search`, {
                    headers: { 
                        'User-Agent': 'Mozilla/5.0',
                        'Client-Id': CHZZK_CLIENT_ID,
                        'Client-Secret': CHZZK_CLIENT_SECRET 
                    },
                    params: { query: term, size: 1 },
                    timeout: 3000
                });
                const data = res.data?.data?.[0];
                if (data) return { categoryValue: data.categoryValue, posterImageUrl: data.posterImageUrl };
            } catch (error) { }
            await sleep(100);
        }
    }
    if (inferredSlug.length > 0) return { categoryValue: inferredSlug, posterImageUrl: "" };
    return null;
}

async function seedCategories() {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ DB 연결됨. GameMetadata에서 목록을 가져와 트렌드 매핑 시작...");

    const gamesToMap = await GameMetadata.find().select('steamAppId title').lean();
    console.log(`🎯 전체 대상 게임 수: ${gamesToMap.length}개`);
    
    let processed = 0;
    let skipped = 0;
    let updated = 0;

    for (const game of gamesToMap) {
        const steamId = game.steamAppId;
        const gameTitle = game.title;
        processed++;

        const exists = await GameCategory.findOne({ steamAppId: steamId });
        
        // ★ [수정됨] 건너뛰기 로직 강화
        // 1. 이미 존재하고 (exists)
        // 2. 최근 1주일 내에 업데이트 되었으며 (isFresh)
        // 3. ★ 중요: 데이터가 "유의미하게" 들어있어야 함 (hasData)
        // -> 데이터가 비어있으면(실패했으면) 날짜가 최신이어도 다시 시도!
        if (exists) {
            const isFresh = exists.lastUpdated && (Date.now() - new Date(exists.lastUpdated).getTime() < 7 * 24 * 60 * 60 * 1000);
            const hasData = (exists.twitch && exists.twitch.id) || (exists.chzzk && exists.chzzk.categoryValue && exists.chzzk.categoryValue.length < 50); // 너무 긴 slug는 자동생성된 더미일 수 있음

            if (isFresh && hasData) {
                skipped++;
                continue;
            }
        }

        const gameRecord = await Game.findOne({ steam_appid: steamId }).select('title_ko').lean();
        const korTitle = gameRecord?.title_ko;
        
        console.log(`\n🔍 [${processed}/${gamesToMap.length}] 매핑 시작: ${gameTitle} (한글: ${korTitle || '-'})`);
        
        let twitchData = await searchTwitch(gameTitle, korTitle);
        let chzzkData = await searchChzzk(gameTitle, korTitle); 

        const doc = {
            steamAppId: Number(steamId),
            title: gameTitle,
            twitch: twitchData || {},
            chzzk: chzzkData || {},
            lastUpdated: new Date()
        };

        await GameCategory.findOneAndUpdate({ steamAppId: steamId }, doc, { upsert: true });
        updated++;
        
        console.log(`   💜 Twitch: ${twitchData ? twitchData.name : "❌ 실패"}`);
        console.log(`   💚 Chzzk : ${chzzkData ? chzzkData.categoryValue : "❌ 실패"}`);
        
        await sleep(500); 
    }

    console.log(`\n🎉 매핑 완료! (총: ${processed}, 업데이트: ${updated}, 건너뜀: ${skipped})`);
    process.exit(0);
}

seedCategories();