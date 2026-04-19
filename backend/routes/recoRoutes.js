const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Game = require('../models/Game');
const TrendHistory = require('../models/TrendHistory');
const { authenticateToken } = require('../middleware/auth');

function escapeRegex(text = '') {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeTag(value = '') {
    return String(value)
        .trim()
        .toLowerCase()
        .replace(/[\s/_-]+/g, '');
}

const KOREAN_ALIAS_MAP = {
    [normalizeTag('횡스크롤')]: '횡스크롤',
    [normalizeTag('사이드뷰')]: '횡스크롤',
    [normalizeTag('사이드스크롤')]: '횡스크롤',
    [normalizeTag('오픈월드')]: '오픈 월드',
    [normalizeTag('멀티')]: '멀티플레이',
    [normalizeTag('멀티 플레이')]: '멀티플레이',
    [normalizeTag('협동')]: '협동 캠페인',
    [normalizeTag('협동플레이')]: '협동 캠페인',
    [normalizeTag('탑뷰')]: '탑다운',
    [normalizeTag('애니')]: '애니메이션',
    [normalizeTag('경쟁pvp')]: '경쟁/PvP',
    [normalizeTag('경쟁/pvp')]: '경쟁/PvP',
    [normalizeTag('pvp')]: '경쟁/PvP'
};

const KOREAN_VARIANTS = {
    '횡스크롤': ['횡스크롤', '사이드뷰', '사이드 스크롤'],
    '오픈 월드': ['오픈 월드', '오픈월드'],
    '멀티플레이': ['멀티플레이', '멀티 플레이', '멀티'],
    '협동 캠페인': ['협동 캠페인', '협동', '협동플레이', '코옵'],
    '탑다운': ['탑다운', '탑뷰'],
    '애니메이션': ['애니메이션', '애니'],
    '경쟁/PvP': ['경쟁/PvP', '경쟁PVP', 'PVP', 'PvP']
};

function createLooseRegex(tag = '') {
    const escaped = String(tag)
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\s+/g, '\\s*');

    return new RegExp(`^${escaped}$`, 'i');
}

function safeGetQueryTags(inputTag) {
    try {
        const tagMapper = require('../utils/tagMapper');
        if (tagMapper && typeof tagMapper.getQueryTags === 'function') {
            return tagMapper.getQueryTags(inputTag);
        }
    } catch (e) {}

    const normalizedInput = normalizeTag(inputTag);
    const canonicalTag = KOREAN_ALIAS_MAP[normalizedInput] || inputTag;
    const variants = KOREAN_VARIANTS[canonicalTag] || [];
    const pool = new Set([inputTag, canonicalTag, ...variants]);

    return Array.from(pool).map(createLooseRegex);
}

const MAIN_TAG_POOL = [
    '초심자', '심화',
    'RPG', 'FPS', '시뮬레이션', '전략', '스포츠', '레이싱', '퍼즐', '생존', '공포', '리듬', '액션', '어드벤처',
    '1인칭', '3인칭', '쿼터뷰', '횡스크롤',
    '픽셀 그래픽', '2D', '3D', '만화 같은', '현실적', '귀여운',
    '판타지', '공상과학', '중세', '현대', '우주', '좀비', '사이버펑크', '마법', '전쟁', '포스트아포칼립스',
    '오픈 월드', '자원관리', '스토리 중심', '선택의 중요성', '캐릭터 커스터마이즈', '협동 캠페인', '경쟁/PvP', '소울라이크'
];

function matchesMappedTag(gameTags = [], tag) {
    const mapped = safeGetQueryTags(tag);
    return gameTags.some(st => mapped.some(regex => regex.test(String(st || ''))));
}

