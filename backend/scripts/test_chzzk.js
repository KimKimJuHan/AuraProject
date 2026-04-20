const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const axios = require('axios');

const { CHZZK_CLIENT_ID, CHZZK_CLIENT_SECRET } = process.env;

function getSimilarity(s1, s2) {
    let longer = s1; let shorter = s2;
    if (s1.length < s2.length) { longer = s2; shorter = s1; }
    const longerLength = longer.length;
    if (longerLength === 0) return 1.0;
    const costs = new Array();
    for (let i = 0; i <= longer.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= shorter.length; j++) {
            if (i == 0) costs[j] = j;
            else {
                if (j > 0) {
                    let newValue = costs[j - 1];
                    if (longer.charAt(i - 1) != shorter.charAt(j - 1))
                        newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                    costs[j - 1] = lastValue; lastValue = newValue;
                }
            }
        }
        if (i > 0) costs[shorter.length] = lastValue;
    }
    return (longerLength - costs[shorter.length]) / parseFloat(longerLength);
}

function getCoreKeyword(text) {
    if (!text) return "";
    let core = text.replace(/[™®©]/g, '');
    if (core.includes(':')) core = core.split(':')[0];
    core = core.replace(/\s+(I|II|III|IV|V|VI|VII|VIII|IX|X|\d+)$/i, '');
    core = core.replace(/(\d+)$/, '');
    return core.trim();
}

const TEST_GAMES = [
    { title: "DARK SOULS™ III", title_ko: "다크 소울 3" }, 
    { title: "Factorio", title_ko: "팩토리오" },
    { title: "Sid Meier’s Civilization® VI", title_ko: "문명 6" }
];

async function runMatchTest() {
    console.log("==================================================");
    console.log("🚀 DB title_ko 수정 시뮬레이션 및 적발 테스트 (타임아웃 우회)");
    console.log("==================================================\n");

    for (const game of TEST_GAMES) {
        let totalViewers = 0;

        const koCore = getCoreKeyword(game.title_ko);
        const enCore = getCoreKeyword(game.title);
        const searchQuery = koCore || enCore;

        try {
            console.log(`🎯 [타겟] DB명: ${game.title} / 한글명: ${game.title_ko}`);
            console.log(` 🔍 치지직 광역 검색어: "${searchQuery}"`);
            
            // ★ 타임아웃 10초(10000ms)로 연장
            const res = await axios.get(`https://api.chzzk.naver.com/service/v1/search/lives?keyword=${encodeURIComponent(searchQuery)}&offset=0&size=50&sortType=POPULAR`, {
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Client-Id': CHZZK_CLIENT_ID, 
                    'Client-Secret': CHZZK_CLIENT_SECRET 
                }, 
                timeout: 10000
            });

            const lives = res.data?.content?.data || [];

            if (lives.length > 0) {
                console.log(`    📥 검색 결과: ${lives.length}개 방송 발견.`);
                
                const normalize = (str) => str.replace(/[^a-zA-Z0-9가-힣]/g, '').toLowerCase();
                const targetEng = normalize(game.title.replace(/[™®©]/g, '')); 
                const targetKor = normalize((game.title_ko || "").replace(/[™®©]/g, ''));

                lives.forEach((item, idx) => {
                    const live = item.live;
                    if (!live) return;
                    
                    const categoryValue = live.liveCategoryValue || '';
                    const normalizedCat = normalize(categoryValue);
                    
                    let isMatch = false;
                    let matchReason = "";
                    
                    if (targetKor && targetKor.length > 1 && normalizedCat.includes(targetKor)) { isMatch = true; matchReason = "한글 완벽 포함"; }
                    else if (targetEng && targetEng.length > 2 && normalizedCat.includes(targetEng)) { isMatch = true; matchReason = "영문 완벽 포함"; }

                    if (!isMatch) {
                        const simKor = targetKor ? getSimilarity(targetKor, normalizedCat) : 0;
                        const simEng = targetEng ? getSimilarity(targetEng, normalizedCat) : 0;
                        if (simKor >= 0.70) { isMatch = true; matchReason = `한글 유사도 ${(simKor*100).toFixed(1)}%`; } 
                        else if (simEng >= 0.70) { isMatch = true; matchReason = `영문 유사도 ${(simEng*100).toFixed(1)}%`; }
                    }

                    if (isMatch) {
                        totalViewers += live.concurrentUserCount || 0;
                        console.log(`      ✔️ [저격 성공] 시청자: ${String(live.concurrentUserCount).padStart(4, ' ')}명 | 사유: [${matchReason}] 방송 카테고리: ${categoryValue}`);
                    }
                });
                
                console.log(`    ✅ 최종 합산: 💚 ${totalViewers.toLocaleString()}명\n`);
            } else {
                console.log(`    ❌ 검색 결과 0개.\n`);
            }
        } catch (e) {
            console.log(`    ⚠️ 통신 에러: ${e.message}\n`);
        }
        // ★ 트래픽 제한 방어를 위해 대기 시간을 2초로 증가
        await new Promise(r => setTimeout(r, 2000));
    }
}

runMatchTest();