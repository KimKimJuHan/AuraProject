const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// 모델 및 미들웨어 참조
const Game = require('../models/Game');
const TrendHistory = require('../models/TrendHistory');
const { authenticateToken } = require('../middleware/auth');
const { getQueryTags } = require('../utils/tagMapper');

/**
 * 검색어용 정규식 이스케이프
 */
function escapeRegex(text = '') {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getMainRecommendationReason(game, sortBy = 'popular', selectedTags = []) {
    const smartTags = Array.isArray(game.smart_tags) ? game.smart_tags : [];
    const discountPercent = game.price_info?.discount_percent || 0;
    const currentPrice = game.price_info?.current_price || 0;
    const reviewPercent = game.steam_reviews?.overall?.percent || 0;
    const reviewTotal = game.steam_reviews?.overall?.total || 0;
    const steamCcu = game.steam_ccu || 0;

    if (Array.isArray(selectedTags) && selectedTags.length > 0) {
        const matchedTags = selectedTags.filter(tag => {
            const mappedTags = getQueryTags(tag);
            return smartTags.some(smartTag => mappedTags.includes(smartTag));
        });

        if (matchedTags.length >= 2) {
            return `${matchedTags.slice(0, 2).join(', ')} 취향과 잘 맞아서 추천`;
        }
        if (matchedTags.length === 1) {
            return `${matchedTags[0]} 취향과 잘 맞아서 추천`;
        }
    }

    switch (sortBy) {
        case 'discount':
            if (discountPercent >= 50) return `할인율 ${discountPercent}%로 가성비가 좋아 추천`;
            if (discountPercent > 0) return '할인 중인 작품이라 추천';
            return '가격 대비 만족도가 좋아 추천';

        case 'price':
            if (currentPrice === 0) return '무료로 바로 즐길 수 있어 추천';
            if (currentPrice > 0 && currentPrice <= 10000) return '가격 부담이 적어 추천';
            return '비교적 저렴하게 즐길 수 있어 추천';

        case 'new':
            return '최근 출시작이라 추천';

        case 'hype':
            if (steamCcu > 0) return '현재 많은 유저가 플레이 중이라 추천';
            return '지금 주목받는 게임이라 추천';

        case 'popular':
        default:
            if (reviewPercent >= 90 && reviewTotal >= 5000) return '평가가 매우 좋아 추천';
            if (steamCcu > 0) return '현재 많은 유저가 플레이 중이라 추천';
            return '인기와 평가가 좋아 추천';
    }
}

/**
 * 1. 자동완성 API
 * GET /api/search/autocomplete?q=...
 */
router.get('/search/autocomplete', async (req, res) => {
    try {
        const q = String(req.query.q || '').trim();

        if (!q) {
            return res.json([]);
        }

        const safeQuery = escapeRegex(q);
        const regex = new RegExp(safeQuery, 'i');

        const games = await Game.find({
            $or: [
                { title: regex },
                { title_ko: regex },
                { slug: regex }
            ]
        })
            .select('title title_ko slug main_image steam_ccu trend_score')
            .sort({ trend_score: -1, steam_ccu: -1, title: 1 })
            .limit(8)
            .lean();

        const uniqueGames = [];
        const seen = new Set();

        for (const game of games) {
            if (!game.slug || seen.has(game.slug)) continue;
            seen.add(game.slug);
            uniqueGames.push(game);
        }

        res.json(uniqueGames);
    } catch (error) {
        console.error('Autocomplete API Error:', error);
        res.status(500).json([]);
    }
});

/**
 * 2. [상세 페이지용] 단일 게임 정보 조회
 * GET /api/games/:id
 */
router.get('/games/:id', async (req, res) => {
    try {
        const { id } = req.params;
        let game = null;

        if (id.startsWith('steam-')) {
            const appId = parseInt(id.replace('steam-', ''), 10);
            if (!isNaN(appId)) {
                game = await Game.findOne({ steam_appid: appId }).lean();
            }
        }

        if (!game) {
            game = await Game.findOne({ slug: id }).lean();
        }

        if (!game) {
            return res.status(404).json({ success: false, message: '게임을 찾을 수 없습니다.' });
        }

        res.json(game);
    } catch (error) {
        console.error('Game Detail API Error:', error);
        res.status(500).json({ success: false, message: '서버 에러가 발생했습니다.' });
    }
});

/**
 * 3. [그래프용] 게임 트렌드 히스토리 조회 (최근 7일 제한 복구)
 * GET /api/games/:id/history
 */
router.get('/games/:id/history', async (req, res) => {
    try {
        const { id } = req.params;
        let appId = null;

        if (id.startsWith('steam-')) {
            appId = parseInt(id.replace('steam-', ''), 10);
        } else {
            const game = await Game.findOne({ slug: id }).select('steam_appid').lean();
            if (game) appId = game.steam_appid;
        }

        if (!appId) return res.json([]);

        // 정확히 최근 7일 전 날짜 계산 (과거 더미 데이터 및 과도한 X축 렌더링 방지)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const history = await TrendHistory.find({ 
            steam_appid: appId,
            recordedAt: { $gte: sevenDaysAgo }
        })
            .sort({ recordedAt: 1 })
            .lean();

        res.json(history);
    } catch (error) {
        console.error('Trend History API Error:', error);
        res.json([]);
    }
});

