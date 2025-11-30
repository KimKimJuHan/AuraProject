// backend/scripts/category_seeder.js

require('dotenv').config({ path: '../.env' }); // .env 경로 명시 권장
const mongoose = require('mongoose');
const axios = require('axios');

// ★ 경로 수정됨 (../ 추가)
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

if (!MONGODB_URI) { 
    console.error("❌ 오류: MONGODB_URI 환경 변수 누락. DB 연결 불가."); 
    process.exit(1);
}

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

async function searchTwitch(gameName) {
    if (!twitchToken) await getTwitchToken();
    if (!TWITCH_CLIENT_ID || !twitchToken) return null; 

    const searchQueries = [
        gameName,
        gameName.replace(/[®™©]/g, '').trim(),
        gameName.replace(/[®™©:.\-]/g, ' ').replace(/\s+/g, ' ').trim(),
        gameName.split(':')[0].trim(),
        gameName.split('-')[0].trim()
    ];

    const uniqueQueries = [...new Set(searchQueries)];

    for (const query of uniqueQueries) {
        if (query.length < 2) continue;

        try {
            const res = await axios.get('https://api.twitch.tv/helix/search/categories', {
                headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchToken}` },
                params: { query: query, first: 1 } 
            });
            const data = res.data?.data?.[0];
            
            if (data) {
                console.log(`   💜 Twitch Match: "${query}" -> "${data.name}"`);
                return { id: data.id, name: data.name, boxArt: data.box_art_url };
            }
        } catch (e) { }
    }
    return null;
}

async function searchChzzk(gameName, korName) { 
    const manualSlug = MANUAL_CHZZK_MAPPING[gameName] || MANUAL_CHZZK_MAPPING[korName];
    if (manualSlug) {
        return { categoryValue: manualSlug, posterImageUrl: "" };
    }
    
    const inferredSlug = gameName.toUpperCase().replace(/[™®©:.\s-]/g, '_').replace(/_{2,}/g, '_').replace(/_$/, '');
    
    if (CHZZK_CLIENT_ID && CHZZK_CLIENT_SECRET) {
        const searchTerms = [korName, gameName].filter(n => n);
        
        for (const term of searchTerms) {
            try {
                const res = await axios.get(`https://api.chzzk.naver.com/open/v1/categories/search`, {
                    headers: { 
                        'User-Agent': 'Mozilla/5.0',
                        'Client-Id': CHZZK_CLIENT_ID,
                        'Client-Secret': CHZZK_CLIENT_SECRET 
                    },
                    params: { query: term, size: 1 } 
                });

                const data = res.data?.data?.[0];
                if (data) {
                    return { categoryValue: data.categoryValue, posterImageUrl: data.posterImageUrl };
                }
            } catch (error) { }
        }
    }

    if (inferredSlug.length > 0) {
        return { categoryValue: inferredSlug, posterImageUrl: "" };
    }
    
    return null;
}

async function seedCategories() {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ DB 연결됨. GameMetadata에서 목록을 가져와 트렌드 매핑 시작...");

    const gamesToMap = await GameMetadata.find().select('steamAppId title').lean();
    console.log(`🎯 매핑 대상 게임 수: ${gamesToMap.length}개`);
    
    let count = 0;
    for (const game of gamesToMap) {
        const steamId = game.steamAppId;
        const gameTitle = game.title;
        
        const gameRecord = await Game.findOne({ steam_appid: steamId }).select('title_ko').lean();
        const korTitle = gameRecord?.title_ko;
        
        console.log(`\n🔍 [${++count}/${gamesToMap.length}] 처리 중: ${gameTitle} (한글명: ${korTitle || '없음'})`);
        
        let twitchData = await searchTwitch(gameTitle);
        let chzzkData = await searchChzzk(gameTitle, korTitle); 

        const doc = {
            steamAppId: Number(steamId),
            title: gameTitle,
            twitch: twitchData || {},
            chzzk: chzzkData || {},
            lastUpdated: new Date()
        };

        await GameCategory.findOneAndUpdate({ steamAppId: steamId }, doc, { upsert: true });
        
        console.log(`   💜 Twitch: ${twitchData ? twitchData.name : "❌ 실패"}`);
        console.log(`   💚 Chzzk : ${chzzkData ? chzzkData.categoryValue : "❌ 실패"} (최종 매핑)`);
        
        await new Promise(r => setTimeout(r, 1000)); 
    }

    console.log("\n🎉 매핑 완료!");
    process.exit(0);
}

seedCategories();