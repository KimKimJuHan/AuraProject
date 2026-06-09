export function normalizeGameData(game) {
    if (!game) return game;
    
    // 1. 가격 데이터 무결성 보장
    if (game.price_info) {
        if (game.price_info.isFree || game.price_info.current_price === 0) {
            game.price_info.isFree = true;
            game.price_info.current_price = 0;
            game.price_info.discount_percent = 0;
            game.price_info.regular_price = 0;
        }
        
        // 딜 목록 가격 무결성
        if (Array.isArray(game.price_info.deals)) {
            game.price_info.deals = game.price_info.deals.map(deal => {
                if (deal.price === 0) deal.discount = 0;
                return deal;
            });
        }
    }

    // 2. 리뷰 데이터 무결성 보장 (크러시 방지)
    if (!game.steam_reviews) {
        game.steam_reviews = {};
    }
    if (!game.steam_reviews.overall) {
        game.steam_reviews.overall = { summary: '정보 없음', percent: 0, total: 0 };
    }
    
    // 3. 플레이타임 폴백 방지
    if (!game.play_time || typeof game.play_time !== 'object') {
        game.play_time = { extra: 0, completionist: 0, main: 0, raw: '정보 없음' };
    }

    return game;
}

export function normalizeGameList(games) {
    if (!Array.isArray(games)) return [];
    return games.map(normalizeGameData);
}
