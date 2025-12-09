// backend/utils/tagMapper.js

const TAG_MAPPING = {
  // === 장르 ===
  "RPG": "RPG",
  "Role-Playing": "RPG",
  "Role Playing": "RPG", // 띄어쓰기 추가
  "JRPG": "RPG",
  "Action RPG": "RPG",
  "ARPG": "RPG",
  
  "FPS": "FPS",
  "First-Person Shooter": "FPS",
  "First Person Shooter": "FPS", // 띄어쓰기 추가
  "Shooter": "FPS",
  
  "Simulation": "시뮬레이션",
  "Sim": "시뮬레이션",
  
  "Strategy": "전략",
  "RTS": "전략",
  "Real Time Strategy": "전략",
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
  "Scary": "공포",
  
  "Rhythm": "리듬",
  "Music": "리듬",
  
  "Action": "액션",
  "Hack and Slash": "액션",
  "Adventure": "어드벤처",
  
  // === 시점 ===
  "First-Person": "1인칭",
  "First Person": "1인칭", // ★ 핵심 수정 (띄어쓰기 추가)
  "1st Person": "1인칭",
  
  "Third-Person": "3인칭",
  "Third Person": "3인칭", // ★ 핵심 수정
  "3rd Person": "3인칭",
  
  "Isometric": "쿼터뷰",
  "Top-Down": "탑다운",
  "Top Down": "탑다운",
  
  "Side Scroller": "사이드뷰",
  "Side-Scroller": "사이드뷰",
  "2D Platformer": "사이드뷰",
  "Platformer": "사이드뷰",

  // === 그래픽 ===
  "Pixel Graphics": "픽셀 그래픽",
  "Pixel": "픽셀 그래픽",
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
  "Science Fiction": "공상과학",
  "Medieval": "중세",
  "Modern": "현대",
  "Space": "우주",
  "Zombies": "좀비",
  "Zombie": "좀비",
  "Cyberpunk": "사이버펑크",
  "Magic": "마법",
  "War": "전쟁",
  "Military": "전쟁",
  "Post-apocalyptic": "포스트아포칼립스",
  "Post Apocalyptic": "포스트아포칼립스",
  
  // === 특징 ===
  "Open World": "오픈 월드",
  "Open-World": "오픈 월드",
  
  "Resource Management": "자원관리",
  "Management": "자원관리",
  "Base Building": "자원관리",
  
  "Story Rich": "스토리 중심",
  "Narrative": "스토리 중심",
  
  "Choices Matter": "선택의 중요성",
  "Multiple Endings": "선택의 중요성",
  
  "Character Customization": "캐릭터 커스터마이즈",
  
  "Co-op": "협동 캠페인",
  "Co-Op": "협동 캠페인",
  "Coop": "협동 캠페인",
  "Online Co-Op": "협동 캠페인",
  "Local Co-Op": "협동 캠페인",
  
  "Multiplayer": "멀티플레이",
  "Multi-player": "멀티플레이",
  "Online PvP": "멀티플레이",
  "MMO": "멀티플레이",
  
  "PvP": "경쟁/PvP",
  "Competitive": "경쟁/PvP",
  "Esports": "경쟁/PvP",
  
  "Singleplayer": "싱글플레이",
  "Single-player": "싱글플레이",
  
  "Roguelike": "로그라이크",
  "Rogue-like": "로그라이크",
  "Roguelite": "로그라이크",
  "Rogue-lite": "로그라이크",
  
  "Souls-like": "소울라이크",
  "Soulslike": "소울라이크"
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
    // 1. 정확한 매핑 확인
    if (TAG_MAPPING[tag]) {
      mapped.add(TAG_MAPPING[tag]);
    } else {
        // 2. 대소문자 무시 매핑 확인
        const key = Object.keys(TAG_MAPPING).find(k => k.toLowerCase() === tag.toLowerCase());
        if (key) mapped.add(TAG_MAPPING[key]);
    }
  });
  return Array.from(mapped);
}

// ★ [핵심] 한글 태그를 넣으면 관련된 모든 영문 태그(띄어쓰기 포함)를 찾는 정규식 반환
function getQueryTags(koreanTag) {
    const originals = REVERSE_MAP[koreanTag] || [];
    const allTags = [koreanTag, ...originals];

    // 사이드뷰 검색 시 횡스크롤도 같이 찾기
    if (koreanTag === "사이드뷰") {
        allTags.push("횡스크롤");
    }

    // 예: /^First Person$/i, /^First-Person$/i 모두 생성
    return allTags.map(t => new RegExp(`^${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));
}

module.exports = { mapSteamTags, getQueryTags };