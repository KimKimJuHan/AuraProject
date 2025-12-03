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

// 정말 검색으로 안 잡히는 예외 케이스만 수동 추가
const MANUAL_TWITCH_MAPPING = {
    // 예: "Wallpaper Engine": { id: "491578", name: "Wallpaper Engine" }
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

// ★ [핵심] 트위치 검색용 '베이스 타이틀' 생성 함수
function buildTwitchBaseTitle(name) {
    if (!name) return "";
  
    let base = name;
  
    // 1) [제작사] 같은 대괄호 접두어 제거 (예: "[Chilla's Art] The Kidnap")
    base = base.replace(/^\[.*?\]\s*/, "");

    // 2) 트레이드마크 기호 제거
    base = base.replace(/[®™©]/g, "");
  
    // 3) 괄호 안 내용 제거 (예: "(2019)", "(US Version)")
    base = base.replace(/\(.*?\)/g, "").trim();

    // 4) "+ 부제" 형태 제거 (예: "Devil May Cry 5 + Vergil")
    if (base.includes('+')) {
        base = base.split('+')[0].trim();
    }
  
    // 5) 대표적인 에디션 꼬리표 제거
    const editionWords = [
      "complete edition",
      "game of the year edition",
      "game of the year", 
      "goty edition",
      "goty",
      "definitive edition",
      "remastered",
      "remaster",
      "hd remaster",
      "hd collection", 
      "hd",
      "legendary edition",
      "ultimate edition",
      "director's cut",
      "intergrade",
      "reload",
      "reloaded edition",
      "anniversary edition",
      "special edition",
      "enhanced edition", 
      "enhanced",
      "steam edition",    
      "windows edition",  
      "collection",       
      "trilogy"           
    ];
  
    const lower = base.toLowerCase();
    for (const word of editionWords) {
      const idx = lower.lastIndexOf(word);
      if (idx !== -1) {
        // 단어가 문자열 끝부분에 있거나, 뒤에 공백만 남은 경우에만 자름 (오매칭 방지)
        if (idx + word.length === lower.length || base[idx - 1] === ' ') {
            base = base.slice(0, idx).trim();
            break;
        }
      }
    }
  
    // 6) 콜론/대시 앞 부분만 남기기 (가장 강력한 필터라 마지막에)
    if (base.includes(':')) base = base.split(':')[0].trim();
    if (base.includes(' - ')) base = base.split(' - ')[0].trim();
  
    // 7) 중복 공백 제거
    base = base.replace(/\s+/g, ' ').trim();
  
    return base;
}

async function searchTwitch(gameName, korTitleOptional) {
    if (!twitchToken) await getTwitchToken();
    if (!TWITCH_CLIENT_ID || !twitchToken) return null; 

    // 0. 수동 매핑 확인
    if (MANUAL_TWITCH_MAPPING[gameName]) {
        return MANUAL_TWITCH_MAPPING[gameName];
    }

    // 1. 베이스 타이틀 계산
    const baseTitle = buildTwitchBaseTitle(gameName);

    // 2. 검색 쿼리 후보 구성 (우선순위 순)
    const searchQueries = [
        baseTitle,                                  // 1순위: 정제된 베이스 타이틀
        gameName,                                   // 2순위: 원본
        gameName.replace(/[®™©]/g, '').trim(),
        gameName.split(':')[0].trim(),
        korTitleOptional || null                    // 옵션: 한국어 제목
    ].filter(q => q && q.length >= 2);              // null 제거 및 너무 짧은 검색어 제외

    // 중복 제거
    const uniqueQueries = [...new Set(searchQueries)];

    for (const query of uniqueQueries) {
        try {
            const res = await axios.get('https://api.twitch.tv/helix/search/categories', {
                headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchToken}` },
                params: { query: query, first: 1 } 
            });
            const data = res.data?.data?.[0];
            
            if (data) {
                // console.log(`   💜 Twitch Match: "${query}" -> "${data.name}"`);
                return { id: data.id, name: data.name, boxArt: data.box_art_url };
            }
        } catch (e) { }
        await sleep(100); // 딜레이
    }
    return null;
}

async function searchChzzk(gameName, korName) { 
    // 1. 수동 매핑 확인
    const manualSlug = MANUAL_CHZZK_MAPPING[gameName] || (korName && MANUAL_CHZZK_MAPPING[korName]);
    if (manualSlug) {
        return { categoryValue: manualSlug, posterImageUrl: "" };
    }
    
    // 2. 개선된 Slug 생성 (유니코드 정규화 + 특수문자 제거 + 대문자)
    const inferredSlug = gameName
        .normalize("NFKD") 
        .replace(/[^\w\s]/g, '') 
        .trim()
        .replace(/\s+/g, '_') 
        .toUpperCase();

    // 3. API 검색
    if (CHZZK_CLIENT_ID && CHZZK_CLIENT_SECRET) {
        const cleanName = gameName.replace(/[-:™®©]/g, ' ').trim();
        const noSpecial = gameName.replace(/[^\w\s가-힣]/g, '').trim();

        const searchTerms = [
            korName,
            gameName,
            cleanName,
            noSpecial,
            gameName.toLowerCase(),
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
                if (data) {
                    return { categoryValue: data.categoryValue, posterImageUrl: data.posterImageUrl };
                }
            } catch (error) { }
            await sleep(100);
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
    console.log(`🎯 전체 대상 게임 수: ${gamesToMap.length}개`);
    
    let processed = 0;
    let skipped = 0;
    let updated = 0;

    for (const game of gamesToMap) {
        const steamId = game.steamAppId;
        const gameTitle = game.title;
        processed++;

        // ★ 건너뛰기 로직: Twitch와 Chzzk 둘 다 성공했었던 경우만 스킵
        const exists = await GameCategory.findOne({ steamAppId: steamId });
        if (exists) {
            const hasTwitch = exists.twitch && exists.twitch.id;
            const hasChzzk = exists.chzzk && exists.chzzk.categoryValue;
            
            const isFresh = exists.lastUpdated && (Date.now() - new Date(exists.lastUpdated).getTime() < 7 * 24 * 60 * 60 * 1000);

            if (hasTwitch && hasChzzk && isFresh) {
                skipped++;
                continue;
            }
        }

        const gameRecord = await Game.findOne({ steam_appid: steamId }).select('title_ko').lean();
        const korTitle = gameRecord?.title_ko;
        
        console.log(`\n🔍 [${processed}/${gamesToMap.length}] 처리 중: ${gameTitle} (한글명: ${korTitle || '없음'})`);
        
        // ★ searchTwitch에 korTitle 추가 전달
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
        console.log(`   💚 Chzzk : ${chzzkData ? chzzkData.categoryValue : "❌ 실패 (Slug: " + doc.chzzk.categoryValue + ")"}`);
        
        await sleep(500); 
    }

    console.log(`\n🎉 매핑 완료! (총: ${processed}, 업데이트: ${updated}, 건너뜀: ${skipped})`);
    process.exit(0);
}

seedCategories();