// 스팀(영어) 태그 -> 내 프로젝트(한글) 태그 매핑 사전
const TAG_DICTIONARY = {
    // [장르: RPG]
    "rpg": "RPG",
    "role-playing": "RPG",
    "jrpg": "RPG",
    "crpg": "RPG",
    "arpg": "RPG",
    "action rpg": "RPG",
    "strategy rpg": "RPG",
    "party-based rpg": "RPG",

    // [장르: 액션/슈팅]
    "action": "액션",
    "action-adventure": "액션",
    "hack and slash": "액션",
    "beat 'em up": "액션",
    "fps": "FPS",
    "shooter": "FPS",
    "first-person shooter": "FPS",
    "third-person shooter": "TPS",
    "sniper": "FPS",
    "looter shooter": "FPS",

    // [장르: 시뮬레이션/전략]
    "simulation": "시뮬레이션",
    "sim": "시뮬레이션",
    "management": "시뮬레이션",
    "building": "시뮬레이션",
    "city builder": "시뮬레이션",
    "farming sim": "시뮬레이션",
    "strategy": "전략",
    "rts": "전략",
    "turn-based strategy": "전략",
    "grand strategy": "전략",
    "4x": "전략",
    "tower defense": "전략",
    "card game": "전략",
    "card battler": "전략",
    "deckbuilding": "전략",

    // [장르: 어드벤처/퍼즐]
    "adventure": "어드벤처",
    "puzzle": "퍼즐",
    "logic": "퍼즐",
    "puzzle-platformer": "퍼즐",
    "mystery": "어드벤처",
    "exploration": "어드벤처",
    "walking simulator": "어드벤처",
    "visual novel": "어드벤처",
    "metroidvania": "어드벤처",

    // [장르: 기타]
    "sports": "스포츠",
    "racing": "레이싱",
    "driving": "레이싱",
    "survival": "생존",
    "survival horror": "생존",
    "crafting": "생존",
    "horror": "공포",
    "psychological horror": "공포",
    "zombies": "공포",
    "roguelike": "로그라이크",
    "rogue-like": "로그라이크",
    "roguelite": "로그라이크",
    "rogue-lite": "로그라이크",
    "souls-like": "소울라이크",
    "difficult": "소울라이크",
    "platformer": "플랫포머",
    "2d platformer": "플랫포머",
    "3d platformer": "플랫포머",

    // [특징: 플레이 방식]
    "open world": "오픈 월드",
    "open-world": "오픈 월드",
    "sandbox": "오픈 월드",
    "co-op": "협동",
    "online co-op": "협동",
    "local co-op": "협동",
    "multiplayer": "멀티플레이",
    "online pvp": "경쟁",
    "pvp": "경쟁",
    "esports": "경쟁",
    "singleplayer": "싱글플레이",
    "single-player": "싱글플레이",

    // [특징: 분위기/스타일]
    "story rich": "스토리 중심",
    "narrative": "스토리 중심",
    "great soundtrack": "사운드트랙",
    "atmospheric": "분위기 있는",
    "fantasy": "판타지",
    "sci-fi": "SF",
    "cyberpunk": "SF",
    "space": "SF",
    "medieval": "중세",
    "anime": "애니메이션",
    "cute": "귀여운",
    "pixel graphics": "픽셀 그래픽",
    "retro": "픽셀 그래픽",
    "2d": "2D",
    "3d": "3D"
};

/**
 * 스팀 태그 리스트를 받아 우리 프로젝트의 표준 태그로 변환하는 함수
 * @param {Array} rawTags - 스팀 API에서 받은 태그 배열 (예: ["Action", "FPS", "Shooter"])
 * @returns {Array} - 중복 제거된 표준 태그 배열 (예: ["액션", "FPS"])
 */
function mapSteamTags(rawTags) {
    if (!rawTags || !Array.isArray(rawTags)) return [];

    const smartTags = new Set();

    rawTags.forEach(tag => {
        if (!tag) return;
        const lowerTag = tag.toLowerCase().trim();

        // 1. 정확히 일치하는 경우
        if (TAG_DICTIONARY[lowerTag]) {
            smartTags.add(TAG_DICTIONARY[lowerTag]);
        } 
        // 2. 부분 일치 검사 (Dictionary 키가 태그에 포함된 경우)
        else {
            for (const [key, value] of Object.entries(TAG_DICTIONARY)) {
                if (lowerTag.includes(key)) {
                    smartTags.add(value);
                    break; // 하나 매칭되면 중단 (너무 많은 태그 방지)
                }
            }
        }
    });

    return Array.from(smartTags);
}

module.exports = { mapSteamTags };