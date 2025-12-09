// backend/routes/recoRoutes.js

const express = require('express');
const router = express.Router();
const Game = require('../models/Game'); 
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { getQueryTags } = require('../utils/tagMapper');

/**
 * [최소 품질 필터]
 * 데이터가 조금 부족해도 검색 결과가 나오도록 필터 조건을 최소화했습니다.
 * - 이미지는 있어야 함
 * - 성인 게임은 제외
 */
const BASE_FILTER = {
    main_image: { $exists: true, $ne: "" }, 
    isAdult: { $ne: true }
};

// 태그 점수 계산 (자카드 유사도)
function calculateTagScore(gameTags, userTags) {
    if (!gameTags || !userTags || userTags.length === 0) return 0;
    
    // 비교를 위해 소문자로 통일
    const gameSet = new Set((gameTags || []).map(t => t.toLowerCase().trim()));
    let matchCount = 0;
    
    userTags.forEach(tag => {
        // userTags는 이미 한글이거나 매핑된 키워드일 수 있음.
        // 정확도를 위해 여기서는 단순 포함 여부만 체크
        if (gameSet.has(tag.toLowerCase())) matchCount++;
    });

    const unionSize = new Set([...gameSet, ...userTags.map(t=>t.toLowerCase())]).size;
    return unionSize === 0 ? 0 : matchCount / unionSize;
}

// 가격 표시 로직 (데이터가 없으면 '정보 없음' 대신 빈칸이나 안전한 값 처리)
function formatPrice(priceInfo) {
    if (!priceInfo) return "가격 정보 없음";
    if (priceInfo.isFree === true) return "무료";
    if (priceInfo.current_price === 0) return "무료";
    
    if (priceInfo.current_price !== undefined && priceInfo.current_price !== null) {
        return `₩${priceInfo.current_price.toLocaleString()}`;
    }
    return "가격 정보 없음";
}

function parsePlaytime(playtimeStr) {
    if (!playtimeStr) return 0;
    const number = parseInt(playtimeStr); 
    return isNaN(number) ? 0 : number;
}

// 사용자 라이브러리 분석
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

    return Object.entries(tagScores)
        .sort(([, scoreA], [, scoreB]) => scoreB - scoreA)
        .slice(0, 5) 
        .map(([tag]) => tag);
}

router.post('/reco', async (req, res) => {
    let { term, liked = [], k = 12 } = req.body; 

    // 1. 필터 초기화
    let filter = {
        $and: [
            { ...BASE_FILTER }
            // 가격, 메타스코어, 플레이타임 필터 전부 제거 -> 데이터가 있으면 보여줌
        ]
    };

    let implicitTags = []; 
    let userSteamGames = [];

    // 2. 사용자 인증 및 보유 게임 제외
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

                // 태그 분석 로직
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

    // 3. 검색어 필터 (제목)
    if (term) {
        const q = term.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        filter.$and.push({
            $or: [
                { title: { $regex: q, $options: 'i' } },
                { title_ko: { $regex: q, $options: 'i' } }
            ]
        });
    }

    // 4. 태그 필터 (문제의 원인 해결 구간)
    const finalLikedTags = Array.from(new Set([...liked, ...implicitTags]));

    if (liked.length > 0) {
        liked.forEach(tag => {
            // tagMapper의 getQueryTags는 이미 정규식 배열([ /Expression/i, ... ])을 반환합니다.
            const regexTags = getQueryTags(tag); 
            
            // ★ 수정: 정규식 객체를 그대로 사용하여 $or 조건 생성
            // 의미: 해당 게임의 smart_tags 중 하나라도 이 정규식들 중 하나와 매칭되면 통과
            const orConditions = regexTags.map(regex => ({ smart_tags: { $regex: regex } }));
            
            filter.$and.push({ $or: orConditions });
        });
    }

    try {
        console.log(`[추천 API Request] 검색어: "${term || ''}", 선택태그: [${liked.join(', ')}]`);
        // console.log(`[Query Filter]:`, JSON.stringify(filter)); // 필요시 주석 해제하여 쿼리 확인

        // 5. 후보군 조회
        const candidates = await Game.find(filter)
            .select('steam_appid title title_ko main_image price_info smart_tags metacritic_score trend_score slug play_time')
            .limit(1000) 
            .lean();
        
        console.log(`[추천 API Result] 후보군 ${candidates.length}개 발견`);

        // 유효 태그 목록 수집
        const validTagsSet = new Set();
        candidates.forEach(g => {
            if (g.smart_tags) g.smart_tags.forEach(t => validTagsSet.add(t));
        });

        // 6. 점수 계산
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
        
        // 7. 결과 반환
        res.json({ 
            overall: [...processedGames].sort((a, b) => b.sortData.overall - a.sortData.overall).slice(0, limit),
            trend: [...processedGames].sort((a, b) => b.sortData.trend - a.sortData.trend).slice(0, limit),
            playtime: [...processedGames].sort((a, b) => b.sortData.playtime - a.sortData.playtime).slice(0, limit),
            tag: [...processedGames].sort((a, b) => b.sortData.tag - a.sortData.tag).slice(0, limit),
            validTags: Array.from(validTagsSet) 
        });

    } catch (err) {
        console.error("추천 API 치명적 에러:", err);
        // 에러가 나더라도 빈 배열을 주어 프론트가 죽지 않게 함
        res.status(200).json({ 
            overall: [], trend: [], playtime: [], tag: [], validTags: [] 
        });
    }
});

module.exports = router;