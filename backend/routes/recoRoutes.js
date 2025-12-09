const express = require('express');
const router = express.Router();
const Game = require('../models/Game');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
// tagMapper가 없다면 빈 배열 반환하도록 방어 코드 적용 가능하지만, 
// 인수인계서에 따라 utils 폴더에 있다고 가정합니다.
const { getQueryTags } = require('../utils/tagMapper'); 

/* ========================================================================
    [Core Logic] 품질 필터 정의 (Quality Filter)
    - 데이터가 부실한 게임(가격 없음, 이미지 없음, 플레이타임 누락)을 
      모든 조회 로직에서 원천적으로 배제합니다.
    ========================================================================
*/
const QUALITY_FILTER = {
    // 1. 플레이 타임: "정보 없음"이거나 비어있으면 제외
    play_time: { $exists: true, $ne: "정보 없음" },
    
    // 2. 이미지: 썸네일이 깨지거나 없으면 제외
    main_image: { $exists: true, $ne: "" },

    // 3. 성인 게임: 기본적으로 제외
    isAdult: { $ne: true },

    // 4. 메타스코어: 0점(평가 없음)인 게임 제외 (데이터 완성도를 위해)
    metacritic_score: { $gt: 0 },

    // 5. 가격 정보 필터 (가장 중요)
    // - 가격이 0보다 크거나 OR (가격이 0원이라면 반드시 isFree가 true여야 함)
    // - price_info 필드 자체가 없는 경우도 제외됨
    $or: [
        { "price_info.current_price": { $gt: 0 } }, 
        { "price_info.isFree": true }
    ]
};

/* ========================================================================
    [Helper Functions] 추천 및 분석 로직
    ========================================================================
*/

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

// 사용자 보유 게임 태그 분석 (로그 가중치 적용)
function analyzeUserSteamTags(ownedGames, dbGamesMap) {
    const tagScores = {};
    let analyzedCount = 0;

    ownedGames.forEach(og => {
        const dbGame = dbGamesMap[og.appid];
        if (dbGame && dbGame.smart_tags) {
            const minutes = og.playtime_forever || 0;
            if (minutes < 30) return; // 30분 미만 플레이는 취향 분석에서 제외

            analyzedCount++;
            // [Core Logic] 많이 플레이한 게임일수록 가중치를 더 주되, 로그를 취해 격차 완화
            const weight = Math.log(minutes + 1); 

            dbGame.smart_tags.forEach(tag => {
                if (!tagScores[tag]) tagScores[tag] = 0;
                tagScores[tag] += weight;
            });
        }
    });
    // console.log(`[AI 분석] 태그 분석 완료 (${analyzedCount}개 게임)`);
    
    return Object.entries(tagScores)
        .sort(([, scoreA], [, scoreB]) => scoreB - scoreA)
        .slice(0, 5) 
        .map(([tag]) => tag);
}

/* ========================================================================
    [API Route 1] 메인 페이지 리스트 조회 (Infinite Scroll)
    - 기본 정렬 및 필터링 제공
    ========================================================================
*/
router.get('/list', async (req, res) => {
    try {
        const { sort = 'trend', page = 1, limit = 20 } = req.query;
        const skip = (page - 1) * limit;

        let sortQuery = {};
        
        // 정렬 로직
        switch(sort) {
            case 'low_price':
                // 가격 오름차순 (무료 -> 저가 -> 고가)
                sortQuery = { "price_info.current_price": 1 };
                break;
            case 'high_price':
                sortQuery = { "price_info.current_price": -1 };
                break;
            case 'new':
                sortQuery = { release_date: -1 };
                break;
            case 'trend':
            default:
                sortQuery = { trend_score: -1 };
                break;
        }

        // [핵심] QUALITY_FILTER를 적용하여 리스트 조회
        const games = await Game.find(QUALITY_FILTER)
            .sort(sortQuery)
            .skip(skip)
            .limit(parseInt(limit))
            .select('steam_appid title title_ko main_image price_info trend_score metacritic_score'); // 필요한 필드만 select

        const total = await Game.countDocuments(QUALITY_FILTER);

        res.json({
            data: games,
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / limit)
        });

    } catch (error) {
        console.error("List fetch error:", error);
        res.status(200).json({ data: [], currentPage: 1, totalPages: 1 });
    }
});