function getMainRecommendationReason(game, sortBy = 'popular', selectedTags = []) {
    const smartTags = Array.isArray(game.smart_tags) ? game.smart_tags : [];
    const discountPercent = Number(game.price_info?.discount_percent || 0);
    const currentPrice = Number(game.price_info?.current_price || 0);
    const reviewPercent = Number(game.steam_reviews?.overall?.percent || 0);
    const reviewTotal = Number(game.steam_reviews?.overall?.total || 0);
    const steamCcu = Number(game.steam_ccu || 0);

    const matchedTags = Array.isArray(selectedTags)
        ? selectedTags.filter(tag => matchesMappedTag(smartTags, tag))
        : [];

    const reasonCandidates = [];

    switch (sortBy) {
        case 'discount':
            reasonCandidates.push({
                score: 200 + discountPercent,
                text: discountPercent >= 50
                    ? `할인율 ${discountPercent}%로 가성비가 좋아 추천`
                    : discountPercent > 0
                    ? '할인 중인 작품이라 추천'
                    : '가격 대비 만족도가 좋아 추천'
            });
            break;

        case 'price':
            reasonCandidates.push({
                score: currentPrice === 0 ? 300 : Math.max(180, 220 - Math.min(currentPrice / 100, 120)),
                text: currentPrice === 0
                    ? '무료로 바로 즐길 수 있어 추천'
                    : currentPrice > 0 && currentPrice <= 10000
                    ? '가격 부담이 적어 추천'
                    : '비교적 저렴하게 즐길 수 있어 추천'
            });
            break;

        case 'new': {
            const releaseScore = game.releaseDate ? Math.floor(new Date(game.releaseDate).getTime() / 10000000000) : 150;
            reasonCandidates.push({
                score: releaseScore,
                text: '최근 출시작이라 추천'
            });
            break;
        }

        case 'hype':
            reasonCandidates.push({
                score: 200 + Math.min(Math.floor(steamCcu / 100), 100),
                text: steamCcu > 0 ? '현재 많은 유저가 플레이 중이라 추천' : '지금 주목받는 게임이라 추천'
            });
            break;

        case 'popular':
        default:
            reasonCandidates.push({
                score: 150 + reviewPercent + Math.min(Math.floor(reviewTotal / 1000), 20),
                text: reviewPercent >= 90 && reviewTotal >= 5000
                    ? '평가가 매우 좋아 추천'
                    : steamCcu > 0
                    ? '현재 많은 유저가 플레이 중이라 추천'
                    : '인기와 평가가 좋아 추천'
            });
            break;
    }

    if (reviewPercent > 0) {
        reasonCandidates.push({
            score: reviewPercent + Math.min(Math.floor(reviewTotal / 2000), 10),
            text: reviewPercent >= 90 ? '유저 평가가 매우 높아 추천' : '유저 평가가 좋아 추천'
        });
    }

    if (steamCcu > 0) {
        reasonCandidates.push({
            score: Math.min(Math.floor(steamCcu / 500), 100),
            text: '현재 플레이 인원이 많아 추천'
        });
    }

    if (matchedTags.length > 0) {
        reasonCandidates.push({
            score: matchedTags.length * 12,
            text: matchedTags.length >= 2
                ? `${matchedTags.slice(0, 2).join(', ')} 취향과 잘 맞아서 추천`
                : `${matchedTags[0]} 취향과 잘 맞아서 추천`
        });
    }

    reasonCandidates.sort((a, b) => b.score - a.score);
    return reasonCandidates[0]?.text || '조건이 잘 맞아 추천';
}

function getWishlistReason(game) {
    const smartTags = Array.isArray(game.smart_tags) ? game.smart_tags : [];
    const discountPercent = game.price_info?.discount_percent || 0;
    const currentPrice = game.price_info?.current_price || 0;
    const reviewPercent = game.steam_reviews?.overall?.percent || 0;
    const reviewTotal = game.steam_reviews?.overall?.total || 0;
    const steamCcu = game.steam_ccu || 0;

    if (discountPercent >= 50) return `할인율 ${discountPercent}%로 찜해둘 만한 작품`;
    if (currentPrice === 0) return '무료로 즐길 수 있어 찜 추천';
    if (reviewPercent >= 90 && reviewTotal >= 1000) return '평가가 좋아 찜한 작품';
    if (steamCcu > 0) return '지금도 유저가 많이 플레이 중인 작품';
    if (smartTags.includes('오픈 월드')) return '오픈 월드 취향에 잘 맞는 작품';
    if (smartTags.includes('스토리 중심')) return '스토리 중심 플레이를 좋아하면 추천';
    if (smartTags.includes('멀티플레이') || smartTags.includes('협동 캠페인')) return '함께 즐기기 좋아 찜해둘 만한 작품';

    return '관심 게임으로 저장해둔 추천 작품';
}

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
        })
            .sort({ recordedAt: -1 })
            .lean();

        res.json(history.reverse());
    } catch (error) {
        console.error('Trend History API Error:', error);
        res.json([]);
    }
});

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

router.post('/recommend', async (req, res) => {
    try {
        const { tags = [], sortBy = 'popular', page = 1, searchQuery = '' } = req.body;
        const limit = 20;
        const currentPage = Number(page) || 1;
        const skip = (currentPage - 1) * limit;

        const query = {};

        if (tags && tags.length > 0) {
            query.$and = tags.map(tag => ({ smart_tags: { $in: safeGetQueryTags(tag) } }));
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

        const games = await Game.find(query)
            .sort(
                sortBy === 'hype' ? { trend_score: -1 } :
                sortBy === 'new' ? { releaseDate: -1 } :
                sortBy === 'discount' ? { 'price_info.discount_percent': -1 } :
                sortBy === 'price' ? { 'price_info.current_price': 1 } :
                { trend_score: -1 }
            )
            .skip(skip)
            .limit(limit)
            .lean();

        const totalCount = await Game.countDocuments(query);

        const gamesWithReason = games.map(game => ({
            ...game,
            reason: getMainRecommendationReason(game, sortBy, tags)
        }));

        const validSet = new Set();
        gamesWithReason.forEach(game => {
            const gameTags = Array.isArray(game.smart_tags) ? game.smart_tags : [];
            MAIN_TAG_POOL.forEach(tag => {
                if (matchesMappedTag(gameTags, tag)) {
                    validSet.add(tag);
                }
            });
        });

        res.json({
            success: true,
            games: gamesWithReason,
            totalPages: Math.ceil(totalCount / limit),
            currentPage,
            validTags: Array.from(validSet)
        });
    } catch (error) {
        console.error('Recommend API Error:', error);
        res.status(500).json({ success: false, message: '서버 에러' });
    }
});

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