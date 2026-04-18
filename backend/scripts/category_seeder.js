const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
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
    "Elden Ring": "엘든 링", 
    "Subnautica": "Subnautica",
    "Rust": "Rust",
    "League of Legends": "리그 오브 레전드" 
};

const MANUAL_TWITCH_MAPPING = {
    "Wallpaper Engine": { id: "491578", name: "Wallpaper Engine" },
    "Street Fighter 30th Anniversary Collection": { id: "504461", name: "Street Fighter 30th Anniversary Collection" }
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
    } catch (e) {}
}

function buildTwitchBaseTitle(name) {
    if (!name) return "";
    let base = name.replace(/^\[.*?\]\s*/, "").replace(/[®™©]/g, "").replace(/\(.*?\)/g, "").trim();
    if (base.includes('+')) base = base.split('+')[0].trim();
    return base.replace(/\s+/g, ' ').trim();
}

async function searchTwitch(gameName, korTitleOptional) {
    if (!twitchToken) await getTwitchToken();
    if (!TWITCH_CLIENT_ID || !twitchToken) return null; 

    if (MANUAL_TWITCH_MAPPING[gameName]) return MANUAL_TWITCH_MAPPING[gameName];

    const baseTitle = buildTwitchBaseTitle(gameName);
    const cleanName = gameName.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim(); 
    const searchQueries = [baseTitle, gameName, cleanName, gameName.split(':')[0].trim(), korTitleOptional].filter(q => q && q.length >= 2); 
    const uniqueQueries = [...new Set(searchQueries)]; 

    for (const query of uniqueQueries) {
        try {
            const res = await axios.get('https://api.twitch.tv/helix/search/categories', {
                headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchToken}` },
                params: { query: query, first: 1 } 
            });
            const data = res.data?.data?.[0];
            if (data) return { id: data.id, name: data.name, boxArt: data.box_art_url };
        } catch (e) {
            if (e.response && e.response.status === 401) await getTwitchToken(); 
            else if (e.response && e.response.status === 429) await sleep(2000); 
        }
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
        const noSpecial = gameName.replace(/[^\w\s가-힣]/g, ' ').trim(); 
        const searchTerms = [korName, gameName, cleanName, noSpecial].filter(n => n && n.length > 1);
        const uniqueTerms = [...new Set(searchTerms)];

        for (const term of uniqueTerms) {
            try {
                const res = await axios.get(`https://openapi.chzzk.naver.com/open/v1/categories/search?query=${encodeURIComponent(term)}`, {
                    headers: { 'Client-Id': CHZZK_CLIENT_ID, 'Client-Secret': CHZZK_CLIENT_SECRET },
                    timeout: 3000
                });
                
                const results = res.data?.content?.data || res.data?.data || [];
                
                if (results.length > 0) {
                    const normalize = (str) => str.replace(/[^\w가-힣0-9]/g, '').toLowerCase();
                    const exactMatch = results.find(r => 
                        normalize(r.categoryValue) === normalize(korName || "") || 
                        normalize(r.categoryValue) === normalize(gameName) ||
                        normalize(r.categoryValue) === normalize(cleanName)
                    );
                    if (exactMatch) return { categoryValue: exactMatch.categoryValue, posterImageUrl: exactMatch.imageUrl || "" };
                    else return { categoryValue: results[0].categoryValue, posterImageUrl: results[0].imageUrl || "" };
                }
            } catch (error) {}
            await sleep(100);
        }
    }
    if (inferredSlug.length > 0) return { categoryValue: inferredSlug, posterImageUrl: "" };
    return null;
}

async function seedCategories() {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ DB 연결됨. 트렌드 매핑 시작...");

    const gamesToMap = await GameMetadata.find().select('steamAppId title').lean();
    console.log(`🎯 전체 대상 게임 수: ${gamesToMap.length}개`);
    
    let processed = 0, skipped = 0, updated = 0;

    for (const game of gamesToMap) {
        const steamId = game.steamAppId;
        const gameTitle = game.title;
        processed++;

        const exists = await GameCategory.findOne({ steamAppId: steamId });
        
        if (exists) {
            const isFresh = exists.lastUpdated && (Date.now() - new Date(exists.lastUpdated).getTime() < 7 * 24 * 60 * 60 * 1000);
            const hasTwitch = exists.twitch && exists.twitch.id;
            
            let isDummyChzzk = false;
            if (exists.chzzk && exists.chzzk.categoryValue) {
                isDummyChzzk = /^[A-Z_0-9]+$/.test(exists.chzzk.categoryValue);
            }
            const hasValidChzzk = exists.chzzk && exists.chzzk.categoryValue && !isDummyChzzk;

            // ★ 버그 완벽 해결: ||(OR)를 &&(AND)로 변경. 치지직이 더미면 무조건 다시 수집함.
            if (isFresh && hasTwitch && hasValidChzzk) {
                skipped++;
                continue;
            }
        }

        const gameRecord = await Game.findOne({ steam_appid: steamId }).select('title_ko').lean();
        const korTitle = gameRecord?.title_ko;
        
        console.log(`\n🔍 [${processed}/${gamesToMap.length}] 매핑: ${gameTitle} (한글: ${korTitle || '-'})`);
        
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
        
        const twitchLog = twitchData ? `💜 ${twitchData.name}` : "❌";
        const chzzkLog = chzzkData ? `💚 ${chzzkData.categoryValue}` : `⚠️ ${doc.chzzk.categoryValue} (추론)`;
        console.log(`   ${twitchLog} | ${chzzkLog}`);
        
        await sleep(300); 
    }

    console.log(`\n🎉 매핑 완료! (총: ${processed}, 업데이트: ${updated}, 건너뜀: ${skipped})`);
    process.exit(0);
}

seedCategories();