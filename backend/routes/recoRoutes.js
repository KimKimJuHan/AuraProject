const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// 모델 및 미들웨어 참조 (파일 경로 팩트 체크 완료)
const Game = require('../models/Game');
const TrendHistory = require('../models/TrendHistory');
const { authenticateToken } = require('../middleware/auth');

/**
 * 검색어용 정규식 이스케이프
 */
function escapeRegex(text = '') {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 1. [상세 페이지용] 단일 게임 정보 조회
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

        if (!game) return res.status(404).json({ success: false, message: '게임을 찾을 수 없습니다.' });

        // 프론트엔드 ShopPage.js의 구조에 맞춰 객체 직접 반환
        res.json(game);
    } catch (error) {
        console.error('Game Detail API Error:', error);
        res.status(500).json({ success: false, message: '서버 에러가 발생했습니다.' });
    }
});

/**
 * 2. [그래프용] 게임 트렌드 히스토리 조회
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

        // 최근 30개의 트렌드 데이터 조회
        const history = await TrendHistory.find({ steam_appid: appId })
            .sort({ recordedAt: 1 })
            .limit(30)
            .lean();

        res.json(history);
    } catch (error) {
        res.json([]);
    }
});

/**
 * 3. [수정] 계정 기반 투표 API (보안 강화)
 * POST /api/games/:id/vote
 */
router.post('/games/:id/vote', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { type } = req.body; // 'like' or 'dislike'
        const userId = req.user._id.toString(); // authenticateToken을 통해 확보된 유저 ID

        let game = await Game.findOne({ $or: [{ steam_appid: parseInt(id.replace('steam-', ''), 10) }, { slug: id }] });
        if (!game) return res.status(404).json({ message: "게임을 찾을 수 없습니다." });

        // 식별자를 계정 고유 ID(userId)로 매칭하여 투표 여부 확인
        const existingVoteIndex = game.votes.findIndex(v => v.identifier === userId);
        
        if (existingVoteIndex > -1) {
            if (game.votes[existingVoteIndex].type === type) {
                game.votes.splice(existingVoteIndex, 1); // 동일 타입 클릭 시 취소
            } else {
                game.votes[existingVoteIndex].type = type; // 타입 변경 (추천 -> 비추천 등)
            }
        } else {
            game.votes.push({ identifier: userId, type });
        }

        // 카운트 동기화 및 저장
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
 * 4. 메인 추천 API + 검색 기능 추가
 * POST /api/recommend
 */
router.post('/recommend', async (req, res) => {
    try {
        const { tags = [], sortBy = 'popular', page = 1, searchQuery = '' } = req.body;
        const limit = 20;
        const currentPage = Number(page) || 1;
        const skip = (currentPage - 1) * limit;

        let query = {};

        // 태그 필터
        if (tags && tags.length > 0) {
            query.tags = { $all: tags };
        }

        // 검색어 필터 추가
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
                sortOption = { twitchViewerCount: -1, steamPlayerCount: -1 };
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
                sortOption = { steamPlayerCount: -1 };
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
 * 5. 찜/비교 목록 API (기존 로직 유지)
 */
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

        res.json({ success: true, games: games });
    } catch (error) {
        res.status(500).json({ success: false, message: '서버 에러' });
    }
});

module.exports = router;