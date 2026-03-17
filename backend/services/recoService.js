// backend/services/recoService.js
const Game = require('../models/Game');
const TrendHistory = require('../models/TrendHistory');
const { getQueryTags } = require('../utils/tagMapper');

class RecoService {
  async getMainRecommendations({ tags, sortBy, page = 1, searchQuery }) {
    const limit = 15;
    const skip = (page - 1) * limit;
    const filter = { isAdult: { $ne: true } };

    // 1. 태그 필터링
    if (tags && tags.length > 0) {
        const andConditions = tags.map(tag => ({ smart_tags: { $in: getQueryTags(tag) } }));
        filter.$and = andConditions;
    }

    // 2. 검색어 필터링
    if (searchQuery) {
        const q = searchQuery.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        filter.$or = [
            { title: { $regex: q, $options: 'i' } }, 
            { title_ko: { $regex: q, $options: 'i' } }
        ];
    }

    // 3. 메타데이터 (유효 태그) 추출
    const allMatches = await Game.find(filter).select('smart_tags').lean();
    const validTagsSet = new Set();
    allMatches.forEach(g => {
        if (g.smart_tags) g.smart_tags.forEach(t => validTagsSet.add(t));
    });

    // 4. 정렬 조건 산출
    let sortRule = { trend_score: -1, _id: -1 };
    if (sortBy === 'discount') { 
        sortRule = { 'price_info.discount_percent': -1 }; 
        filter['price_info.discount_percent'] = { $gt: 0 }; 
    } else if (sortBy === 'new') {
        const now = new Date();
        filter.releaseDate = { $lte: now, $gte: new Date('2000-01-01') };
        sortRule = { releaseDate: -1 };
    } else if (sortBy === 'price') { 
        sortRule = { 'price_info.current_price': 1 }; 
        filter['price_info.current_price'] = { $gt: 0 }; 
        filter['price_info.isFree'] = { $ne: true };
    }

    // 5. 최종 데이터 쿼리
    const games = await Game.find(filter).sort(sortRule).skip(skip).limit(limit).lean();

    // 6. 결과 없음 처리 (인기 게임 폴백)
    if (allMatches.length === 0 && !searchQuery && (!tags || tags.length === 0)) {
        const popGames = await Game.find({ isAdult: { $ne: true } })
                                   .sort({ trend_score: -1 })
                                   .limit(20)
                                   .lean();
        return { games: popGames, totalPages: 1, validTags: [] };
    }

    return { 
        games, 
        totalPages: Math.ceil(allMatches.length / limit) || 1, 
        validTags: Array.from(validTagsSet) 
    };
  }

  async getGameDetail(slug) {
    return await Game.findOne({ slug }).lean();
  }

  async getGameHistory(slug) {
    const game = await Game.findOne({ slug }).select('steam_appid');
    if (!game) return null;
    return await TrendHistory.find({ steam_appid: game.steam_appid })
                             .sort({ recordedAt: 1 })
                             .limit(100)
                             .lean();
  }

  async getAutocomplete(query) {
    if (!query) return [];
    return await Game.find({
        $or: [{ title: { $regex: query, $options: 'i' } }, { title_ko: { $regex: query, $options: 'i' } }],
        isAdult: { $ne: true }
    }).select('title title_ko slug').limit(10).lean();
  }
}

module.exports = new RecoService();