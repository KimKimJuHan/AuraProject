// 코사인 유사도 계산 (변경 없음)
function calculateSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let magA = 0;
    let magB = 0;
    
    const allTags = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);
    
    allTags.forEach(tag => {
        const valA = vecA[tag] || 0;
        const valB = vecB[tag] || 0;
        dotProduct += valA * valB;
        magA += valA * valA;
        magB += valB * valB;
    });
    
    magA = Math.sqrt(magA);
    magB = Math.sqrt(magB);
    
    if (magA === 0 || magB === 0) return 0;
    return dotProduct / (magA * magB);
}

// 게임 태그를 벡터로 변환 (1: 있음)
function gameToVector(tags) {
    const vec = {};
    if (Array.isArray(tags)) {
        tags.forEach(tag => vec[tag] = 1);
    }
    return vec;
}

/**
 * 사용자 프로필 벡터 생성 (핵심)
 * @param {Array} likedTags - 사용자가 직접 선택한 선호 태그
 * @param {Array} steamGames - 스팀 라이브러리 게임 목록 (Tags 포함)
 */
function userToVector(likedTags, steamGames) {
    const vec = {};

    // 1. 직접 선택한 태그 (가중치 5점)
    if (Array.isArray(likedTags)) {
        likedTags.forEach(tag => vec[tag] = (vec[tag] || 0) + 5);
    }

    // 2. 스팀 플레이 기록 기반 가중치
    if (Array.isArray(steamGames)) {
        steamGames.forEach(game => {
            // 플레이 시간(분)을 로그 스케일로 변환하여 가중치 부여
            // 예: 60분 -> 1점, 600분 -> 2점, 6000분 -> 3점
            const weight = Math.log10(game.playtime_forever + 1); 
            
            if (game.tags && Array.isArray(game.tags)) {
                game.tags.forEach(tag => {
                    vec[tag] = (vec[tag] || 0) + weight;
                });
            }
        });
    }

    return vec;
}

module.exports = { calculateSimilarity, gameToVector, userToVector };