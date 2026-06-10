const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Game = require('../models/Game');
const cache = require('../utils/simpleCache');
const TrendHistory = require('../models/TrendHistory');
const { authenticateToken } = require('../middleware/auth');
const recoController = require('../controllers/recoController');

const { resolveQuery, escapeRegex } = require('../utils/gameDictionary');
const { getWishlistReason } = require('../utils/reasonGenerator');

router.get('/search/autocomplete', async (req, res) => {
    try {
        const q = String(req.query.q || '').trim();
        if (!q) return res.json([]);
        if (q.length > 50) return res.json([]);
        const queries = resolveQuery(q);
        const orClauses = queries.flatMap(qr => {
            const r = new RegExp(escapeRegex(qr), 'i');
            return [{ title: r }, { title_ko: r }, { smart_tags: r }];
        });

        const games = await Game.find({ $or: orClauses })
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

// 검색 결과 페이지 전용 엔드포인트
// autocomplete와 동일하게 title, title_ko, slug 3개 필드 검색
router.get('/search/results', async (req, res) => {
    try {
        const q = String(req.query.q || '').trim();
        if (!q) return res.json({ success: true, games: [] });
        if (q.length > 50) return res.json({ success: true, games: [] });

        const queries = resolveQuery(q);
        const orClauses = queries.flatMap(qr => {
            const r = new RegExp(escapeRegex(qr), 'i');
            return [{ title: r }, { title_ko: r }, { smart_tags: r }];
        });

        const games = await Game.find({ $or: orClauses })
            .sort({ steam_ccu: -1, trend_score: -1, 'steam_reviews.overall.percent': -1 })
            .limit(60)
            .lean();

        const uniqueGames = [];
        const seen = new Set();
        for (const game of games) {
            if (!game.slug || seen.has(game.slug)) continue;
            seen.add(game.slug);
            uniqueGames.push(game);
        }

        res.json({ success: true, games: uniqueGames });
    } catch (error) {
        console.error('Search Results API Error:', error);
        res.status(500).json({ success: false, games: [] });
    }
});

const { fetchGiveaways } = require('../services/giveawayService');

// ── 기간 한정 무료 게임 (GamerPower + Epic Games) ────────────────────────────
router.get('/games/giveaway', async (req, res) => {
    try {
        const cached = cache.get('giveaway:list');
        if (cached) return res.json({ success: true, games: cached, cached: true });

        // 첫 호출 시에만 가져오고 이후 1시간 캐싱
        const results = await fetchGiveaways();
        res.json({ success: true, games: results });
    } catch (err) {
        console.error('Giveaway API Error:', err.message);
        res.json({ success: true, games: [] });
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

        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

        const history = await TrendHistory.find({
            steam_appid: appId,
            recordedAt: { $gte: fourteenDaysAgo }
        }).select('steam_appid twitch_viewers chzzk_viewers soop_viewers steam_ccu trend_score recordedAt').sort({ recordedAt: -1 }).lean();

        res.json(history.reverse());
    } catch (error) {
        console.error('Trend History API Error:', error);
        res.json([]);
    }
});

router.get('/games/:id/myvote', recoController.getMyVote);
router.post('/games/:id/vote', recoController.voteGame);

// /recommend POST는 advancedRecoRoutes(recommendController)에서 처리
// 이 파일에서는 /games/*, /search/*, /recommend/wishlist 만 담당

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

        const gamesWithReason = games.map(game => ({
            ...game,
            reason: getWishlistReason(game)
        }));

        res.json({ success: true, games: gamesWithReason });
    } catch (error) {
        console.error('Wishlist API Error:', error);
        res.status(500).json({ success: false, message: '서버 에러' });
    }
});



module.exports = router;