const Game = require('../models/Game');
const TrendHistory = require('../models/TrendHistory');
const { getQueryTags } = require('../utils/tagMapper');

class RecoService {
  async getMainRecommendations({ tags, sortBy, page = 1, searchQuery }) {
    const limit = 15;
    const skip = (page - 1) * limit;
    const filter = { isAdult: { $ne: true } };

    // ★ 오류 수정: 교집합($and)이 아닌 합집합($in)으로 변경하여 태그 증발(0개) 현상 방어
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

    // 1. 합집합 조건으로 매칭되는 모든 게임의 태그만 먼저 긁어옴 (빠른 연산을 위해)
    const allMatches = await Game.find(filter).select('smart_tags').lean();
    
    // 2. validTags 계산: 합집합 방식이므로 유저가 다른 태그를 자유롭게 누를 수 있도록 제한을 대폭 완화함
    const validTagsSet = new Set();
    allMatches.forEach(g => {
        if (g.smart_tags) g.smart_tags.forEach(t => validTagsSet.add(t));
    });

    // 3. 정렬 룰 기본값 설정
    let sortRule = {};
    if (sortBy === 'popular') {
        sortRule = { steam_ccu: -1, "steam_reviews.overall.total": -1 };
    } else if (sortBy === 'discount') { 
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

    let games = [];

    // ★ 태그 선택 유무에 따른 분기 처리 (가중치 정렬 적용)
    if (tags && tags.length > 0) {
        // 태그를 선택했다면, DB에서 정렬 없이 다 가져와서 메모리에서 가중치(matchCount)로 정렬함
        let candidateGames = await Game.find(filter).lean();
        
        let mappedTags = [];
        tags.forEach(tag => { mappedTags = mappedTags.concat(getQueryTags(tag)); });

        candidateGames = candidateGames.map(game => {
            const matchCount = (game.smart_tags || []).filter(t => mappedTags.includes(t)).length;
            return { ...game, matchCount };
        });

        // 정렬 1순위: 매칭된 태그 갯수 (많을수록 위로) / 2순위: 유저가 선택한 탭(인기, 신규 등)
        candidateGames.sort((a, b) => {
            if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
            
            if (sortBy === 'popular') return (b.steam_ccu || 0) - (a.steam_ccu || 0);
            if (sortBy === 'discount') return (b.price_info?.discount_percent || 0) - (a.price_info?.discount_percent || 0);
            if (sortBy === 'price') return (a.price_info?.current_price || 0) - (b.price_info?.current_price || 0);
            if (sortBy === 'new') return new Date(b.releaseDate || 0) - new Date(a.releaseDate || 0);
            return 0;
        });

        // 메모리에서 정렬 후 페이지네이션 잘라내기
        games = candidateGames.slice(skip, skip + limit);

    } else {
        // 태그를 선택하지 않았다면 DB 레벨에서 바로 정렬 및 페이지네이션 (성능 최적화)
        games = await Game.find(filter).sort(sortRule).skip(skip).limit(limit).lean();
    }

    // 아무 조건 없이 초기 메인 화면일 때
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
    
    // DB 수정 없이 최신 데이터 30개를 가져와 차트에 맞게 정렬
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