/**
 * 4. 계정 기반 투표 API
 * POST /api/games/:id/vote
 */
router.post('/games/:id/vote', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { type } = req.body;
        const userId = req.user._id.toString();

        let game = await Game.findOne({
            $or: [
                { steam_appid: parseInt(id.replace('steam-', ''), 10) },
                { slug: id }
            ]
        });

        if (!game) {
            return res.status(404).json({ message: "게임을 찾을 수 없습니다." });
        }

        const existingVoteIndex = game.votes.findIndex(v => v.identifier === userId);

        if (existingVoteIndex > -1) {
            if (game.votes[existingVoteIndex].type === type) {
                game.votes.splice(existingVoteIndex, 1);
            } else {
                game.votes[existingVoteIndex].type = type;
            }
        } else {
            game.votes.push({ identifier: userId, type });
        }

        game.likes_count = game.votes.filter(v => v.type === 'like').length;
        game.dislikes_count = game.votes.filter(v => v.type === 'dislike').length;

        await game.save();

        res.json({
            likes: game.likes_count,
            dislikes: game.dislikes_count,
            userVote: game.votes.find(v => v.identifier === userId)?.type || null
        });
    } catch (error) {
        console.error('Vote API Error:', error);
        res.status(500).json({ message: '투표 처리 중 오류가 발생했습니다.' });
    }
});

/**
 * 5. 메인 추천 API + 검색 기능
 * POST /api/recommend
 */
router.post('/recommend', async (req, res) => {
    try {
        const { tags = [], sortBy = 'popular', page = 1, searchQuery = '' } = req.body;
        const limit = 20;
        const currentPage = Number(page) || 1;
        const skip = (currentPage - 1) * limit;

        const query = {};

        if (tags && tags.length > 0) {
            query.$and = tags.map(tag => ({ smart_tags: { $in: getQueryTags(tag) } }));
        }

        const trimmedQuery = String(searchQuery || '').trim();
        if (trimmedQuery) {
            const safeQuery = escapeRegex(trimmedQuery);
            const regex = new RegExp(safeQuery, 'i');

            query.$or = [
                { title: regex },
                { title_ko: regex },
                { slug: regex }
            ];
        }

        let sortOption = {};
        switch (sortBy) {
            case 'hype':
                sortOption = { trend_score: -1 };
                break;
            case 'new':
                sortOption = { releaseDate: -1 };
                break;
            case 'discount':
                sortOption = { 'price_info.discount_percent': -1 };
                break;
            case 'price':
                sortOption = { 'price_info.current_price': 1 };
                break;
            default:
                sortOption = { trend_score: -1 };
                break;
        }

        const games = await Game.find(query)
            .sort(sortOption)
            .skip(skip)
            .limit(limit)
            .lean();

        const totalCount = await Game.countDocuments(query);

        const gamesWithReason = games.map(game => ({
            ...game,
            reason: getMainRecommendationReason(game, sortBy, tags)
        }));

        const allAvailableTags = Object.values(getQueryTags ? {
            장르: ['RPG', 'FPS', '시뮬레이션', '전략', '스포츠', '레이싱', '퍼즐', '생존', '공포', '리듬', '액션', '어드벤처'],
            시점: ['1인칭', '3인칭', '쿼터뷰', '횡스크롤'],
            그래픽: ['픽셀 그래픽', '2D', '3D', '만화 같은', '현실적', '귀여운'],
            테마: ['판타지', '공상과학', '중세', '현대', '우주', '좀비', '사이버펑크', '마법', '전쟁', '포스트아포칼립스'],
            특징: ['오픈 월드', '자원관리', '스토리 중심', '선택의 중요성', '캐릭터 커스터마이즈', '협동 캠페인', '경쟁/PvP', '소울라이크']
        } : {}).flat?.() || [];

        let validTags = allAvailableTags;

        if (tags && tags.length > 0) {
            const sampledGames = await Game.find(query).select('smart_tags').limit(200).lean();
            const validSet = new Set();

            sampledGames.forEach(game => {
                const smartTags = Array.isArray(game.smart_tags) ? game.smart_tags : [];
                allAvailableTags.forEach(tag => {
                    const mappedTags = getQueryTags(tag);
                    if (smartTags.some(st => mappedTags.includes(st))) {
                        validSet.add(tag);
                    }
                });
            });

            validTags = Array.from(validSet);
        }

        res.json({
            success: true,
            games: gamesWithReason,
            totalPages: Math.ceil(totalCount / limit),
            currentPage,
            validTags
        });
    } catch (error) {
        console.error('Recommend API Error:', error);
        res.status(500).json({ success: false, message: '서버 에러' });
    }
});

/**
 * 6. 찜/비교 목록 API
 * POST /api/recommend/wishlist
 */
router.post('/recommend/wishlist', async (req, res) => {
    try {
        const { slugs = [] } = req.body;
        if (!slugs || slugs.length === 0) {
            return res.json({ success: true, games: [] });
        }

        const games = await Game.find({
            $or: [
                { slug: { $in: slugs } },
                { _id: { $in: slugs.filter(id => mongoose.Types.ObjectId.isValid(id)) } }
            ]
        }).lean();

        res.json({ success: true, games });
    } catch (error) {
        console.error('Wishlist API Error:', error);
        res.status(500).json({ success: false, message: '서버 에러' });
    }
});

module.exports = router;