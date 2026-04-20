const TAG_MAPPING = {
  // ★ [수정] 3단계 등급 시스템 매핑 적용
  "Casual": "beginner", "Relaxing": "beginner", "Family Friendly": "beginner", "Cozy": "beginner",
  "Difficult": "intermediate", "Hardcore": "intermediate", "Unforgiving": "intermediate",
  "Great Soundtrack": "streamer", "Trending": "streamer", "Difficult": "streamer", // 스트리머는 도전적이거나 화제성 중심

  // 장르 및 테마 (기존 데이터 100% 보존)
  "RPG": "RPG", "Role-Playing": "RPG", "JRPG": "RPG", "Action RPG": "RPG",
  "FPS": "FPS", "First-Person Shooter": "FPS", "Shooter": "FPS",
  "Simulation": "시뮬레이션", "Strategy": "전략", "RTS": "전략",
  "Sports": "스포츠", "Racing": "레이싱", "Puzzle": "퍼즐",
  "Survival": "생존", "Horror": "공포", "Rhythm": "리듬",
  "Action": "액션", "Adventure": "어드벤처",
  "First-Person": "1인칭", "Third-Person": "3인칭", 
  "Isometric": "쿼터뷰", "Top-Down": "탑다운", "Side Scroller": "사이드뷰", "Platformer": "사이드뷰",
  "Pixel Graphics": "픽셀 그래픽", "2D": "2D", "3D": "3D", "Anime": "애니메이션", "Realistic": "현실적",
  "Fantasy": "판타지", "Sci-fi": "공상과학", "Medieval": "중세", "Cyberpunk": "사이버펑크",
  "Open World": "오픈 월드", "Story Rich": "스토리 중심", "Choices Matter": "선택의 중요성",
  "Co-op": "협동 캠페인", "Multiplayer": "멀티플레이", "PvP": "경쟁/PvP", "Singleplayer": "싱글플레이",
  "Roguelike": "로그라이크", "Souls-like": "소울라이크"
};

// 역매핑 (한국어 -> 영어 목록)
const REVERSE_MAP = {};
Object.keys(TAG_MAPPING).forEach(eng => {
    const kor = TAG_MAPPING[eng];
    if (!REVERSE_MAP[kor]) REVERSE_MAP[kor] = [];
    REVERSE_MAP[kor].push(eng);
});

/**
 * 스팀 원본 태그를 우리 서비스의 한국어 태그로 변환 (수집기용)
 */
function mapSteamTags(steamTags) {
  if (!steamTags || !Array.isArray(steamTags)) return [];
  const mapped = new Set();
  steamTags.forEach(tag => {
    if (TAG_MAPPING[tag]) {
      mapped.add(TAG_MAPPING[tag]);
    } else {
        const key = Object.keys(TAG_MAPPING).find(k => k.toLowerCase() === tag.toLowerCase());
        if (key) mapped.add(TAG_MAPPING[key]);
    }
  });
  return Array.from(mapped);
}

/**
 * 한국어 태그 입력을 DB 검색용 정규식 배열로 변환 (검색/추천용)
 */
function getQueryTags(koreanTag) {
    if (!koreanTag) return [];

    const normalizedInput = koreanTag.replace(/\s+/g, '');
    let targetKorTag = koreanTag;
    
    // 1. 역매핑 테이블에서 표준 한국어 태그 찾기
    for (const key of Object.keys(REVERSE_MAP)) {
        if (key.replace(/\s+/g, '') === normalizedInput) {
            targetKorTag = key;
            break;
        }
    }
    
    const originals = REVERSE_MAP[targetKorTag] || [];
    const searchPool = new Set([koreanTag, targetKorTag, normalizedInput]);
    
    // 유연한 매핑 추가
    if (normalizedInput === "사이드뷰" || normalizedInput === "횡스크롤") {
        searchPool.add("사이드뷰");
        searchPool.add("횡스크롤");
        searchPool.add("Side Scroller");
        searchPool.add("Platformer");
    }
    
    const finalRegexes = [];
    
    for (const tag of searchPool) {
        if (!tag) continue;
        
        // 정규식 특수문자 이스케이프
        const escaped = tag.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        if (/[가-힣]/.test(tag)) {
            // 한글인 경우: 띄어쓰기 무시 로직 적용
            // ★ 수정: ^와 $를 제거하여 '부분 일치' 허용 ("2D" 입력 시 "2D 플랫폼" 검색 가능)
            const chars = tag.replace(/\s+/g, '').split('');
            finalRegexes.push(new RegExp(chars.join('\\s*'), 'i'));
        } else {
            // 영문인 경우: 부분 일치 허용
            finalRegexes.push(new RegExp(escaped, 'i'));
        }
    }

    // 영어 원본 태그들도 정규식 풀에 추가
    for (const engTag of originals) {
        finalRegexes.push(new RegExp(engTag.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    }

    return finalRegexes;
}

module.exports = { mapSteamTags, getQueryTags };