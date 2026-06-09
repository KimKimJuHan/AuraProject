export function normalizeGameData(game) {
    if (!game) return game;
    
    const normalized = { ...game };
    
    // 1. 가격 데이터 무결성 보장
    if (normalized.price_info) {
        normalized.price_info = { ...normalized.price_info };
        if (normalized.price_info.isFree || normalized.price_info.current_price === 0) {
            normalized.price_info.isFree = true;
            normalized.price_info.current_price = 0;
            normalized.price_info.discount_percent = 0;
            normalized.price_info.regular_price = 0;
        }
        
        // 딜 목록 가격 무결성
        if (Array.isArray(normalized.price_info.deals)) {
            normalized.price_info.deals = normalized.price_info.deals.map(deal => {
                const newDeal = { ...deal };
                if (newDeal.price === 0) newDeal.discount = 0;
                return newDeal;
            });
        }
    }

    // 2. 리뷰 데이터 무결성 보장 (크러시 방지)
    if (!normalized.steam_reviews) {
        normalized.steam_reviews = {};
    } else {
        normalized.steam_reviews = { ...normalized.steam_reviews };
    }
    
    if (!normalized.steam_reviews.overall) {
        normalized.steam_reviews.overall = { summary: '정보 없음', percent: 0, total: 0 };
    }
    
    // 3. 플레이타임 폴백 방지
    if (!normalized.play_time || typeof normalized.play_time !== 'object') {
        normalized.play_time = { extra: 0, completionist: 0, main: 0, raw: '정보 없음' };
    }

    return normalized;
}

export function normalizeGameList(games) {
    if (!Array.isArray(games)) return [];
    return games.map(normalizeGameData);
}
