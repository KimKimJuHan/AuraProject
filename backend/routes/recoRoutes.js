// backend/routes/recoRoutes.js

const express = require('express');
const router = express.Router();
const Game = require('../models/Game'); // ★ DB 모델 연결

// 태그 유사도 계산
function calculateTagScore(gameTags, userTags) {
    if (!gameTags || !userTags || userTags.length === 0) return 0;
    const gameSet = new Set(gameTags.map(t => t.toLowerCase()));
    let matchCount = 0;
    userTags.forEach(tag => {
        if (gameSet.has(tag.toLowerCase())) matchCount++;
    });
    const unionSize = new Set([...gameTags, ...userTags]).size;
    return unionSize === 0 ? 0 : matchCount / unionSize;
}

// 가격 포맷팅
function formatPrice(priceInfo) {
    if (priceInfo?.isFree) return "무료";
    if (priceInfo?.current_price !== undefined) {
        return `₩${priceInfo.current_price.toLocaleString()}`;
    }
    return "가격 정보 없음";
}

// 추천 API
router.post('/reco', async (req, res) => {
    const { term, liked = [], k = 12, strict = false } = req.body; 

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

        // 2. 태그 필터 (엄격 모드일 때만 필수, 아니면 가산점)
        if (strict && liked.length > 0) {
            filter.smart_tags = { $all: liked };
        }

        // 3. DB 조회 (모든 게임 후보 가져오기)
        const candidates = await Game.find(filter)
            .select('steam_appid title title_ko main_image price_info smart_tags metacritic_score trend_score slug play_time')
            .lean();

        // 4. 점수 계산
        const scoredGames = candidates.map(game => {
            // A. 태그 점수 (0~1)
            let tagScore = 0;
            if (liked.length > 0) {
                tagScore = calculateTagScore(game.smart_tags, liked);
            } else {
                // 태그 선택 안 했으면 0점 처리 (트렌드 점수로만 정렬됨)
                tagScore = 0; 
            }
            
            // B. 트렌드 점수 (로그 스케일 정규화 0~1)
            // trend_score가 높을수록 상단 노출
            const trendVal = game.trend_score || 0;
            const trendScore = Math.log10(trendVal + 1) / 5; 

            // C. 평점 점수 (0~1)
            const metaScore = (game.metacritic_score || 0) / 100;

            // D. 최종 점수 합산 (태그 50% + 트렌드 30% + 평점 20%)
            // 태그를 선택 안 했으면 트렌드 비중이 자연스럽게 높아짐
            const finalScore = (tagScore * 0.5) + (trendScore * 0.3) + (metaScore * 0.2);

            return {
                appid: game.steam_appid,
                name: game.title_ko || game.title,
                thumb: game.main_image,
                price: formatPrice(game.price_info),
                playtime: game.play_time || "정보 없음",
                score: Math.round(finalScore * 100),
                trend: trendVal,
                slug: game.slug,
                hiddenGem: (game.metacritic_score >= 85 && trendVal < 1000)
            };
        });

        // 5. 정렬 (점수 높은 순)
        scoredGames.sort((a, b) => b.score - a.score);
        
        // 6. 상위 k개 반환
        res.json({ items: scoredGames.slice(0, k) });

    } catch (err) {
        console.error("추천 API 에러:", err);
        res.status(500).json({ error: "데이터 조회 실패" });
    }
});

module.exports = router;