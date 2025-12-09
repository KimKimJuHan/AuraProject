// backend/routes/recoRoutes.js

const express = require('express');
const router = express.Router();
const Game = require('../models/Game'); 
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { getQueryTags } = require('../utils/tagMapper');

// ★ [핵심 1] 품질 필터 정의 (데이터 부실한 게임 숨기기)
const QUALITY_FILTER = {
    play_time: { $ne: "정보 없음" },      // 플레이 타임 없는 것 제외
    metacritic_score: { $gt: 0 },         // 메타 점수 없는 것 제외 (똥겜 방지)
    "price_info.current_price": { $gt: 0 }, // 가격 정보 오류 제외
    main_image: { $exists: true, $ne: "" }, // 이미지 없는 것 제외
    isAdult: { $ne: true }                // 성인 게임 기본 제외
};

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
        // DB에 정보가 있는 게임만 분석
        const dbGame = dbGamesMap[og.appid];
        if (dbGame && dbGame.smart_tags) {
            const minutes = og.playtime_forever || 0;
            if (minutes < 30) return; // 30분 미만 플레이는 취향 반영 X

            analyzedCount++;
            const weight = Math.log(minutes + 1); // 플레이 타임 로그 가중치

            dbGame.smart_tags.forEach(tag => {
                if (!tagScores[tag]) tagScores[tag] = 0;
                tagScores[tag] += weight;
            });
        }
    });
    console.log(`[AI 분석] 내 라이브러리 기반 태그 분석 완료 (${analyzedCount}개 게임)`);

    // 상위 5개 태그 추출
    return Object.entries(tagScores)
        .sort(([, scoreA], [, scoreB]) => scoreB - scoreA)
        .slice(0, 5) 
        .map(([tag]) => tag);
}

router.post('/reco', async (req, res) => {
    let { term, liked = [], k = 12 } = req.body; 

    // ★ [핵심 2] 기본 필터에 품질 필터 적용
    let filter = { ...QUALITY_FILTER }; 
    let implicitTags = []; 
    let userSteamGames = [];

    // 1. 사용자 인증 및 DB에서 스팀 게임 가져오기 (API 호출 X -> 속도 향상)
    const token = req.cookies?.token;
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretKey');
            const user = await User.findById(decoded.id).select('steamGames steamId');
            
            if (user && user.steamGames && user.steamGames.length > 0) {
                userSteamGames = user.steamGames;
                
                // 이미 가진 게임은 추천에서 제외
                const ownedAppIds = userSteamGames.map(g => g.appid);
                if (ownedAppIds.length > 0) {
                    filter.steam_appid = { $nin: ownedAppIds };
                    console.log(`[추천 필터] 보유 게임 ${ownedAppIds.length}개 제외`);
                }

                // 내 게임들의 태그 분석을 위해 DB에서 정보 조회
                const ownedDbGames = await Game.find({ steam_appid: { $in: ownedAppIds } })
                    .select('steam_appid smart_tags')
                    .lean();
                
                const dbGamesMap = {};
                ownedDbGames.forEach(g => dbGamesMap[g.steam_appid] = g);

                // 취향 태그 자동 추출
                implicitTags = analyzeUserSteamTags(userSteamGames, dbGamesMap);
            }
        } catch (e) {
            console.error("[인증/스팀 DB 조회 에러]", e.message);
        }
    }

    // 2. 검색어 필터 ($or 조건이라 품질 필터 깨지지 않게 주의)
    if (term) {
        const q = term.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        // 품질 필터는 유지하면서 검색어 조건 추가
        filter.$and = [
            { ...QUALITY_FILTER }, // 기본 품질 조건
            {
                $or: [
                    { title: { $regex: q, $options: 'i' } },
                    { title_ko: { $regex: q, $options: 'i' } }
                ]
            }
        ];
        // filter 객체 재구성 했으므로 steam_appid 제외 조건이 있으면 다시 넣어줌
        if (filter.steam_appid) {
            filter.$and.push({ steam_appid: filter.steam_appid });
            delete filter.steam_appid; // 중복 방지
        }
    }

    // 3. 태그 필터 (사용자가 선택한 태그 + 자동 분석 태그)
    const finalLikedTags = Array.from(new Set([...liked, ...implicitTags]));

    if (liked.length > 0) {
        const tagConditions = liked.map(tag => {
            const regexTags = getQueryTags(tag);
            return { smart_tags: { $in: regexTags } };
        });
        
        if (!filter.$and) filter.$and = [];
        filter.$and.push(...tagConditions);
    } 
    // 선택 태그는 없지만 내 플레이 기록(implicit)만 있을 때 -> 검색 결과 범위 좁히지 않고 가중치만 줌 (필터에는 추가 안함)

    try {
        // 4. 후보군 조회
        const candidates = await Game.find(filter)
            .select('steam_appid title title_ko main_image price_info smart_tags metacritic_score trend_score slug play_time')
            .limit(1000) 
            .lean();

        // 유효 태그 목록 수집
        const validTagsSet = new Set();
        candidates.forEach(g => {
            if (g.smart_tags) g.smart_tags.forEach(t => validTagsSet.add(t));
        });

        // 5. 점수 계산 (Tag 50% + Trend 30% + Meta 20%)
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
        
        // 6. 결과 반환
        res.json({ 
            overall: [...processedGames].sort((a, b) => b.sortData.overall - a.sortData.overall).slice(0, limit),
            trend: [...processedGames].sort((a, b) => b.sortData.trend - a.sortData.trend).slice(0, limit),
            playtime: [...processedGames].sort((a, b) => b.sortData.playtime - a.sortData.playtime).slice(0, limit),
            tag: [...processedGames].sort((a, b) => b.sortData.tag - a.sortData.tag).slice(0, limit),
            validTags: Array.from(validTagsSet) 
        });

    } catch (err) {
        console.error("추천 API 에러:", err);
        res.status(500).json({ error: "데이터 조회 실패" });
    }
});

module.exports = router;