require('dotenv').config();
const axios = require('axios');

const { ITAD_API_KEY } = process.env;

if (!ITAD_API_KEY) {
    console.error("🚨 ITAD_API_KEY가 없습니다. .env 파일을 확인하세요.");
    process.exit(1);
}

// 테스트할 스팀 AppID 목록 (문제의 GTA 5 포함)
const TEST_APPS = [
    { id: 271590, name: "Grand Theft Auto V" },
    { id: 1086940, name: "Baldur's Gate 3" },
    { id: 1623730, name: "Palworld" }
];

// 딜레이 함수
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function testPriceCollection() {
    console.log("💰 가격 데이터 수집 테스트 (헤더 추가됨)...\n");

    for (const game of TEST_APPS) {
        console.log(`🔍 [${game.name} (AppID: ${game.id})] 분석 중...`);

        // 1. Steam 상점 데이터 조회 (헤더 추가로 차단 우회 시도)
        console.log("   📡 Steam API 호출...");
        try {
            const steamRes = await axios.get(`https://store.steampowered.com/api/appdetails`, {
                params: { appids: game.id, l: 'korean', cc: 'kr' },
                headers: {
                    // 브라우저인 척 속이는 헤더 (403 차단 방지)
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 10000
            });
            
            const steamData = steamRes.data[game.id]?.data;

            if (steamData) {
                console.log(`      ✅ Steam 응답 성공: ${steamData.name}`);
                console.log(`      - 무료 여부: ${steamData.is_free}`);
                
                if (steamData.price_overview) {
                    console.log(`      - 가격: ${steamData.price_overview.final / 100}원 (${steamData.price_overview.discount_percent}% 할인)`);
                } else if (steamData.packages) {
                    console.log(`      - ⚠️ 단품 가격 없음. 패키지 ID: ${steamData.packages.join(', ')}`);
                } else {
                    console.log("      - ⚠️ 가격 정보 아예 없음 (지역 제한 가능성)");
                }
            } else {
                console.log("      - ❌ Steam 데이터 조회 실패 (데이터 없음)");
            }
        } catch (e) {
            console.log(`      - ❌ Steam API 에러: ${e.message}`);
        }

        // 2. ITAD 데이터 조회
        console.log("   📡 ITAD API 호출...");
        try {
            // Lookup
            const lookupUrl = `https://api.isthereanydeal.com/games/lookup/v1?key=${ITAD_API_KEY}&appid=${game.id}`;
            const lookupRes = await axios.get(lookupUrl);
            
            if (lookupRes.data?.found && lookupRes.data.game?.id) {
                const itadUuid = lookupRes.data.game.id;
                console.log(`      ✅ ITAD UUID: ${itadUuid}`);

                // Prices
                const priceUrl = `https://api.isthereanydeal.com/games/prices/v3?key=${ITAD_API_KEY}&country=KR`;
                const pricesRes = await axios.post(priceUrl, [itadUuid], { headers: { 'Content-Type': 'application/json' } });
                
                const deals = pricesRes.data?.[0]?.deals || [];
                if (deals.length > 0) {
                    console.log(`      - 🔥 딜 발견: ${deals.length}개`);
                    console.log(`        최저가: ${deals[0].price.amount}원 (${deals[0].shop.name})`);
                } else {
                    console.log("      - ⚠️ 현재 판매 중인 딜 없음 (KR 지역)");
                }
            } else {
                console.log("      - ⚠️ ITAD 매핑 실패");
            }
        } catch (e) {
            console.log(`      - ❌ ITAD API 에러: ${e.message}`);
        }

        console.log("-".repeat(40) + "\n");
        await sleep(1500); // 1.5초 쉬었다가 다음 게임 조회
    }
}

testPriceCollection();