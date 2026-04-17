const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const axios = require('axios');

const { CHZZK_CLIENT_ID, CHZZK_CLIENT_SECRET } = process.env;

if (!CHZZK_CLIENT_ID) {
    console.error("❌ CHZZK_CLIENT_ID 환경변수가 없습니다.");
    process.exit(1);
}

// 스팀에서 가져오는 데이터 형태를 시뮬레이션 (영문 원본 + 한글 번역본)
const TEST_GAMES = [
    { eng: "League of Legends", kor: "리그 오브 레전드" },
    { eng: "Stardew Valley", kor: "스타듀 밸리" },
    { eng: "ELDEN RING", kor: "엘든 링" },
    { eng: "Grand Theft Auto V", kor: "" }, // 한글명이 없는 경우
    { eng: "Counter-Strike 2", kor: "카운터-스트라이크 2" }
];

async function runMatchTest() {
    console.log("==================================================");
    console.log("🚀 치지직 Open API 정밀 매칭 알고리즘 테스트 시작");
    console.log("==================================================\n");

    for (const game of TEST_GAMES) {
        console.log(`🎯 타겟 게임: [${game.eng}] (한글: ${game.kor || '없음'})`);

        // 검색 전략: 1순위 한글명, 2순위 영문명, 3순위 특수문자 제거 영문
        const cleanEng = game.eng.replace(/[-:™®©]/g, ' ').trim();
        const searchQueries = [game.kor, game.eng, cleanEng].filter(q => q && q.length > 1);
        const uniqueQueries = [...new Set(searchQueries)];

        let finalMatch = null;

        for (const query of uniqueQueries) {
            console.log(` 🔍 검색 시도: "${query}"`);
            try {
                const res = await axios.get(`https://openapi.chzzk.naver.com/open/v1/categories/search?query=${encodeURIComponent(query)}`, {
                    headers: { 'Client-Id': CHZZK_CLIENT_ID, 'Client-Secret': CHZZK_CLIENT_SECRET },
                    timeout: 3000
                });

                // 치지직 반환 배열 전체 확보
                const results = res.data?.content?.data || res.data?.data || [];

                if (results.length > 0) {
                    console.log(`    📥 반환된 데이터 (${results.length}개):`);
                    results.slice(0, 5).forEach((r, idx) => {
                        console.log(`      [${idx}] ${r.categoryValue}`);
                    });

                    // ★ 알고리즘 1: 완벽 일치 (Exact Match) 탐색 - 대소문자 및 띄어쓰기 무시
                    const normalize = (str) => str.replace(/\s+/g, '').toLowerCase();
                    
                    const exactMatch = results.find(r => 
                        normalize(r.categoryValue) === normalize(game.kor || "") || 
                        normalize(r.categoryValue) === normalize(game.eng) ||
                        normalize(r.categoryValue) === normalize(cleanEng)
                    );

                    if (exactMatch) {
                        console.log(`    ✅ [지능형 매칭 성공] 무지성 data[0]이 아닌 정확한 대상을 찾았습니다 -> 💚 ${exactMatch.categoryValue}`);
                        finalMatch = exactMatch.categoryValue;
                        break; // 찾았으니 다음 검색어로 넘어가지 않고 종료
                    } else {
                        // 완벽 일치가 없으면 일단 배열의 첫 번째 값을 후보로 두고 다른 검색어 시도
                        console.log(`    ⚠️ 완벽 일치 항목 없음. (data[0]을 후보로 보류: ${results[0].categoryValue})`);
                        if (!finalMatch) finalMatch = results[0].categoryValue; // Fallback
                    }
                } else {
                    console.log(`    ❌ 검색 결과 없음`);
                }
            } catch (e) {
                console.log(`    ⚠️ API 에러: ${e.response?.status} ${e.message}`);
            }
            await new Promise(r => setTimeout(r, 500));
        }

        if (finalMatch) {
            console.log(`\n 🏁 최종 확정 슬러그: 💚 ${finalMatch}\n`);
        } else {
            console.log(`\n 🏁 최종 확정 슬러그: ❌ 매핑 불가 (DB에 없음)\n`);
        }
        console.log(`--------------------------------------------------`);
    }
}

runMatchTest();