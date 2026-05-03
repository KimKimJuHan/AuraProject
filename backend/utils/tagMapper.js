/**
 * tagMapper.js
 *
 * Steam 원본 태그 → 서비스 한국어 태그 변환 모듈
 *
 * 설계 원칙:
 * 1. Steam .app_tag 실제 표기 기준 (하이픈/공백 혼용 모두 등록)
 * 2. Steam appdetails API categories 기준도 포함
 * 3. 게이머 친화적 한국어 태그 사용
 * 4. 한 태그가 여러 카테고리에 걸치면 가장 대표적인 것 하나만 매핑
 * 5. Steam 시스템 태그(Achievements, Cloud 등)는 의도적으로 제외
 */

const TAG_MAPPING = {

    // ════════════════════════════════════════════════════════════
    // 장르
    // ════════════════════════════════════════════════════════════

    // RPG
    "RPG":                      "RPG",
    "Role-Playing":              "RPG",
    "JRPG":                     "RPG",
    "Action RPG":               "RPG",
    "Action-RPG":               "RPG",
    "Tactical RPG":             "RPG",
    "Turn-Based RPG":           "RPG",
    "ARPG":                     "RPG",
    "MMORPG":                   "RPG",
    "Dungeon Crawler":          "RPG",
    "Party-Based RPG":          "RPG",
    "CRPG":                     "RPG",

    // FPS / 슈터
    "FPS":                      "FPS",
    "First-Person Shooter":     "FPS",
    "Shooter":                  "FPS",
    "Tactical Shooter":         "FPS",
    "Hero Shooter":             "FPS",
    "Third-Person Shooter":     "FPS",
    "Battle Royale":            "배틀로얄",
    "Arena Shooter":            "FPS",
    "Bullet Hell":              "FPS",
    "Twin Stick Shooter":       "FPS",

    // 액션
    "Action":                   "액션",
    "Action-Adventure":         "액션",
    "Beat 'em up":              "액션",
    "Hack and Slash":           "액션",
    "Hack & Slash":             "액션",
    "Hack-and-Slash":           "액션",
    "Fighting":                 "격투",
    "Brawler":                  "격투",
    "Martial Arts":             "격투",
    "Action Roguelike":         "액션",
    "Combat":                   "액션",

    // 어드벤처
    "Adventure":                "어드벤처",
    "Point & Click":            "어드벤처",
    "Exploration":              "탐험",
    "Walking Simulator":        "어드벤처",
    "Narrative":                "스토리",
    "Visual Novel":             "비주얼노벨",
    "Interactive Fiction":      "비주얼노벨",
    "Interactive Drama":        "비주얼노벨",
    "Mystery":                  "추리",
    "Detective":                "추리",
    "Thriller":                 "스릴러",

    // 전략
    "Strategy":                 "전략",
    "RTS":                      "전략",
    "Real-Time Strategy":       "전략",
    "Turn-Based":               "턴제",
    "Turn-Based Strategy":      "턴제",
    "Turn-Based Tactics":       "턴제",
    "Turn-Based Combat":        "턴제",
    "Real-Time with Pause":     "전략",
    "Grand Strategy":           "전략",
    "4X":                       "전략",
    "Tower Defense":            "타워디펜스",
    "Real Time Tactics":        "전략",
    "Wargame":                  "전략",
    "Auto Battler":             "전략",
    "MOBA":                     "MOBA",

    // 시뮬레이션
    "Simulation":               "시뮬레이션",
    "Life Sim":                 "시뮬레이션",
    "Farming Sim":              "농장경영",
    "Farming":                  "농장경영",
    "Flight Sim":               "비행시뮬",
    "City Builder":             "도시건설",
    "Colony Sim":               "도시건설",
    "Building":                 "건설",
    "Management":               "경영",
    "Economy":                  "경영",
    "Business Sim":             "경영",
    "Automobile Sim":           "레이싱",
    "Space Sim":                "우주",
    "Vehicle Sim":              "시뮬레이션",
    "Political Sim":            "경영",

    // 스포츠
    "Sports":                   "스포츠",
    "Football":                 "스포츠",
    "Soccer":                   "스포츠",
    "Baseball":                 "스포츠",
    "Basketball":               "스포츠",
    "Tennis":                   "스포츠",
    "Golf":                     "스포츠",
    "Boxing":                   "스포츠",
    "Wrestling":                "스포츠",
    "Fishing":                  "낚시",
    "Hunting":                  "스포츠",

    // 레이싱
    "Racing":                   "레이싱",
    "Driving":                  "레이싱",
    "Motocross":                "레이싱",
    "Kart Racing":              "레이싱",

    // 퍼즐
    "Puzzle":                   "퍼즐",
    "Logic":                    "퍼즐",
    "Word Game":                "퍼즐",
    "Match 3":                  "퍼즐",
    "Escape Room":              "퍼즐",
    "Puzzle-Platformer":        "퍼즐",

    // 생존
    "Survival":                 "생존",
    "Survival Horror":          "서바이벌공포",
    "Battle Royale":            "배틀로얄",

    // 공포
    "Horror":                   "공포",
    "Psychological Horror":     "공포",
    "Jump Scare":               "공포",
    "Atmospheric Horror":       "공포",

    // 플랫포머
    "Platformer":               "플랫포머",
    "2D Platformer":            "플랫포머",
    "3D Platformer":            "플랫포머",
    "Precision Platformer":     "플랫포머",
    "Run and Gun":              "플랫포머",

    // 로그라이크
    "Roguelike":                "로그라이크",
    "Roguelite":                "로그라이크",
    "Rogue-like":               "로그라이크",
    "Rogue-lite":               "로그라이크",
    "Rogue Like":               "로그라이크",
    "Rogue Lite":               "로그라이크",
    "Procedural Generation":    "로그라이크",
    "Permadeath":               "로그라이크",

    // 소울라이크
    "Souls-like":               "소울라이크",
    "Soulslike":                "소울라이크",
    "Souls-Like":               "소울라이크",
    "Souls Like":               "소울라이크",

    // 메트로배니아
    "Metroidvania":             "메트로배니아",

    // 리듬
    "Rhythm":                   "리듬",
    "Music":                    "리듬",
    "Dance":                    "리듬",
    "Music-Based Procedural Generation": "리듬",
    "음악":                     "리듬",  // DB에 기존에 '음악'으로 저장된 것도 커버

    // 카드/덱빌딩
    "Card Game":                "카드게임",
    "Deckbuilder":              "카드게임",
    "Deckbuilding":             "카드게임",
    "Trading Card Game":        "카드게임",
    "Board Game":               "보드게임",
    "Tabletop":                 "보드게임",

    // ════════════════════════════════════════════════════════════
    // 시점 (Steam 실제 표기 — 하이픈 없음 버전 필수)
    // ════════════════════════════════════════════════════════════
    "First-Person":             "1인칭",
    "First Person":             "1인칭",   // Steam .app_tag 실제 표기
    "Third-Person":             "3인칭",
    "Third Person":             "3인칭",   // Steam .app_tag 실제 표기
    "Isometric":                "쿼터뷰",
    "Top-Down":                 "탑다운",
    "Top Down":                 "탑다운",
    "Top-Down Shooter":         "탑다운",
    "Side Scroller":            "횡스크롤",
    "Side-Scroller":            "횡스크롤",
    "2.5D":                     "횡스크롤",

    // ════════════════════════════════════════════════════════════
    // 그래픽 스타일
    // ════════════════════════════════════════════════════════════
    "Pixel Art":                "픽셀아트",
    "Pixel Graphics":           "픽셀아트",
    "Retro":                    "픽셀아트",
    "8-Bit":                    "픽셀아트",
    "8-bit":                    "픽셀아트",
    "16-Bit":                   "픽셀아트",
    "16-bit":                   "픽셀아트",
    "2D":                       "2D",
    "Hand-drawn":               "2D",
    "Hand Drawn":               "2D",
    "3D":                       "3D",
    "Low Poly":                 "3D",
    "Anime":                    "애니메이션풍",
    "Cartoon":                  "애니메이션풍",
    "Cel-shaded":               "애니메이션풍",
    "Cel Shaded":               "애니메이션풍",
    "Comic Book":               "애니메이션풍",
    "Stylized":                 "아트스타일",
    "Realistic":                "현실적",
    "Photorealistic":           "현실적",
    "Cute":                     "귀여운",
    "Colorful":                 "귀여운",
    "Family Friendly":          "캐주얼",
    "Wholesome":                "힐링",
    "Cozy":                     "힐링",
    "Relaxing":                 "힐링",
    "Casual":                   "캐주얼",

    // ════════════════════════════════════════════════════════════
    // 테마 / 세계관
    // ════════════════════════════════════════════════════════════
    "Fantasy":                  "판타지",
    "Dark Fantasy":             "다크판타지",
    "High Fantasy":             "판타지",
    "Magic":                    "판타지",
    "Dragons":                  "판타지",
    "Mythology":                "신화",
    "Supernatural":             "초자연",
    "Sci-fi":                   "SF",
    "Science Fiction":          "SF",
    "Futuristic":               "SF",
    "Aliens":                   "SF",
    "Cyberpunk":                "사이버펑크",
    "Steampunk":                "스팀펑크",
    "Space":                    "우주",
    "Outer Space":              "우주",
    "Space Exploration":        "우주",
    "Medieval":                 "중세",
    "Historical":               "역사",
    "Ancient":                  "역사",
    "World War II":             "2차세계대전",
    "World War I":              "역사",
    "Military":                 "밀리터리",
    "War":                      "전쟁",
    "Modern":                   "현대",
    "Contemporary":             "현대",
    "Western":                  "서부",
    "Zombie":                   "좀비",
    "Zombies":                  "좀비",
    "Vampire":                  "뱀파이어",
    "Post-Apocalyptic":         "포스트아포칼립스",
    "Post Apocalyptic":         "포스트아포칼립스",
    "Apocalypse":               "포스트아포칼립스",
    "Dystopian":                "디스토피아",
    "Lovecraftian":             "공포",
    "Psychological":            "심리",
    "Pirates":                  "해적",
    "Ninja":                    "닌자",
    "Noir":                     "느와르",

    // ════════════════════════════════════════════════════════════
    // 플레이 특징
    // ════════════════════════════════════════════════════════════
    "Open World":               "오픈월드",
    "Open-World":               "오픈월드",
    "Sandbox":                  "샌드박스",
    "Crafting":                 "제작",
    "Resource Management":      "자원관리",
    "Base Building":            "기지건설",
    "Mining":                   "자원관리",
    "Story Rich":               "스토리",
    "Lore-Rich":                "스토리",
    "Choices Matter":           "선택지",
    "Multiple Endings":         "멀티엔딩",
    "다중결말":                 "멀티엔딩",  // 혹시 한국어로 저장된 경우 커버
    "Branching Storylines":     "선택지",
    "Character Customization":  "캐릭터커스텀",
    "Character Creation":       "캐릭터커스텀",
    "Difficult":                "고난이도",
    "Hardcore":                 "고난이도",
    "Unforgiving":              "고난이도",
    "Atmospheric":              "분위기",
    "Dark":                     "다크",
    "Gore":                     "고어",
    "Violent":                  "폭력적",
    "Funny":                    "코미디",
    "Comedy":                   "코미디",
    "Emotional":                "감성",
    "Great Soundtrack":         "음악",
    "Female Protagonist":       "여성주인공",
    "Political":                "정치",

    // ════════════════════════════════════════════════════════════
    // 멀티플레이 (Steam appdetails categories 표기 포함)
    // ════════════════════════════════════════════════════════════
    "Multiplayer":              "멀티플레이",
    "Multi-player":             "멀티플레이",
    "Online Multiplayer":       "멀티플레이",
    "Online PvP":               "PvP",
    "Online PvE":               "협동",
    "MMO":                      "MMO",
    "MMORPG":                   "MMO",
    "Massively Multiplayer":    "MMO",
    "Singleplayer":             "싱글플레이",
    "Single-player":            "싱글플레이",
    "Co-op":                    "협동",
    "Co-Op":                    "협동",
    "Online Co-Op":             "협동",
    "Online Co-op":             "협동",
    "Local Co-Op":              "로컬협동",
    "Local Co-op":              "로컬협동",
    "Co-Op Campaign":           "협동",
    "Cooperative":              "협동",
    "Local Multiplayer":        "로컬멀티",
    "Shared/Split Screen Co-op": "로컬협동",
    "Split Screen":             "로컬멀티",
    "Cross-Platform Multiplayer": "멀티플레이",
    "PvP":                      "PvP",
    "PvE":                      "협동",
    "Competitive":              "경쟁",
    "eSports":                  "e스포츠",
    "Team-Based":               "팀기반",
    "Asynchronous Multiplayer": "멀티플레이",
};

