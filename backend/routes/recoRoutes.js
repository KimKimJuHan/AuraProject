const express = require('express');
const router = express.Router();
const Game = require('../models/Game'); // 수집된 데이터 모델
const User = require('../models/User');

// 태그 유사도 계산 함수 (Jaccard Similarity)
function calculateTagScore(gameTags, userTags) {
    if (!gameTags || !userTags || userTags.length === 0) return 0;
    
    const gameSet = new Set(gameTags);
    let matchCount = 0;
    
    userTags.forEach(tag => {
        if (gameSet.has(tag)) matchCount++;
    });

    // 합집합 크기 = (게임 태그 수 + 유저 태그 수) - 교집합 수
    const unionSize = gameSet.size + userTags.length - matchCount;
    return unionSize === 0 ? 0 : matchCount / unionSize;
}

// 추천 API
// 프론트엔드에서 /api/steam/reco 로 호출하므로 경로를 '/reco'로 설정
router.post('/reco', async (req, res) => {
    const { term, liked, k = 12 } = req.body; // term: 검색어, liked: 선택 태그 배열

    try {
        let filter = {};

        // 1. 검색어 필터
        if (term) {
            const q = term.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            filter.$or = [
                { title: { $regex: q, $options: 'i' } },
                { title_ko: { $regex: q, $options: 'i' } }
            ];
        }

        // 2. 전체 게임 가져오기 (필터링은 메모리에서 정교하게 수행)
        // 데이터가 아주 많아지면 DB 쿼리로 최적화해야 하지만, 수백~수천 개 수준이면 메모리가 더 빠름
        let candidates = await Game.find(filter).lean();

        // 3. 점수 계산 및 정렬
        const scoredGames = candidates.map(game => {
            // 태그 점수 (60%)
            const tagScore = calculateTagScore(game.smart_tags, liked);
            
            // 트렌드 점수 (20%) - 로그 스케일 정규화
            const trendVal = game.trend_score || 0;
            const trendScore = Math.log10(trendVal + 1) / 5; // 대략 0~1 사이 값으로 조정

            // 평점 점수 (20%)
            const metaScore = (game.metacritic_score || 0) / 100;

            // 최종 점수
            const finalScore = (tagScore * 0.6) + (trendScore * 0.2) + (metaScore * 0.2);

            return {
                appid: game.steam_appid,
                name: game.title_ko || game.title,
                thumb: game.main_image,
                price: game.price_info?.current_price > 0 
                        ? `₩${game.price_info.current_price.toLocaleString()}` 
                        : (game.price_info?.isFree ? "무료" : "가격 정보 없음"),
                score: Math.round(finalScore * 100), // 0~100점
                trend: trendVal,
                slug: game.slug,
                hiddenGem: (game.metacritic_score >= 85 && trendVal < 1000) // 숨은 명작 조건
            };
        });

        // 점수 높은 순 정렬
        scoredGames.sort((a, b) => b.score - a.score);

        // 상위 k개 반환
        res.json({ items: scoredGames.slice(0, k) });

    } catch (err) {
        console.error("추천 API 에러:", err);
        res.status(500).json({ error: "추천 실패" });
    }
});

module.exports = router;