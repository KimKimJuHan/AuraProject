/**
 * vector.js
 * 태그 기반 코사인 유사도 계산 유틸리티
 */

function calculateSimilarity(vecA, vecB) {
    const keysA = Object.keys(vecA);
    if (keysA.length === 0) return 0;

    let dot = 0, magA = 0, magB = 0;
    const allKeys = new Set([...keysA, ...Object.keys(vecB)]);

    for (const key of allKeys) {
        const a = vecA[key] || 0;
        const b = vecB[key] || 0;
        dot += a * b;
        magA += a * a;
        magB += b * b;
    }

    magA = Math.sqrt(magA);
    magB = Math.sqrt(magB);
    if (magA === 0 || magB === 0) return 0;
    return dot / (magA * magB);
}

function gameToVector(tags) {
    const vec = {};
    if (!Array.isArray(tags)) return vec;
    tags.forEach(tag => { if (tag) vec[tag] = 1; });
    return vec;
}

/**
 * 유저 프로필 벡터 생성
 *
 * 핵심 설계: "이미 너무 많이 플레이한 장르"는 가중치를 역으로 감소시켜
 * 새로운 장르 발견을 유도한다.
 * 
 * 예: 배그를 2000시간 플레이했으면 FPS/배틀로얄 태그가 포화 상태.
 * 이때 또 FPS 게임을 추천하는 건 의미없음.
 * → 포화 태그는 가중치 상한을 걸어서 다양성 확보.
 */
function userToVector(likedTags, steamGames) {
    const vec = {};

    // 1. 직접 선택한 태그: 가중치 6 (명시적 선호 = 강한 신호)
    if (Array.isArray(likedTags)) {
        likedTags.forEach(tag => {
            if (tag) vec[tag] = (vec[tag] || 0) + 6;
        });
    }

    // 2. Steam 플레이타임 기반 가중치
    if (Array.isArray(steamGames)) {
        // 태그별 누적 플레이타임 계산
        const tagPlaytime = {};
        steamGames.forEach(game => {
            const pt = game.playtime_forever || 0;
            if (pt < 30) return; // 30분 미만 무시
            if (Array.isArray(game.smart_tags)) {
                game.smart_tags.forEach(tag => {
                    tagPlaytime[tag] = (tagPlaytime[tag] || 0) + pt;
                });
            }
        });

        // 전체 최대 태그 플레이타임 (정규화 기준)
        const maxTagPlaytime = Math.max(...Object.values(tagPlaytime), 1);

        // 태그별 가중치 계산
        // - 로그 스케일로 플레이타임 반영
        // - 포화 태그 상한선: 전체의 30% 이상 차지하는 태그는 상한 적용
        //   (배그로 FPS 태그가 포화돼도 최대 3점으로 캡)
        for (const [tag, totalPt] of Object.entries(tagPlaytime)) {
            const ratio = totalPt / maxTagPlaytime;
            let weight = Math.log10(totalPt + 1);

            // 포화 태그 감쇠: 특정 장르에 너무 쏠리면 상한 적용
            // ratio 0.3 이상 (전체 플레이의 30%+) → 가중치 3 이하로 캡
            // ratio 0.5 이상 (절반 이상) → 가중치 2 이하로 캡
            if (ratio >= 0.5) weight = Math.min(weight, 2.0);
            else if (ratio >= 0.3) weight = Math.min(weight, 3.0);
            // 그 외는 최대 5점

            weight = Math.min(weight, 5.0);
            vec[tag] = (vec[tag] || 0) + weight;
        }
    }

    return vec;
}

module.exports = { calculateSimilarity, gameToVector, userToVector };