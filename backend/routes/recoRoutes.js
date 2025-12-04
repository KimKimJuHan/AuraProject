// backend/routes/recoRoutes.js

const express = require('express');
const router = express.Router();
const Game = require('../models/Game'); 
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { getQueryTags } = require('../utils/tagMapper');

const STEAM_API_KEY = process.env.STEAM_WEB_API_KEY || process.env.STEAM_API_KEY;

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

function analyzeUserSteamTags(ownedGames, dbGamesMap) {
    const tagScores = {};
    let analyzedCount = 0;

    ownedGames.forEach(og => {
        const dbGame = dbGamesMap[og.appid];
        if (dbGame && dbGame.smart_tags) {
            const minutes = og.playtime_forever || 0;
            if (minutes < 30) return;

            analyzedCount++;
            const weight = Math.log(minutes + 1);

            dbGame.smart_tags.forEach(tag => {
                if (!tagScores[tag]) tagScores[tag] = 0;
                tagScores[tag] += weight;
            });
        }
    });
    console.log(`[AI 분석] DB와 매칭되어 분석된 게임 수: ${analyzedCount}개`);

    return Object.entries(tagScores)
        .sort(([, scoreA], [, scoreB]) => scoreB - scoreA)
        .slice(0, 5) 
        .map(([tag]) => tag);
}

router.post('/reco', async (req, res) => {
    let { term, liked = [], k = 12 } = req.body; 

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
        // ★ [핵심] 기본 필터에 성인 게임 제외 추가
        let filter = { isAdult: { $ne: true } };
        let implicitTags = []; 

        if (userSteamId && STEAM_API_KEY) {
            try {
                const steamRes = await axios.get("http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/", {
                    params: { 
                        key: STEAM_API_KEY, 
                        steamid: userSteamId, 
                        include_played_free_games: true, 
                        format: 'json' 
                    },
                    timeout: 5000 
                });
                const ownedGames = steamRes.data?.response?.games || [];
                const ownedAppIds = ownedGames.map(g => g.appid);
                
                if (ownedAppIds.length > 0) {
                    // $nin과 isAdult 조건을 함께 사용
                    filter.steam_appid = { $nin: ownedAppIds };
                    console.log(`[추천 필터] 사용자 보유 게임 ${ownedAppIds.length}개 제외 처리됨`);
                }

                if (ownedGames.length > 0) {
                    const ownedDbGames = await Game.find({ steam_appid: { $in: ownedAppIds } })
                        .select('steam_appid smart_tags')
                        .lean();
                    
                    const dbGamesMap = {};
                    ownedDbGames.forEach(g => dbGamesMap[g.steam_appid] = g);

                    implicitTags = analyzeUserSteamTags(ownedGames, dbGamesMap);
                }

            } catch (steamErr) { console.error("[스팀 연동 에러]", steamErr.message); }
        }

        const finalLikedTags = Array.from(new Set([...liked, ...implicitTags]));

        if (term) {
            const q = term.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            filter.$or = [{ title: { $regex: q, $options: 'i' } }, { title_ko: { $regex: q, $options: 'i' } }];
        }

        if (liked.length > 0) {
            const andConditions = liked.map(tag => {
                const regexTags = getQueryTags(tag);
                return { smart_tags: { $in: regexTags } };
            });
            filter.$and = andConditions;
        } else if (implicitTags.length > 0) {
            const expandedTags = implicitTags.flatMap(t => getQueryTags(t));
            // 기존 filter에 조건 추가 (덮어쓰기 주의)
            filter.smart_tags = { $in: expandedTags };
        }

        const candidates = await Game.find(filter)
            .select('steam_appid title title_ko main_image price_info smart_tags metacritic_score trend_score slug play_time')
            .limit(1000) 
            .lean();

        const validTagsSet = new Set();
        candidates.forEach(g => {
            if (g.smart_tags) g.smart_tags.forEach(t => validTagsSet.add(t));
        });

        const processedGames = candidates.map(game => {
            const tagScore = calculateTagScore(game.smart_tags, finalLikedTags);
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

        const limit = k * 2; 
        const overall = [...processedGames].sort((a, b) => b.sortData.overall - a.sortData.overall).slice(0, limit);
        const trend = [...processedGames].sort((a, b) => b.sortData.trend - a.sortData.trend).slice(0, limit);
        const playtime = [...processedGames].sort((a, b) => b.sortData.playtime - a.sortData.playtime).slice(0, limit);
        const tag = [...processedGames].sort((a, b) => b.sortData.tag - a.sortData.tag).slice(0, limit);

        res.json({ overall, trend, playtime, tag, validTags: Array.from(validTagsSet) });

    } catch (err) {
        console.error("추천 API 에러:", err);
        res.status(500).json({ error: "데이터 조회 실패" });
    }
});

module.exports = router;