const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Game 모델 로드
const Game = mongoose.models.Game || mongoose.model('Game', new mongoose.Schema({}, { strict: false }));

// 1. 메인 추천 API (인방픽 정렬 포함)
router.post('/recommend', async (req, res) => {
    try {
        const { tags = [], sortBy = 'popular', page = 1 } = req.body;
        const limit = 20;
        const skip = (page - 1) * limit;

        let query = {};
        if (tags && tags.length > 0) {
            query.tags = { $all: tags };
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
            case 'popular':
            default:
                sortOption = { steamPlayerCount: -1 };
                break;
        }

        const games = await Game.find(query).sort(sortOption).skip(skip).limit(limit).lean();
        const totalCount = await Game.countDocuments(query);

        res.json({
            success: true,
            games: games,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: page,
            validTags: [] 
        });
    } catch (error) {
        console.error('Recommend API Error:', error);
        res.status(500).json({ success: false, message: '서버 에러가 발생했습니다.' });
    }
});

// 2. [신규 추가] 찜/비교 목록 전용 API
router.post('/recommend/wishlist', async (req, res) => {
    try {
        const { slugs = [] } = req.body;
        
        if (!slugs || slugs.length === 0) {
            return res.json({ success: true, games: [] });
        }

        // 배열로 받은 slug 값들과 일치하는 게임만 필터링하여 조회
        // (게임 DB 구조에 따라 slug가 없으면 _id로 대체 매칭)
        const games = await Game.find({
            $or: [
                { slug: { $in: slugs } },
                { _id: { $in: slugs.filter(id => mongoose.Types.ObjectId.isValid(id)) } }
            ]
        }).lean();

        res.json({ success: true, games: games });
    } catch (error) {
        console.error('Wishlist API Error:', error);
        res.status(500).json({ success: false, message: '서버 에러가 발생했습니다.' });
    }
});

module.exports = router;