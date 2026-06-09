const { safeGetQueryTags } = require('./gameDictionary');

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

module.exports = {
    matchesMappedTag,
    getMainRecommendationReason,
    getWishlistReason
};
