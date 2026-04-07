// backend/scripts/category_seeder.js
// 기능: Twitch/Chzzk 카테고리 매핑 (검색어 다변화 전략 적용)

require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const axios = require('axios');

const GameCategory = require('../models/GameCategory');
const GameMetadata = require('../models/GameMetadata');
const Game = require('../models/Game'); 

const { MONGODB_URI, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, CHZZK_CLIENT_ID, CHZZK_CLIENT_SECRET } = process.env;

// 1. 수동 매핑 리스트 (검색으로 절대 안 나오는 예외 케이스들)
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
    "Rust": "Rust",
    "League of Legends": "League_of_Legends"
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

// ==========================================
// 🟣 Twitch API 관련 로직
// ==========================================
let twitchToken = null;

async function getTwitchToken() {
    if (!TWITCH_CLIENT_ID) return;
    try {
        const res = await axios.post('https://id.twitch.tv/oauth2/token', null, {
            params: { client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' }
        });
        twitchToken = res.data.access_token;
        console.log("💜 Twitch Token 발급 완료");
    } catch (e) { 
        console.error("❌ Twitch Token 발급 실패:", e.message); 
    }
}

// "Edition", "Remastered" 등 불필요한 접미사 제거
function buildTwitchBaseTitle(name) {
    if (!name) return "";
    let base = name.replace(/^\[.*?\]\s*/, "").replace(/[®™©]/g, "").replace(/\(.*?\)/g, "").trim();
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
    // 콜론, 하이픈 제거는 검색어 생성 로직에서 별도로 수행하므로 여기서는 놔둠
    return base.replace(/\s+/g, ' ').trim();
}

async function searchTwitch(gameName, korTitleOptional) {
    if (!twitchToken) await getTwitchToken();
    if (!TWITCH_CLIENT_ID || !twitchToken) return null; 

    if (MANUAL_TWITCH_MAPPING[gameName]) return MANUAL_TWITCH_MAPPING[gameName];

    // ★ Twitch 검색 전략 (우선순위 순서)
    // 1. Base Title (에디션 제거 버전)
    // 2. Original Name (원본)
    // 3. Clean Name (특수문자 제거) -> "MARVEL vs. CAPCOM" 해결용
    // 4. Before Colon (콜론 앞)
    // 5. Before Hyphen (하이픈 앞)
    const baseTitle = buildTwitchBaseTitle(gameName);
    const cleanName = gameName.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim(); 

    const searchQueries = [
        baseTitle,
        gameName,
        cleanName,
        gameName.split(':')[0].trim(),
        gameName.split('-')[0].trim(),
        korTitleOptional // 한국어 제목이 있으면 마지막 수단으로 시도
    ].filter(q => q && q.length >= 2); // 2글자 미만 제외

    const uniqueQueries = [...new Set(searchQueries)]; // 중복 제거

    for (const query of uniqueQueries) {
        try {
            const res = await axios.get('https://api.twitch.tv/helix/search/categories', {
                headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchToken}` },
                params: { query: query, first: 1 } 
            });
            const data = res.data?.data?.[0];
            if (data) return { id: data.id, name: data.name, boxArt: data.box_art_url };
        } catch (e) {
            if (e.response && e.response.status === 401) {
                console.log("🔄 Twitch Token 만료. 재발급...");
                await getTwitchToken(); 
            } else if (e.response && e.response.status === 429) {
                await sleep(2000); // Rate Limit 대기
            }
        }
        await sleep(100); // 쿼리 간 딜레이
    }
    return null;
}

// ==========================================
// 🟢 Chzzk API 관련 로직
// ==========================================
async function searchChzzk(gameName, korName) { 
    // 수동 매핑 확인
    const manualSlug = MANUAL_CHZZK_MAPPING[gameName] || (korName && MANUAL_CHZZK_MAPPING[korName]);
    if (manualSlug) return { categoryValue: manualSlug, posterImageUrl: "" };
    
    // 자동 생성 슬러그 (대문자_언더바_규칙)
    const inferredSlug = gameName.normalize("NFKD").replace(/[^\w\s]/g, '').trim().replace(/\s+/g, '_').toUpperCase();

    if (CHZZK_CLIENT_ID && CHZZK_CLIENT_SECRET) {
        const cleanName = gameName.replace(/[-:™®©]/g, ' ').trim();
        const noSpecial = gameName.replace(/[^\w\s가-힣]/g, ' ').trim(); // 한글+영문+숫자 외 제거
        
        // ★ Chzzk 검색 전략 (우선순위 순서)
        // 1. 한국어 제목 (가장 정확함)
        // 2. 영문 원본
        // 3. 특수문자 제거 버전
        // 4. Inferred Slug (슬러그 자체로 검색)
        const searchTerms = [
            korName, 
            gameName, 
            cleanName, 
            noSpecial, 
            inferredSlug 
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
            } catch (error) { 
                // 404 등 에러는 무시하고 다음 검색어 시도
            }
            await sleep(100);
        }
    }
    
    // ★ 검색 실패 시 Fallback: 추론한 슬러그라도 저장 (나중에 수집기가 시청자 수 긁어올 때 시도함)
    if (inferredSlug.length > 0) return { categoryValue: inferredSlug, posterImageUrl: "" };
    return null;
}

// ==========================================
// 🚀 메인 실행 함수
// ==========================================
async function seedCategories() {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ DB 연결됨. 트렌드 매핑 시작...");

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
        
        // ★ 건너뛰기 로직 (효율성)
        // 이미 데이터가 있고 + 최근 1주 내 업데이트 + 데이터가 "유효"할 때만 건너뜀
        if (exists) {
            const isFresh = exists.lastUpdated && (Date.now() - new Date(exists.lastUpdated).getTime() < 7 * 24 * 60 * 60 * 1000);
            const hasTwitch = exists.twitch && exists.twitch.id;
            const hasChzzk = exists.chzzk && exists.chzzk.categoryValue && exists.chzzk.categoryValue.length < 60; // 너무 긴 슬러그는 의심

            if (isFresh && (hasTwitch || hasChzzk)) {
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
        
        await sleep(400); // 너무 빠르면 차단될 수 있으므로 적절한 딜레이
    }

    console.log(`\n🎉 매핑 완료! (총: ${processed}, 업데이트: ${updated}, 건너뜀: ${skipped})`);
    process.exit(0);
}

seedCategories();