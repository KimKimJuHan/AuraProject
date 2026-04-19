const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// 모델 및 미들웨어 참조
const Game = require('../models/Game');
const TrendHistory = require('../models/TrendHistory');
const { authenticateToken } = require('../middleware/auth');
const { getQueryTags } = require('../utils/tagMapper'); 
const recoController = require('../controllers/recoController'); // ★ 컨트롤러 연결 추가

function escapeRegex(text = '') {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/search/autocomplete', async (req, res) => {
    try {
        const q = String(req.query.q || '').trim();
        if (!q) return res.json([]);
        const safeQuery = escapeRegex(q);
        const regex = new RegExp(safeQuery, 'i');

        const games = await Game.find({
            $or: [{ title: regex }, { title_ko: regex }, { slug: regex }]
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
        if (!game) game = await Game.findOne({ slug: id }).lean();
        
        if (!game) return res.status(404).json({ success: false, message: '게임을 찾을 수 없습니다.' });
        res.json(game);
    } catch (error) {
        console.error('Game Detail API Error:', error);
        res.status(500).json({ success: false, message: '서버 에러' });
    }
});

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

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const history = await TrendHistory.find({ 
            steam_appid: appId,
            recordedAt: { $gte: sevenDaysAgo }
        }).sort({ recordedAt: -1 }).lean();

        res.json(history.reverse());
    } catch (error) {
        console.error('Trend History API Error:', error);
        res.json([]);
    }
});

// ★ 치명적 에러 원인 해결: 내 투표 내역 조회 API 라우터 추가
router.get('/games/:id/myvote', recoController.getMyVote);

// ★ 투표 처리 라우터 (컨트롤러로 위임하여 처리)
router.post('/games/:id/vote', recoController.voteGame);

// 메인 추천 API + 검색 기능
router.post('/recommend', async (req, res) => {
    try {
        const { tags = [], sortBy = 'popular', page = 1, searchQuery = '' } = req.body;
        const limit = 20;
        const currentPage = Number(page) || 1;
        const skip = (currentPage - 1) * limit;
        const query = {};

        if (tags && tags.length > 0) {
            query.smart_tags = { $in: tags.flatMap(t => getQueryTags(t)) }; // ★ 교집합($and) 버그를 합집합($in)으로 수정
        }

        const trimmedQuery = String(searchQuery || '').trim();
        if (trimmedQuery) {
            const safeQuery = escapeRegex(trimmedQuery);
            const regex = new RegExp(safeQuery, 'i');
            query.$or = [{ title: regex }, { title_ko: regex }, { slug: regex }];
        }

        let sortOption = {};
        switch (sortBy) {
            case 'hype': sortOption = { trend_score: -1 }; break;
            case 'new': sortOption = { releaseDate: -1 }; break;
            case 'discount': sortOption = { 'price_info.discount_percent': -1 }; break;
            case 'price': sortOption = { 'price_info.current_price': 1 }; break;
            default: sortOption = { trend_score: -1 }; break;
        }

        const games = await Game.find(query).sort(sortOption).skip(skip).limit(limit).lean();
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

router.post('/recommend/wishlist', async (req, res) => {
    try {
        const { slugs = [] } = req.body;
        if (!slugs || slugs.length === 0) return res.json({ success: true, games: [] });

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