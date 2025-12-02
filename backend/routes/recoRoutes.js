// backend/routes/recoRoutes.js

const express = require('express');
const router = express.Router();
const Game = require('../models/Game'); 
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { getQueryTags } = require('../utils/tagMapper'); // ★ 태그 매퍼 연결

const STEAM_API_KEY = process.env.STEAM_WEB_API_KEY || process.env.STEAM_API_KEY;

// 태그 유사도 계산
function calculateTagScore(gameTags, userTags) {
    if (!gameTags || !userTags || userTags.length === 0) return 0;
    const gameSet = new Set((gameTags || []).map(t => t.toLowerCase().trim()));
    
    let matchCount = 0;
    userTags.forEach(tag => {
        if (gameSet.has(tag.toLowerCase())) matchCount++;
    });
    const unionSize = new Set([...gameSet, ...userTags]).size;
    return unionSize === 0 ? 0 : matchCount / unionSize;
}

function formatPrice(priceInfo) {
    if (!priceInfo) return "가격 정보 없음";
    if (priceInfo.isFree || priceInfo.current_price === 0) return "무료";
    if (priceInfo.current_price) return `₩${priceInfo.current_price.toLocaleString()}`;
    return "가격 정보 없음";
}

function parsePlaytime(playtimeStr) {
    if (!playtimeStr) return 0;
    const number = parseInt(playtimeStr); 
    return isNaN(number) ? 0 : number;
}

router.post('/reco', async (req, res) => {
    const { term, liked = [], k = 12 } = req.body; 

    // 1. 사용자 토큰 확인 (로그인 여부 및 스팀ID 확인)
    let userSteamId = null;
    const token = req.cookies?.token;
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretKey');
            const user = await User.findById(decoded.id);
            if (user && user.steamId) userSteamId = user.steamId;
        } catch (e) {}
    }

    try {
        let filter = {};

        // 2. 보유 게임 제외 ($nin)
        if (userSteamId && STEAM_API_KEY) {
            try {
                const steamRes = await axios.get("http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/", {
                    params: { key: STEAM_API_KEY, steamid: userSteamId, format: 'json' },
                    timeout: 2000
                });
                const ownedGames = steamRes.data?.response?.games || [];
                const ownedAppIds = ownedGames.map(g => g.appid);
                if (ownedAppIds.length > 0) {
                    filter.steam_appid = { $nin: ownedAppIds };
                }
            } catch (steamErr) {
                console.error("[스팀 연동 에러]", steamErr.message);
            }
        }

        // 3. 검색어 필터
        if (term) {
            const q = term.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            filter.$or = [{ title: { $regex: q, $options: 'i' } }, { title_ko: { $regex: q, $options: 'i' } }];
        }

        // 4. 태그 필터 (AND 조건 - 교집합 검색)
        if (liked && liked.length > 0) {
            const andConditions = liked.map(tag => {
                const regexTags = getQueryTags(tag);
                return { smart_tags: { $in: regexTags } };
            });
            filter.$and = andConditions;
        }

        // 5. DB 조회
        const candidates = await Game.find(filter)
            .select('steam_appid title title_ko main_image price_info smart_tags metacritic_score trend_score slug play_time')
            .limit(1000) 
            .lean();

        // ★ 유효 태그 목록 추출 (동적 비활성화용)
        const validTagsSet = new Set();
        candidates.forEach(game => {
            if (game.smart_tags) {
                game.smart_tags.forEach(tag => validTagsSet.add(tag));
            }
        });
        const validTags = Array.from(validTagsSet);

        // 6. 점수 계산
        const processedGames = candidates.map(game => {
            const tagScore = calculateTagScore(game.smart_tags, liked);
            const trendVal = game.trend_score || 0;
            const trendScore = Math.log10(trendVal + 1) / 5; 
            const metaScore = (game.metacritic_score || 0) / 100; 
            const playtimeVal = parsePlaytime(game.play_time);

            const finalScore = (tagScore * 0.5) + (trendScore * 0.3) + (metaScore * 0.2);

            return {
                _id: game._id,
                appid: game.steam_appid,
                name: game.title_ko || game.title,
                thumb: game.main_image,
                price: formatPrice(game.price_info),
                playtime: game.play_time || "정보 없음",
                score: Math.round(finalScore * 100),
                sortData: { overall: finalScore, trend: trendVal, tag: tagScore, playtime: playtimeVal, meta: game.metacritic_score || 0 },
                slug: game.slug
            };
        });

        // 7. 4가지 카테고리로 정렬 및 추출
        const limit = k * 2; 
        const overall = [...processedGames].sort((a, b) => b.sortData.overall - a.sortData.overall).slice(0, limit);
        const trend = [...processedGames].sort((a, b) => b.sortData.trend - a.sortData.trend).slice(0, limit);
        const playtime = [...processedGames].sort((a, b) => b.sortData.playtime - a.sortData.playtime).slice(0, limit);
        const tag = [...processedGames].sort((a, b) => b.sortData.tag - a.sortData.tag).slice(0, limit);

        // ★ validTags 포함해서 반환
        res.json({ overall, trend, playtime, tag, validTags });

    } catch (err) {
        console.error("추천 API 에러:", err);
        res.status(500).json({ error: "데이터 조회 실패" });
    }
});

module.exports = router;