// ── 역매핑 자동 생성 (한국어 → 영어 목록) ─────────────────────────────────────
const REVERSE_MAP = {};
Object.entries(TAG_MAPPING).forEach(([eng, kor]) => {
    if (!REVERSE_MAP[kor]) REVERSE_MAP[kor] = [];
    REVERSE_MAP[kor].push(eng);
});

/**
 * Steam 원본 태그 배열 → 한국어 smart_tags 변환 (수집기용)
 * @param {string[]} steamTags
 * @returns {string[]}
 */
function mapSteamTags(steamTags) {
    if (!Array.isArray(steamTags)) return [];
    const mapped = new Set();
    for (const tag of steamTags) {
        const trimmed = String(tag).trim();
        // 1. 정확히 일치
        if (TAG_MAPPING[trimmed]) {
            mapped.add(TAG_MAPPING[trimmed]);
            continue;
        }
        // 2. 대소문자 무시 일치
        const lowerTrimmed = trimmed.toLowerCase();
        const key = Object.keys(TAG_MAPPING).find(k => k.toLowerCase() === lowerTrimmed);
        if (key) mapped.add(TAG_MAPPING[key]);
    }
    return Array.from(mapped);
}

/**
 * 한국어 UI 태그 → DB 검색용 정규식 배열 (추천/검색용)
 * smart_tags는 한국어로 저장되므로 한국어 직접 매칭 + 역매핑 영어 원본도 함께 검색
 * @param {string} koreanTag
 * @returns {RegExp[]}
 */
