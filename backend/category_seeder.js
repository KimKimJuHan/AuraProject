require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const GameCategory = require('./models/GameCategory');

const { MONGODB_URI, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, CHZZK_CLIENT_ID, CHZZK_CLIENT_SECRET } = process.env;

// 수집할 게임 목록 (스팀ID: 검색어)
const TARGET_GAMES = {
    1623730: { name: "Palworld", kor: "팰월드" },
    578080: { name: "PUBG: BATTLEGROUNDS", kor: "배틀그라운드" },
    570: { name: "Dota 2", kor: "도타 2" },
    730: { name: "Counter-Strike 2", kor: "카운터 스트라이크 2" },
    271590: { name: "Grand Theft Auto V", kor: "GTA 5" }, // 치지직용 이름
    359550: { name: "Tom Clancy's Rainbow Six Siege", kor: "레인보우 식스 시즈" },
    21779: { name: "League of Legends", kor: "리그 오브 레전드" }, // 스팀엔 없지만 예시
    1086940: { name: "Baldur's Gate 3", kor: "발더스 게이트 3" },
    1245620: { name: "ELDEN RING", kor: "엘든 링" },
    292030: { name: "The Witcher 3: Wild Hunt", kor: "더 위쳐 3: 와일드 헌트" },
    1172470: { name: "Apex Legends", kor: "에이펙스 레전드" },
    105600: { name: "Terraria", kor: "테라리아" },
    413150: { name: "Stardew Valley", kor: "스타듀 밸리" },
    1966720: { name: "Lethal Company", kor: "리썰 컴퍼니" },
    230410: { name: "Warframe", kor: "워프레임" },
    252490: { name: "Rust", kor: "러스트" },
    221100: { name: "DayZ", kor: "데이즈" },
    440: { name: "Team Fortress 2", kor: "팀 포트리스 2" },
    550: { name: "Left 4 Dead 2", kor: "레프트 4 데드 2" },
    945360: { name: "Among Us", kor: "어몽어스" }
};

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
        // 1. 공개 검색 API 사용 (방송 검색이 더 정확함)
        const encodeName = encodeURIComponent(gameName);
        const url = `https://api.chzzk.naver.com/service/v1/search/lives?keyword=${encodeName}&offset=0&size=10&sortType=POPULAR`;
        
        const res = await axios.get(url, {
            headers: { 
                'User-Agent': 'Mozilla/5.0',
                ...(CHZZK_CLIENT_ID && { 'Client-Id': CHZZK_CLIENT_ID, 'Client-Secret': CHZZK_CLIENT_SECRET })
            }
        });

        const lives = res.data?.content?.data || [];
        if (lives.length === 0) return null;

        // 가장 많이 등장한 카테고리 찾기 (통계적 접근)
        const counter = {};
        lives.forEach(live => {
            const cat = live.live?.liveCategoryValue;
            if (cat) counter[cat] = (counter[cat] || 0) + 1;
        });

        // 빈도수 1등 리턴
        const bestCat = Object.keys(counter).sort((a, b) => counter[b] - counter[a])[0];
        if (bestCat) return { categoryValue: bestCat, posterImageUrl: "" }; // 포스터는 일단 생략

    } catch (e) { return null; }
}

async function seedCategories() {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ DB 연결됨. 카테고리 매핑 시작...");

    for (const [steamId, info] of Object.entries(TARGET_GAMES)) {
        console.log(`\n🔍 처리 중: ${info.name} (${info.kor})`);
        
        // 1. 트위치 검색 (영문명 우선)
        let twitchData = await searchTwitch(info.name);
        if (!twitchData) twitchData = await searchTwitch(info.kor); // 실패시 한글 검색

        // 2. 치지직 검색 (한글명 우선)
        let chzzkData = await searchChzzk(info.kor);
        if (!chzzkData) chzzkData = await searchChzzk(info.name); // 실패시 영문 검색

        // 3. DB 저장
        const doc = {
            steamAppId: Number(steamId),
            title: info.name,
            twitch: twitchData || {},
            chzzk: chzzkData || {},
            lastUpdated: new Date()
        };

        await GameCategory.findOneAndUpdate({ steamAppId: steamId }, doc, { upsert: true });
        
        console.log(`   💜 Twitch: ${twitchData ? twitchData.name : "❌ 실패"}`);
        console.log(`   💚 Chzzk : ${chzzkData ? chzzkData.categoryValue : "❌ 실패"}`);
        
        // 딜레이 (중요!)
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log("\n🎉 매핑 완료!");
    process.exit(0);
}

seedCategories();