/* ========================================================================
    [API Route 2] 개인화 추천 및 복합 검색 (/reco)
    - 태그, 트렌드, 가격, 플레이타임 등을 종합 점수화
    ========================================================================
*/
router.post('/reco', async (req, res) => {
    let { term, liked = [], k = 12 } = req.body; 

    // ★ 1. 필터 초기화 (QUALITY_FILTER 기본 적용)
    let searchConditions = [];
    
    // 기본 품질 필터 적용
    if (QUALITY_FILTER.play_time) searchConditions.push({ play_time: QUALITY_FILTER.play_time });
    if (QUALITY_FILTER.main_image) searchConditions.push({ main_image: QUALITY_FILTER.main_image });
    if (QUALITY_FILTER.isAdult) searchConditions.push({ isAdult: QUALITY_FILTER.isAdult });
    if (QUALITY_FILTER.metacritic_score) searchConditions.push({ metacritic_score: QUALITY_FILTER.metacritic_score });
    if (QUALITY_FILTER.$or) searchConditions.push({ $or: QUALITY_FILTER.$or });

    let implicitTags = []; 
    let userSteamGames = [];

    // 2. 로그인 사용자 처리 (보유 게임 제외 + 취향 분석)
    const token = req.cookies?.token;
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretKey');
            const user = await User.findById(decoded.id).select('steamGames steamId');
            
            if (user && user.steamGames && user.steamGames.length > 0) {
                userSteamGames = user.steamGames;
                const ownedAppIds = userSteamGames.map(g => g.appid);
                
                // 이미 가진 게임은 결과에서 제외
                if (ownedAppIds.length > 0) {
                    searchConditions.push({ steam_appid: { $nin: ownedAppIds } });
                }

                // 태그 분석용 데이터 조회
                const ownedDbGames = await Game.find({ steam_appid: { $in: ownedAppIds } })
                    .select('steam_appid smart_tags')
                    .lean();
                
                const dbGamesMap = {};
                ownedDbGames.forEach(g => dbGamesMap[g.steam_appid] = g);

                implicitTags = analyzeUserSteamTags(userSteamGames, dbGamesMap);
            }
        } catch (e) { console.error("[Auth Error]", e.message); }
    }

    // 3. 검색어 필터
    if (term) {
        const q = term.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        searchConditions.push({
            $or: [
                { title: { $regex: q, $options: 'i' } },
                { title_ko: { $regex: q, $options: 'i' } }
            ]
        });
    }

    // 4. 태그 필터 (사용자 선택 + 자동 분석)
    const finalLikedTags = Array.from(new Set([...liked, ...implicitTags]));
    if (liked.length > 0) {
        const tagConditions = liked.map(tag => {
            const regexTags = getQueryTags(tag);
            return { smart_tags: { $in: regexTags } };
        });
        searchConditions.push(...tagConditions);
    }

    // 최종 쿼리 생성
    const finalQuery = searchConditions.length > 0 ? { $and: searchConditions } : {};

    try {
        // 5. DB 조회 (limit을 넉넉하게 잡아서 정렬 후 slice)
        const candidates = await Game.find(finalQuery)
            .select('steam_appid title title_ko main_image price_info smart_tags metacritic_score trend_score slug play_time')
            .limit(1000) 
            .lean();

        // 유효 태그 목록 수집 (클라이언트 필터링용)
        const validTagsSet = new Set();
        candidates.forEach(g => {
            if (g.smart_tags) g.smart_tags.forEach(t => validTagsSet.add(t));
        });

        // 6. 점수 계산 및 포맷팅
        const processedGames = candidates.map(game => {
            const tagScore = calculateTagScore(game.smart_tags, finalLikedTags);
            const trendVal = game.trend_score || 0;
            const trendScore = Math.log10(trendVal + 1) / 5; 
            const metaScore = (game.metacritic_score || 0) / 100; 
            const playtimeVal = parsePlaytime(game.play_time);

            // 실제 가격 숫자값 추출 (정렬용)
            const priceVal = game.price_info?.isFree ? 0 : (game.price_info?.current_price || 9999999);

            const finalScore = (tagScore * 0.5) + (trendScore * 0.3) + (metaScore * 0.2);

            return {
                _id: game._id,
                appid: game.steam_appid,
                name: game.title_ko || game.title,
                thumb: game.main_image,
                price: formatPrice(game.price_info),
                playtime: game.play_time || "정보 없음",
                score: Math.round(finalScore * 100),
                // 정렬을 위한 데이터셋
                sortData: { 
                    overall: finalScore, 
                    trend: trendVal, 
                    tag: tagScore, 
                    playtime: playtimeVal, 
                    meta: game.metacritic_score || 0,
                    price: priceVal // 가격 정렬용 값
                },
                slug: game.slug
            };
        });

        const limit = k * 2; 
        
        // 7. 정렬된 결과 반환 (카테고리별로 Top K 추출)
        res.json({ 
            // 종합 추천 (태그+트렌드+평점)
            overall: [...processedGames].sort((a, b) => b.sortData.overall - a.sortData.overall).slice(0, limit),
            // 급상승 트렌드
            trend: [...processedGames].sort((a, b) => b.sortData.trend - a.sortData.trend).slice(0, limit),
            // 플레이타임 긴 순
            playtime: [...processedGames].sort((a, b) => b.sortData.playtime - a.sortData.playtime).slice(0, limit),
            // 취향 저격 (태그 일치도)
            tag: [...processedGames].sort((a, b) => b.sortData.tag - a.sortData.tag).slice(0, limit),
            // 가격 낮은 순 (무료 -> 저가)
            lowPrice: [...processedGames].sort((a, b) => a.sortData.price - b.sortData.price).slice(0, limit),
            
            validTags: Array.from(validTagsSet) 
        });

    } catch (err) {
        console.error("추천 API 에러:", err);
        res.status(500).json({ error: "데이터 조회 실패" });
    }
});

module.exports = router;