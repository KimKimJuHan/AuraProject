require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('./models/Game');

// 1. 환경변수 검증 및 로드
const { MONGODB_URI, ITAD_API_KEY } = process.env;

// API 키 상태 로그 (보안상 앞 4자리만 출력)
console.log("🔑 ITAD KEY 상태:", ITAD_API_KEY ? `로드됨 (${ITAD_API_KEY.substring(0,4)}****)` : "❌ 없음 (Undefined)");
console.log("💾 DB URI 상태:", MONGODB_URI ? "로드됨" : "❌ 없음");

// 키가 없으면 즉시 종료 (무의미한 요청 방지)
if (!ITAD_API_KEY) {
    console.error("🚨 [치명적 오류] .env 파일에 ITAD_API_KEY가 없습니다. 수집을 중단합니다.");
    process.exit(1);
}

// 딜레이 함수 (API 차단 방지)
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 태그 매핑 (한글화)
const TAG_MAP = {
  'rpg': 'RPG', 'role-playing': 'RPG', 'jrpg': 'RPG', 'action': '액션', 'hack and slash': '액션',
  'fps': 'FPS', 'shooter': 'FPS', 'simulation': '시뮬레이션', 'strategy': '전략', 'rts': '전략',
  'sports': '스포츠', 'racing': '레이싱', 'puzzle': '퍼즐', 'survival': '생존', 'horror': '공포',
  'rhythm': '리듬', 'adventure': '어드벤처', 'open world': '오픈 월드', 'co-op': '협동',
  'multiplayer': '멀티플레이', 'roguelike': '로그라이크', 'souls-like': '소울라이크',
  'story rich': '스토리 중심', 'pixel graphics': '픽셀 그래픽', '2d': '2D', '3d': '3D',
  'anime': '애니메이션', 'scifi': 'SF', 'sci-fi': 'SF', 'fantasy': '판타지'
};

function translateTags(tags) {
    if (!tags || !Array.isArray(tags)) return [];
    const myTags = new Set();
    tags.forEach(t => {
        const lower = t.toLowerCase();
        if (TAG_MAP[lower]) myTags.add(TAG_MAP[lower]);
    });
    return Array.from(myTags);
}

// ---------------------------------------------------------
// [핵심] ITAD 데이터 가져오기 (에러 핸들링 강화)
// ---------------------------------------------------------
async function fetchITADData(steamAppId) {
    try {
        // 1. Lookup: Steam ID -> ITAD UUID 변환
        // axios params 대신 URL에 직접 입력하여 인코딩 이슈 방지
        const lookupUrl = `https://api.isthereanydeal.com/games/lookup/v1?key=${ITAD_API_KEY}&appid=${steamAppId}`;
        const lookupRes = await axios.get(lookupUrl, { timeout: 5000 });
        
        if (!lookupRes.data?.found || !lookupRes.data.game?.id) {
            // console.log(`   ⚠️ ITAD에서 찾을 수 없음: Steam(${steamAppId})`);
            return null;
        }
        const itadUuid = lookupRes.data.game.id;

        // 2. Prices: 가격 정보 조회
        const priceUrl = `https://api.isthereanydeal.com/games/prices/v3?key=${ITAD_API_KEY}&country=KR`;
        const pricesRes = await axios.post(
            priceUrl,
            [itadUuid], 
            { headers: { 'Content-Type': 'application/json' }, timeout: 5000 }
        );

        const gameData = pricesRes.data?.[0];
        if (!gameData) return null;

        const dealsRaw = gameData.deals || [];
        // 가격 낮은 순 정렬
        dealsRaw.sort((a, b) => (a.price.amount - b.price.amount));
        
        const bestDeal = dealsRaw[0] || {};
        const currentPrice = bestDeal.price?.amount ?? 0;
        const regularPrice = bestDeal.regular?.amount ?? 0;

        return {
            current_price: currentPrice,
            regular_price: regularPrice,
            discount_percent: bestDeal.cut ?? 0,
            store_name: bestDeal.shop?.name || "Steam", // 기본값
            url: bestDeal.url || "",
            historical_low: gameData.historyLow?.price?.amount || 0,
            deals: dealsRaw.map(d => ({
                 shopName: d.shop?.name || "Store",
                 price: d.price?.amount ?? 0,
                 regularPrice: d.regular?.amount ?? 0,
                 discount: d.cut ?? 0,
                 url: d.url || ""
            }))
        };
    } catch (e) {
        // 서버가 에러 메시지를 보냈다면 그걸 출력, 아니면 일반 에러 출력
        if (e.response) {
            console.error(`❌ ITAD API Error (AppID:${steamAppId}): ${e.response.status} - ${JSON.stringify(e.response.data)}`);
        } else {
            // console.error(`❌ Network/Parsing Error (AppID:${steamAppId}): ${e.message}`);
        }
        return null; 
    }
}

