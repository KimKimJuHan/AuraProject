require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
// [수정] 트렌드 정보는 GameCategory 모델에 저장합니다.
const GameCategory = require('./models/GameCategory');

const { MONGODB_URI, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, CHZZK_CLIENT_ID, CHZZK_CLIENT_SECRET } = process.env;

// 수집 대상 게임 목록
const TARGET_GAMES = [
    { id: 271590, name: "Grand Theft Auto V", kor: "GTA 5" },
    { id: 1086940, name: "Baldur's Gate 3", kor: "발더스 게이트 3" },
    { id: 1623730, name: "Palworld", kor: "팰월드" },
    { id: 578080, name: "PUBG: BATTLEGROUNDS", kor: "배틀그라운드" },
    { id: 730, name: "Counter-Strike 2", kor: "카운터 스트라이크 2" },
    { id: 570, name: "Dota 2", kor: "도타 2" },
    { id: 359550, name: "Tom Clancy's Rainbow Six Siege", kor: "레인보우 식스 시즈" },
    { id: 1172470, name: "Apex Legends", kor: "에이펙스 레전드" },
    { id: 1245620, name: "ELDEN RING", kor: "엘든 링" },
    { id: 292030, name: "The Witcher 3: Wild Hunt", kor: "더 위쳐 3: 와일드 헌트" },
    { id: 105600, name: "Terraria", kor: "테라리아" },
    { id: 413150, name: "Stardew Valley", kor: "스타듀 밸리" },
    { id: 1966720, name: "Lethal Company", kor: "리썰 컴퍼니" },
    { id: 230410, name: "Warframe", kor: "워프레임" },
    { id: 252490, name: "Rust", kor: "러스트" },
    { id: 221100, name: "DayZ", kor: "데이즈" },
    { id: 440, name: "Team Fortress 2", kor: "팀 포트리스 2" },
    { id: 550, name: "Left 4 Dead 2", kor: "레프트 4 데드 2" },
    { id: 945360, name: "Among Us", kor: "어몽어스" }
];

let twitchToken = null;

async function getTwitchToken() {
    if (!TWITCH_CLIENT_ID) return;
    try {
        const res = await axios.post('https://id.twitch.tv/oauth2/token', null, {
            params: { client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' }
        });
        twitchToken = res.data.access_token;
        console.log("💜 Twitch Token 확보");
    } catch (e) { console.error("❌ Twitch Token 실패"); }
}

async function searchTwitch(gameName) {
    if (!twitchToken) await getTwitchToken();
    if (!twitchToken) return null;
    try {
        const res = await axios.get('https://api.twitch.tv/helix/search/categories', {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchToken}` },
            params: { query: gameName, first: 1 }
        });
        const data = res.data?.data?.[0];
        if (data) return { id: data.id, name: data.name, boxArt: data.box_art_url };
    } catch (e) { return null; }
}

async function searchChzzk(gameName) {
    try {
        const encodeName = encodeURIComponent(gameName);
        const url = `https://api.chzzk.naver.com/service/v1/search/lives?keyword=${encodeName}&offset=0&size=20&sortType=POPULAR`;
        const res = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0', ...(CHZZK_CLIENT_ID && { 'Client-Id': CHZZK_CLIENT_ID, 'Client-Secret': CHZZK_CLIENT_SECRET }) }
        });
        const lives = res.data?.content?.data || [];
        if (lives.length === 0) return null;

        const counter = {};
        lives.forEach(item => {
            const cat = item.live?.liveCategoryValue; 
            if (cat) counter[cat] = (counter[cat] || 0) + 1;
        });
        const bestCat = Object.keys(counter).sort((a, b) => counter[b] - counter[a])[0];
        if (bestCat) return { categoryValue: bestCat, posterImageUrl: "" };
    } catch (e) { return null; }
}

async function seedCategories() {
    if (!MONGODB_URI) { console.error("❌ DB URI 없음"); process.exit(1); }
    
    await mongoose.connect(MONGODB_URI);
    console.log("✅ DB 연결됨. 카테고리 매핑 시작...");

    for (const game of TARGET_GAMES) {
        console.log(`\n🔍 매핑 시도: ${game.name} (${game.kor})`);
        
        // 1. 트위치 검색 (영문명 -> 한글명 순서)
        let twitchData = await searchTwitch(game.name);
        if (!twitchData) twitchData = await searchTwitch(game.kor);

        // 2. 치지직 검색 (한글명 -> 영문명 순서)
        let chzzkData = await searchChzzk(game.kor);
        if (!chzzkData) chzzkData = await searchChzzk(game.name);

        // 3. DB 저장 (GameCategory 모델 사용)
        const doc = {
            steamAppId: Number(game.id),
            title: game.name,
            twitch: twitchData || {},
            chzzk: chzzkData || {},
            lastUpdated: new Date()
        };

        // [수정] GameCategory 모델을 사용하여 저장
        await GameCategory.findOneAndUpdate({ steamAppId: game.id }, doc, { upsert: true });
        
        const twLog = twitchData ? `✅ ${twitchData.name} (ID:${twitchData.id})` : "❌ 못 찾음";
        const chLog = chzzkData ? `✅ ${chzzkData.categoryValue}` : "❌ 못 찾음";
        
        console.log(`   💜 Twitch: ${twLog}`);
        console.log(`   💚 Chzzk : ${chLog}`);
        
        await new Promise(r => setTimeout(r, 500));
    }

    console.log("\n🎉 모든 게임 매핑 완료! 이제 수집기를 실행하세요.");
    process.exit(0);
}

seedCategories();