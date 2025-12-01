// backend/scripts/test_trailer.js
const axios = require('axios');

async function testTrailerFetch() {
    // 테스트 대상: Divinity: Original Sin 2 (로그에서 Trailer=0개 였던 게임)
    const appId = 435150; 
    
    console.log(`🔍 [테스트] AppID ${appId} 트레일러 데이터 구조 확인 시작...`);

    try {
        // 스팀 API 호출
        const res = await axios.get(`https://store.steampowered.com/api/appdetails`, {
            params: { appids: appId, l: 'korean', cc: 'kr' }
        });

        const data = res.data[appId].data;

        if (!data) {
            console.log("❌ 데이터 없음 (API 호출 실패 또는 차단됨)");
            return;
        }

        console.log(`✅ 게임명: ${data.name}`);
        
        // 영화 데이터 확인
        if (data.movies) {
            console.log(`🎞️ 발견된 영화 개수: ${data.movies.length}개`);
            
            // 첫 번째 영화 데이터의 '구조'를 있는 그대로 출력
            console.log("\n👇 [중요] 첫 번째 영화 데이터 원본 구조 (이걸 보고 코드를 고쳐야 함):");
            console.log(JSON.stringify(data.movies[0], null, 2));

            // 현재 수집기 로직으로 추출 시도
            const currentLogicResult = data.movies.map(m => {
                if (m.mp4) return m.mp4['480'] || m.mp4.max;
                if (m.webm) return m.webm['480'] || m.webm.max;
                return null;
            }).filter(url => url);

            console.log(`\n🧐 현재 로직 추출 결과: ${currentLogicResult.length}개 발견`);
            if(currentLogicResult.length === 0) console.log("   -> ❌ 현재 로직이 실패했습니다.");
            else console.log("   -> ✅ 성공 URL:", currentLogicResult);

        } else {
            console.log("❌ 'movies' 항목이 아예 없습니다.");
        }

    } catch (e) {
        console.error("❌ 에러 발생:", e.message);
    }
}

testTrailerFetch();