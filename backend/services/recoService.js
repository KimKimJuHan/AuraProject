// backend/services/recoService.js
const Game = require('../models/Game');
const TrendHistory = require('../models/TrendHistory');
const { getQueryTags } = require('../utils/tagMapper');

class RecoService {
  async getMainRecommendations({ tags, sortBy, page = 1, searchQuery }) {
    const limit = 15;
    const skip = (page - 1) * limit;
    const filter = { isAdult: { $ne: true } };

    // ★ 수정: 교집합($and) -> 합집합($in)으로 변경하여 태그를 누를수록 게임이 사라지는 현상 방지
    if (tags && tags.length > 0) {
        let mappedTags = [];
        tags.forEach(tag => {
            mappedTags = mappedTags.concat(getQueryTags(tag));
        });
        filter.smart_tags = { $in: mappedTags };
    }

    if (searchQuery) {
        const q = searchQuery.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        filter.$or = [
            { title: { $regex: q, $options: 'i' } }, 
            { title_ko: { $regex: q, $options: 'i' } }
        ];
    }

    // 빠른 연산을 위해 매칭되는 게임들의 태그만 먼저 추출
    const allMatches = await Game.find(filter).select('smart_tags').lean();
    
    // validTags 설정: 다른 태그 버튼이 비활성화되지 않도록 유연하게 허용
    const validTagsSet = new Set();
    allMatches.forEach(g => {
        if (g.smart_tags) g.smart_tags.forEach(t => validTagsSet.add(t));
    });

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
    } else if (sortBy === 'popular') {
        sortRule = { steam_ccu: -1, "steam_reviews.overall.total": -1 };
    }

    let games = [];

    // ★ 핵심: 태그 선택 시 메모리에서 '가중치(matchCount)' 기반으로 직접 정렬
    if (tags && tags.length > 0) {
        let candidateGames = await Game.find(filter).lean();
        
        let mappedTags = [];
        tags.forEach(tag => { mappedTags = mappedTags.concat(getQueryTags(tag)); });

        candidateGames = candidateGames.map(game => {
            const matchCount = (game.smart_tags || []).filter(t => mappedTags.includes(t)).length;
            return { ...game, matchCount };
        });

        candidateGames.sort((a, b) => {
            // 1순위: 선택한 태그를 많이 가진 게임이 무조건 상단 노출
            if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount; 
            
            // 2순위: 유저가 누른 탭(인기, 신규, 할인 등) 기준 정렬
            if (sortBy === 'popular') return (b.steam_ccu || 0) - (a.steam_ccu || 0);
            if (sortBy === 'discount') return (b.price_info?.discount_percent || 0) - (a.price_info?.discount_percent || 0);
            if (sortBy === 'price') return (a.price_info?.current_price || 0) - (b.price_info?.current_price || 0);
            if (sortBy === 'new') return new Date(b.releaseDate || 0) - new Date(a.releaseDate || 0);
            return 0;
        });

        games = candidateGames.slice(skip, skip + limit);
    } else {
        games = await Game.find(filter).sort(sortRule).skip(skip).limit(limit).lean();
    }

    if (allMatches.length === 0 && !searchQuery && (!tags || tags.length === 0)) {
        const popGames = await Game.find({ isAdult: { $ne: true } })
                                   .sort({ steam_ccu: -1, "steam_reviews.overall.total": -1 })
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
    
    // DB 수정 없이, 가장 최신 데이터 30개를 가져와 차트에 맞게 정렬합니다.
    const history = await TrendHistory.find({ steam_appid: game.steam_appid })
                             .sort({ recordedAt: -1 })
                             .limit(30)
                             .lean();
                             
    return history.reverse();
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