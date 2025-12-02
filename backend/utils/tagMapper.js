// backend/utils/tagMapper.js

const TAG_MAPPING = {
  // === 장르 ===
  "RPG": "RPG",
  "Role-Playing": "RPG",
  "JRPG": "RPG",
  "Action RPG": "RPG",
  
  "FPS": "FPS",
  "First-Person Shooter": "FPS",
  "Shooter": "FPS",
  
  "Simulation": "시뮬레이션",
  "Strategy": "전략",
  "RTS": "전략",
  "Turn-Based Strategy": "전략",
  "Grand Strategy": "전략",
  
  "Sports": "스포츠",
  "Racing": "레이싱",
  "Puzzle": "퍼즐",
  "Survival": "생존",
  "Open World Survival Craft": "생존",
  "Horror": "공포",
  "Survival Horror": "공포",
  "Psychological Horror": "공포",
  "Rhythm": "리듬",
  "Music": "리듬",
  "Action": "액션",
  "Hack and Slash": "액션",
  "Adventure": "어드벤처",
  
  // === 시점 ===
  "First-Person": "1인칭",
  "Third-Person": "3인칭",
  "Third Person": "3인칭",
  "Isometric": "쿼터뷰",
  "Top-Down": "탑다운",
  "Side Scroller": "횡스크롤",
  "2D Platformer": "횡스크롤",

  // === 그래픽 ===
  "Pixel Graphics": "픽셀 그래픽",
  "2D": "2D",
  "3D": "3D",
  "Cartoon": "만화 같은",
  "Anime": "애니메이션",
  "Realistic": "현실적",
  "Cute": "귀여운",
  
  // === 테마 ===
  "Fantasy": "판타지",
  "Sci-fi": "공상과학",
  "Sci-Fi": "공상과학",
  "Medieval": "중세",
  "Modern": "현대",
  "Space": "우주",
  "Zombies": "좀비",
  "Cyberpunk": "사이버펑크",
  "Magic": "마법",
  "War": "전쟁",
  "Military": "전쟁",
  "Post-apocalyptic": "포스트아포칼립스",
  
  // === 특징 ===
  "Open World": "오픈 월드",
  "Resource Management": "자원관리",
  "Management": "자원관리",
  "Story Rich": "스토리 중심",
  "Narrative": "스토리 중심",
  "Choices Matter": "선택의 중요성",
  "Character Customization": "캐릭터 커스터마이즈",
  "Co-op": "협동 캠페인",
  "Online Co-Op": "협동 캠페인",
  "Multiplayer": "멀티플레이",
  "PvP": "경쟁/PvP",
  "Competitive": "경쟁/PvP",
  "Singleplayer": "싱글플레이",
  "Roguelike": "로그라이크",
  "Roguelite": "로그라이크",
  "Souls-like": "소울라이크"
};

// 역방향 매핑 (한글 -> [영어1, 영어2, ...])
const REVERSE_MAP = {};
Object.keys(TAG_MAPPING).forEach(eng => {
    const kor = TAG_MAPPING[eng];
    if (!REVERSE_MAP[kor]) REVERSE_MAP[kor] = [];
    REVERSE_MAP[kor].push(eng);
});

// 스팀 태그를 한글로 변환
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

// ★ [핵심] 한글 태그를 넣으면 대소문자 구분 없는 정규식 배열 반환
function getQueryTags(koreanTag) {
    const originals = REVERSE_MAP[koreanTag] || [];
    // 한글 자체와 매핑된 영어 태그들을 모두 정규식으로 변환 (정확한 매칭)
    const allTags = [koreanTag, ...originals];
    // 예: /^Action$/i (대소문자 무시, 정확히 Action인 것)
    return allTags.map(t => new RegExp(`^${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));
}

module.exports = { mapSteamTags, getQueryTags };