// ---------------------------------------------------------
// 메인 수집 로직
// ---------------------------------------------------------
async function collectGamesData() {
  if (!MONGODB_URI) return console.error("❌ DB URI가 없습니다.");

  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ DB 연결 성공. 데이터 수집 시작...");

    // 수집할 스팀 게임 ID 목록 (Top 20 예시 - 실제론 더 늘리셔도 됩니다)
    // 팰월드, 배그, 도타2, 카스2, 에이펙스, 나루카, GTA5, 발더스3, 엘든링 등
    const targetAppIds = [
        1623730, 578080, 570, 730, 1172470, 244210, 271590, 1086940, 1245620, 
        292030, 359550, 105600, 413150, 1966720, 230410, 252490, 221100, 440, 550, 945360
    ];

    console.log(`🎯 수집 대상 게임: ${targetAppIds.length}개`);
    let successCount = 0;

    for (const appid of targetAppIds) {
      try {
        await sleep(1500); // 1.5초 대기 (Rate Limit 방지)

        // 1. Steam 상점 정보 가져오기 (한국어, 한국 가격)
        const steamRes = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=korean&cc=kr`);
        
        if (!steamRes.data[appid]?.success) {
            console.log(`⚠️ Steam 정보 없음: ${appid}`);
            continue;
        }
        
        const data = steamRes.data[appid].data;
        if (data.type !== 'game') continue; // DLC 제외

        // 태그 처리
        const steamGenres = data.genres ? data.genres.map(g => g.description) : [];
        const steamCategories = data.categories ? data.categories.map(c => c.description) : [];
        const smartTags = translateTags([...steamGenres, ...steamCategories]);

        // 가격 정보 초기화 (Steam 기준)
        const priceOverview = data.price_overview;
        const isFree = data.is_free === true;
        
        let priceInfo = {
            regular_price: priceOverview ? priceOverview.initial / 100 : 0,
            current_price: priceOverview ? priceOverview.final / 100 : 0,
            discount_percent: priceOverview ? priceOverview.discount_percent : 0,
            store_url: `https://store.steampowered.com/app/${appid}`,
            store_name: 'Steam',
            isFree: isFree,
            deals: [],
            historical_low: 0,
            expiry: null
        };

        // 2. ITAD 가격 비교 정보 가져오기
        const itadData = await fetchITADData(appid);
        
        if (itadData) {
            // ITAD 데이터가 있고, 스팀보다 싸거나 스팀 가격이 없으면 덮어씌움
            if (!isFree && (itadData.current_price < priceInfo.current_price || priceInfo.current_price === 0)) {
                 priceInfo = { ...priceInfo, ...itadData }; // ITAD 최저가로 갱신
            } else {
                 // 스팀이 최저가라도 ITAD의 다른 딜 정보는 가져감
                 priceInfo.deals = itadData.deals;
                 priceInfo.historical_low = itadData.historical_low;
            }
            // console.log(`   💰 ITAD 가격 정보 연동 완료`);
        }

        // 3. DB 저장 객체 생성
        const gameDoc = {
            slug: `steam-${appid}`, // 고유 ID
            steam_appid: appid,
            title: data.name,
            title_ko: data.name, // 스팀은 한글 제목 잘 줌
            main_image: data.header_image,
            description: data.short_description,
            smart_tags: smartTags,
            pc_requirements: {
                minimum: data.pc_requirements?.minimum || "정보 없음",
                recommended: data.pc_requirements?.recommended || "정보 없음"
            },
            price_info: priceInfo,
            releaseDate: data.release_date?.date ? new Date(data.release_date.date) : new Date(),
            screenshots: data.screenshots ? data.screenshots.map(s => s.path_full) : [],
            trailers: data.movies ? data.movies.map(m => m.webm?.max) : [],
            metacritic_score: data.metacritic?.score || 0
        };

        // DB Upsert (있으면 업데이트, 없으면 생성)
        await Game.findOneAndUpdate(
            { steam_appid: appid }, 
            gameDoc, 
            { upsert: true, new: true }
        );

        successCount++;
        console.log(`✅ [${successCount}/${targetAppIds.length}] 저장 완료: ${data.name}`);

      } catch (innerErr) {
        console.error(`❌ 개별 게임 처리 실패 (${appid}): ${innerErr.message}`);
      }
    }

    console.log(`🎉 모든 작업 완료. 총 ${successCount}개 저장됨.`);
    process.exit(0);

  } catch (err) {
    console.error("🚨 시스템 에러:", err);
    process.exit(1);
  }
}

collectGamesData();