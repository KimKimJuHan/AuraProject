// backend/routes/recoRoutes.js

const express = require('express');
const router = express.Router();
const Game = require('../models/Game'); 

function calculateTagScore(gameTags, userTags) {
    if (!gameTags || !userTags || userTags.length === 0) return 0;
    const gameSet = new Set((gameTags || []).map(t => t.toLowerCase()));
    let matchCount = 0;
    userTags.forEach(tag => { if (gameSet.has(tag.toLowerCase())) matchCount++; });
    const unionSize = new Set([...(gameTags || []), ...userTags]).size;
    return unionSize === 0 ? 0 : matchCount / unionSize;
}

// ★ [핵심] 무료 게임 표기 로직
function formatPrice(priceInfo) {
    if (!priceInfo) return "가격 정보 없음";
    // isFree가 true이거나 가격이 0이면 "무료"
    if (priceInfo.isFree || priceInfo.current_price === 0) return "무료";
    if (priceInfo.current_price !== undefined) return `₩${priceInfo.current_price.toLocaleString()}`;
    return "가격 정보 없음";
}

router.post('/reco', async (req, res) => {
    const { term, liked = [], k = 12, strict = false } = req.body; 

    try {
        let filter = {};

        if (term) {
            const q = term.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            filter.$or = [ { title: { $regex: q, $options: 'i' } }, { title_ko: { $regex: q, $options: 'i' } } ];
        }

        if (strict && liked.length > 0) {
            filter.smart_tags = { $all: liked };
        }

        const candidates = await Game.find(filter)
            .select('steam_appid title title_ko main_image price_info smart_tags metacritic_score trend_score slug play_time')
            .lean();

        const scoredGames = candidates.map(game => {
            let tagScore = liked.length > 0 ? calculateTagScore(game.smart_tags, liked) : 0;
            const trendVal = game.trend_score || 0;
            const trendScore = Math.log10(trendVal + 1) / 5; 
            const metaScore = (game.metacritic_score || 0) / 100;

            const finalScore = (tagScore * 0.6) + (trendScore * 0.2) + (metaScore * 0.2);

            return {
                appid: game.steam_appid,
                name: game.title_ko || game.title,
                thumb: game.main_image,
                price: formatPrice(game.price_info), // 포맷팅 적용
                playtime: game.play_time || "정보 없음",
                score: Math.round(finalScore * 100),
                trend: trendVal,
                slug: game.slug,
                hiddenGem: (game.metacritic_score >= 85 && trendVal < 1000)
            };
        });

        scoredGames.sort((a, b) => b.score - a.score);
        res.json({ items: scoredGames.slice(0, k) });

    } catch (err) {
        console.error("추천 API 에러:", err);
        res.status(500).json({ error: "데이터 조회 실패" });
    }
});

module.exports = router;