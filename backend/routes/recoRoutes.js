const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// 모델 및 미들웨어 참조
const Game = require('../models/Game');
const TrendHistory = require('../models/TrendHistory');
const { authenticateToken } = require('../middleware/auth');
const { getQueryTags } = require('../utils/tagMapper'); // 누락된 태그 매퍼 복구

/**
 * 검색어용 정규식 이스케이프
 */
function escapeRegex(text = '') {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
            // steamPlayerCount -> steam_ccu 교체
            .select('title title_ko slug main_image steam_ccu trend_score')
            .sort({ trend_score: -1, steam_ccu: -1, title: 1 })
            .limit(8)
            .lean();

        // slug 기준 중복 제거
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

        // 'steam-숫자' 형식 처리
        if (id.startsWith('steam-')) {
            const appId = parseInt(id.replace('steam-', ''), 10);
            if (!isNaN(appId)) {
                game = await Game.findOne({ steam_appid: appId }).lean();
            }
        }

        // slug 형식 검색
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
 * 3. [그래프용] 게임 트렌드 히스토리 조회
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

        // [수정] 최근 7일 치 데이터만 필터링 (기존 30개 제한 폐기)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const history = await TrendHistory.find({ 
            steam_appid: appId,
            recordedAt: { $gte: sevenDaysAgo }
        })
            .sort({ recordedAt: -1 })
            .lean();

        res.json(history.reverse());
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

        // ★ 치명적 결함 복구: 구형 태그 필터링을 tagMapper 적용 방식으로 변경
        if (tags && tags.length > 0) {
            query.$and = tags.map(tag => ({ smart_tags: { $in: getQueryTags(tag) } }));
        }

        // 검색어 필터
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
                // 구형 변수명 제외하고 최신 수집기 기준인 trend_score 로 정렬
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

        res.json({
            success: true,
            games,
            totalPages: Math.ceil(totalCount / limit),
            currentPage
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