function getQueryTags(koreanTag) {
    if (!koreanTag) return [];

    const searchTerms = new Set();
    const normalized = koreanTag.trim().replace(/\s+/g, '').toLowerCase();

    // 1. 입력값 그대로 (한국어 직접 매칭)
    searchTerms.add(koreanTag.trim());

    // 2. REVERSE_MAP에서 동의어 한국어 태그 찾기
    for (const kor of Object.keys(REVERSE_MAP)) {
        if (kor.replace(/\s+/g, '').toLowerCase() === normalized) {
            searchTerms.add(kor);
            // 해당 한국어 태그의 모든 영어 원본 추가 (tags 필드 검색용)
            REVERSE_MAP[kor].forEach(eng => searchTerms.add(eng));
            break;
        }
    }

    // 3. 입력값이 영어인 경우 TAG_MAPPING 직접 조회
    if (TAG_MAPPING[koreanTag.trim()]) {
        searchTerms.add(TAG_MAPPING[koreanTag.trim()]);
    }

    // 4. RegExp 생성 (앞뒤 정확히 일치, 대소문자 무시)
    const regexes = [];
    for (const term of searchTerms) {
        if (!term) continue;
        const escaped = String(term).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        regexes.push(new RegExp('^' + escaped + '$', 'i'));
    }

    return regexes;
}

module.exports = { mapSteamTags, getQueryTags, TAG_MAPPING, REVERSE_MAP };