// backend/routes/recoRoutes.js

const express = require('express');
const router = express.Router();
const Game = require('../models/Game'); 
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { getQueryTags } = require('../utils/tagMapper');

// 기본 필터: 이미지가 있고, 성인 게임이 아닌 것
const BASE_FILTER = {
    main_image: { $exists: true, $ne: "" }, 
    isAdult: { $ne: true }
};

// 가격 상태 상수 및 가중치 정의
const PRICE_STATUS = {
    PAID: 'PAID',       // 유료
    FREE: 'FREE',       // 무료
    UNKNOWN: 'UNKNOWN'  // 정보 없음
};

const STATUS_WEIGHT = {
    [PRICE_STATUS.PAID]: 0,
    [PRICE_STATUS.FREE]: 1,
    [PRICE_STATUS.UNKNOWN]: 2
};

// 가격 상태 판별 함수
function resolvePriceStatus(priceInfo) {
    if (!priceInfo) return PRICE_STATUS.UNKNOWN;
    
    // 무료이거나 가격이 0원이면 FREE 상태
    if (priceInfo.isFree === true || priceInfo.current_price === 0) return PRICE_STATUS.FREE;
    
    // 가격이 숫자로 존재하면 PAID 상태
    if (typeof priceInfo.current_price === 'number') return PRICE_STATUS.PAID;
    
    return PRICE_STATUS.UNKNOWN;
}

function calculateTagScore(gameTags, userTags) {
    if (!gameTags || !userTags || userTags.length === 0) return 0;
    const gameSet = new Set((gameTags || []).map(t => t.toLowerCase().trim()));
    let matchCount = 0;
    userTags.forEach(tag => {
        const isMatched = Array.from(gameSet).some(gt => gt.includes(tag.toLowerCase()));
        if (isMatched) matchCount++;
    });
    const unionSize = new Set([...gameSet, ...userTags.map(t=>t.toLowerCase())]).size;
    return unionSize === 0 ? 0 : matchCount / unionSize;
}

function formatPrice(priceInfo) {
    const status = resolvePriceStatus(priceInfo);
    if (status === PRICE_STATUS.UNKNOWN) return "가격 정보 없음";
    if (status === PRICE_STATUS.FREE) return "무료";
    return `₩${priceInfo.current_price.toLocaleString()}`;
}

function parsePlaytime(playtimeStr) {
    if (!playtimeStr) return 0;
    const number = parseInt(playtimeStr); 
    return isNaN(number) ? 0 : number;
}

function analyzeUserSteamTags(ownedGames, dbGamesMap) {
    const tagScores = {};
    ownedGames.forEach(og => {
        const dbGame = dbGamesMap[og.appid];
        if (dbGame && dbGame.smart_tags) {
            const minutes = og.playtime_forever || 0;
            if (minutes < 30) return; 
            const weight = Math.log(minutes + 1);
            dbGame.smart_tags.forEach(tag => {
                if (!tagScores[tag]) tagScores[tag] = 0;
                tagScores[tag] += weight;
            });
        }
    });
    return Object.entries(tagScores)
        .sort(([, scoreA], [, scoreB]) => scoreB - scoreA)
        .slice(0, 5) 
        .map(([tag]) => tag);
}

// [참고] priceTierComparator는 '추천 페이지' 등에서 유료->무료->정보없음 순으로 보여줄 때 사용 가능
const priceTierComparator = (a, b) => {
    const statusA = a.sortData.priceStatus;
    const statusB = b.sortData.priceStatus;

    if (STATUS_WEIGHT[statusA] !== STATUS_WEIGHT[statusB]) {
        return STATUS_WEIGHT[statusA] - STATUS_WEIGHT[statusB];
    }
    if (statusA === PRICE_STATUS.PAID) {
        if (a.sortData.rawPrice !== b.sortData.rawPrice) {
            return a.sortData.rawPrice - b.sortData.rawPrice;
        }
    }
    return b.sortData.overall - a.sortData.overall;
};

