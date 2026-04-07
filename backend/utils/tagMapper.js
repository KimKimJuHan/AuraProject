// backend/utils/tagMapper.js

const TAG_MAPPING = {
  "RPG": "RPG", "Role-Playing": "RPG", "Role Playing": "RPG", "JRPG": "RPG", "Action RPG": "RPG", "ARPG": "RPG",
  "FPS": "FPS", "First-Person Shooter": "FPS", "First Person Shooter": "FPS", "Shooter": "FPS",
  "Simulation": "시뮬레이션", "Sim": "시뮬레이션",
  "Strategy": "전략", "RTS": "전략", "Real Time Strategy": "전략", "Turn-Based Strategy": "전략", "Grand Strategy": "전략",
  "Sports": "스포츠", "Racing": "레이싱", "Puzzle": "퍼즐",
  "Survival": "생존", "Open World Survival Craft": "생존",
  "Horror": "공포", "Survival Horror": "공포", "Psychological Horror": "공포", "Scary": "공포",
  "Rhythm": "리듬", "Music": "리듬",
  "Action": "액션", "Hack and Slash": "액션", "Adventure": "어드벤처",
  "First-Person": "1인칭", "First Person": "1인칭", "1st Person": "1인칭",
  "Third-Person": "3인칭", "Third Person": "3인칭", "3rd Person": "3인칭",
  "Isometric": "쿼터뷰", "Top-Down": "탑다운", "Top Down": "탑다운",
  "Side Scroller": "사이드뷰", "Side-Scroller": "사이드뷰", "2D Platformer": "사이드뷰", "Platformer": "사이드뷰",
  "Pixel Graphics": "픽셀 그래픽", "Pixel": "픽셀 그래픽", "2D": "2D", "3D": "3D", "Cartoon": "만화 같은", "Anime": "애니메이션", "Realistic": "현실적", "Cute": "귀여운",
  "Fantasy": "판타지", "Sci-fi": "공상과학", "Sci-Fi": "공상과학", "Science Fiction": "공상과학", "Medieval": "중세", "Modern": "현대", "Space": "우주", "Zombies": "좀비", "Zombie": "좀비", "Cyberpunk": "사이버펑크", "Magic": "마법", "War": "전쟁", "Military": "전쟁", "Post-apocalyptic": "포스트아포칼립스", "Post Apocalyptic": "포스트아포칼립스",
  "Open World": "오픈 월드", "Open-World": "오픈 월드",
  "Resource Management": "자원관리", "Management": "자원관리", "Base Building": "자원관리",
  "Story Rich": "스토리 중심", "Narrative": "스토리 중심",
  "Choices Matter": "선택의 중요성", "Multiple Endings": "선택의 중요성",
  "Character Customization": "캐릭터 커스터마이즈",
  "Co-op": "협동 캠페인", "Co-Op": "협동 캠페인", "Coop": "협동 캠페인", "Online Co-Op": "협동 캠페인", "Local Co-Op": "협동 캠페인",
  "Multiplayer": "멀티플레이", "Multi-player": "멀티플레이", "Online PvP": "멀티플레이", "MMO": "멀티플레이",
  "PvP": "경쟁/PvP", "Competitive": "경쟁/PvP", "Esports": "경쟁/PvP",
  "Singleplayer": "싱글플레이", "Single-player": "싱글플레이",
  "Roguelike": "로그라이크", "Rogue-like": "로그라이크", "Roguelite": "로그라이크", "Rogue-lite": "로그라이크",
  "Souls-like": "소울라이크", "Soulslike": "소울라이크"
};

const REVERSE_MAP = {};
Object.keys(TAG_MAPPING).forEach(eng => {
    const kor = TAG_MAPPING[eng];
    if (!REVERSE_MAP[kor]) REVERSE_MAP[kor] = [];
    REVERSE_MAP[kor].push(eng);
});

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

function getQueryTags(koreanTag) {
    // 1. 공백을 모두 지운 상태로 역매핑 타겟 찾기
    const normalizedInput = koreanTag.replace(/\s+/g, '');
    let targetKorTag = koreanTag;
    
    for (const key of Object.keys(REVERSE_MAP)) {
        if (key.replace(/\s+/g, '') === normalizedInput) {
            targetKorTag = key;
            break;
        }
    }
    
    const originals = REVERSE_MAP[targetKorTag] || [];
    const searchPool = new Set([koreanTag, targetKorTag, normalizedInput]);
    if (normalizedInput === "사이드뷰") searchPool.add("횡스크롤");
    
    const finalRegexes = [];
    
    // 2. ★ 팩트: 한글 태그의 경우 글자 사이사이에 \s* 를 삽입하여 DB의 띄어쓰기 오차를 100% 무시함
    for (const tag of searchPool) {
        if (/[가-힣]/.test(tag)) {
            const chars = tag.replace(/\s+/g, '').split('');
            finalRegexes.push(new RegExp('^' + chars.join('\\s*') + '$', 'i'));
        } else {
            finalRegexes.push(new RegExp(`^${tag.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));
        }
    }

    for (const engTag of originals) {
        finalRegexes.push(new RegExp(`^${engTag.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));
    }

    return finalRegexes;
}

module.exports = { mapSteamTags, getQueryTags };