router.post('/reco', async (req, res) => {
    let { term, liked = [], k = 12 } = req.body; 

    // 필터: 기본 품질 필터만 적용 (가격 필터 제거 -> UNKNOWN도 일단 가져와서 로직으로 처리)
    let filter = {
        $and: [ { ...BASE_FILTER } ]
    };

    let implicitTags = []; 
    let userSteamGames = [];

    const token = req.cookies?.token;
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretKey');
            const user = await User.findById(decoded.id).select('steamGames steamId');
            
            if (user && user.steamGames && user.steamGames.length > 0) {
                userSteamGames = user.steamGames;
                const ownedAppIds = userSteamGames.map(g => g.appid);
                if (ownedAppIds.length > 0) {
                    filter.$and.push({ steam_appid: { $nin: ownedAppIds } });
                }
                const ownedDbGames = await Game.find({ steam_appid: { $in: ownedAppIds } })
                    .select('steam_appid smart_tags')
                    .lean();
                const dbGamesMap = {};
                ownedDbGames.forEach(g => dbGamesMap[g.steam_appid] = g);
                implicitTags = analyzeUserSteamTags(userSteamGames, dbGamesMap);
            }
        } catch (e) {
            console.error("[인증/스팀 DB 조회 에러]", e.message);
        }
    }

    if (term) {
        const q = term.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        filter.$and.push({
            $or: [
                { title: { $regex: q, $options: 'i' } },
                { title_ko: { $regex: q, $options: 'i' } }
            ]
        });
    }

    const finalLikedTags = Array.from(new Set([...liked, ...implicitTags]));

    if (liked.length > 0) {
        liked.forEach(tag => {
            const regexTags = getQueryTags(tag).map(originalRegex => {
                const cleanSource = originalRegex.source.replace('^', '').replace('$', '');
                return new RegExp(cleanSource, 'i');
            });
            const orConditions = regexTags.map(regex => ({ smart_tags: { $regex: regex } }));
            filter.$and.push({ $or: orConditions });
        });
    }

    try {
        console.log(`[추천 API Request] 검색어: "${term || ''}", 선택태그: [${liked.join(', ')}]`);

        const candidates = await Game.find(filter)
            .select('steam_appid title title_ko main_image price_info smart_tags metacritic_score trend_score slug play_time')
            .limit(1000) 
            .lean();
        
        console.log(`[추천 API Result] 후보군 ${candidates.length}개 발견`);

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

            const priceStatus = resolvePriceStatus(game.price_info);
            let finalScore = (tagScore * 0.6) + (trendScore * 0.2) + (metaScore * 0.2);

            // "정보 없음"은 신뢰도가 낮으므로 점수 15% 깎아서 뒤로 보냄
            if (priceStatus === PRICE_STATUS.UNKNOWN) {
                finalScore *= 0.85; 
            }

            return {
                _id: game._id,
                appid: game.steam_appid,
                name: game.title_ko || game.title,
                thumb: game.main_image,
                price: formatPrice(game.price_info),
                playtime: game.play_time || "정보 없음",
                score: Math.round(finalScore * 100),
                sortData: { 
                    overall: finalScore, 
                    trend: trendVal, 
                    tag: tagScore, 
                    playtime: playtimeVal, 
                    meta: game.metacritic_score || 0,
                    priceStatus: priceStatus,
                    rawPrice: game.price_info?.current_price || 0 
                },
                slug: game.slug
            };
        });

        const limit = k * 2; 
        
        // 7. 결과 반환 (각 섹션별 최적화된 정렬 적용)
        res.json({ 
            // 종합 추천: 점수 높은 순
            overall: [...processedGames].sort((a, b) => b.sortData.overall - a.sortData.overall).slice(0, limit),
            
            // 트렌드: 트렌드 점수 순
            trend: [...processedGames].sort((a, b) => b.sortData.trend - a.sortData.trend).slice(0, limit),
            
            // 플레이타임: 긴 순서
            playtime: [...processedGames].sort((a, b) => b.sortData.playtime - a.sortData.playtime).slice(0, limit),
            
            // 태그 관련성: 태그 점수 순
            tag: [...processedGames].sort((a, b) => b.sortData.tag - a.sortData.tag).slice(0, limit),
            
            // [핵심 변경] 가격 합리성 (낮은 가격 탭): 
            // "무료"와 "정보없음"을 완벽히 제거하고, 오직 "유료"만 남겨서 가격 오름차순 정렬
            price: processedGames
                .filter(g => g.sortData.priceStatus === PRICE_STATUS.PAID) // PAID만 남김
                .sort((a, b) => a.sortData.rawPrice - b.sortData.rawPrice) // 가격 싼 순서
                .slice(0, limit),

            validTags: Array.from(validTagsSet) 
        });

    } catch (err) {
        console.error("추천 API 에러:", err);
        res.status(200).json({ 
            overall: [], trend: [], playtime: [], tag: [], price: [], validTags: [] 
        });
    }
});

module.exports = router;