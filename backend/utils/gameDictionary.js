// 한글 게임 약칭 매핑
const KO_ALIAS = {
    '배그': 'PUBG', '배틀그라운드': 'PUBG',
    '롤': 'League of Legends', '리그오브레전드': 'League of Legends',
    '오버워치': 'Overwatch', '옵치': 'Overwatch',
    '발로란트': 'Valorant', '발로': 'Valorant',
    '마인크래프트': 'Minecraft', '마크': 'Minecraft',
    '스타크래프트': 'StarCraft', '스타': 'StarCraft',
    '에이펙스': 'Apex Legends', '에펙': 'Apex Legends',
    '엘든링': 'Elden Ring',
    '사이버펑크': 'Cyberpunk 2077',
    '위쳐': 'The Witcher',
    '하데스': 'Hades',
    '발라트로': 'Balatro',
    '팔월드': 'Palworld',
    '스타듀밸리': 'Stardew Valley', '스타듀': 'Stardew Valley',
    '테라리아': 'Terraria',
    '로스트아크': 'Lost Ark',
    '와우': 'World of Warcraft',
    '디아블로': 'Diablo',
    '피파': 'EA Sports FC',
    '철권': 'Tekken',
    '다크소울': 'Dark Souls',
    '몬스터헌터': 'Monster Hunter',
    '몬헌': 'Monster Hunter',
    '블랙신화': 'Black Myth',
    '호그와트': 'Hogwarts Legacy',
};

// 검색 쿼리 확장
function resolveQuery(q) {
    const lower = q.replace(/\s/g, '').toLowerCase();
    for (const [ko, en] of Object.entries(KO_ALIAS)) {
        if (lower.includes(ko.toLowerCase())) {
            const firstWord = en.split(' ')[0];
            return [...new Set([q, en, firstWord])];
        }
    }
    return [q];
}

function normalizeTag(value = '') {
    return String(value)
        .trim()
        .toLowerCase()
        .replace(/[\s/_-]+/g, '');
}

const KOREAN_ALIAS_MAP = {
    [normalizeTag('횡스크롤')]: '횡스크롤',
    [normalizeTag('사이드뷰')]: '횡스크롤',
    [normalizeTag('사이드스크롤')]: '횡스크롤',
    [normalizeTag('오픈월드')]: '오픈 월드',
    [normalizeTag('멀티')]: '멀티플레이',
    [normalizeTag('멀티 플레이')]: '멀티플레이',
    [normalizeTag('협동')]: '협동 캠페인',
    [normalizeTag('협동플레이')]: '협동 캠페인',
    [normalizeTag('탑뷰')]: '탑다운',
    [normalizeTag('애니')]: '애니메이션',
    [normalizeTag('경쟁pvp')]: '경쟁/PvP',
    [normalizeTag('경쟁/pvp')]: '경쟁/PvP',
    [normalizeTag('pvp')]: '경쟁/PvP'
};

const KOREAN_VARIANTS = {
    '횡스크롤': ['횡스크롤', '사이드뷰', '사이드 스크롤'],
    '오픈 월드': ['오픈 월드', '오픈월드'],
    '멀티플레이': ['멀티플레이', '멀티 플레이', '멀티'],
    '협동 캠페인': ['협동 캠페인', '협동', '협동플레이', '코옵'],
    '탑다운': ['탑다운', '탑뷰'],
    '애니메이션': ['애니메이션', '애니'],
    '경쟁/PvP': ['경쟁/PvP', '경쟁PVP', 'PVP', 'PvP']
};

function createLooseRegex(tag = '') {
    const escaped = String(tag)
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\s+/g, '\\s*');

    return new RegExp(`^${escaped}$`, 'i');
}

function escapeRegex(text = '') {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safeGetQueryTags(inputTag) {
    try {
        const tagMapper = require('./tagMapper');
        if (tagMapper && typeof tagMapper.getQueryTags === 'function') {
            return tagMapper.getQueryTags(inputTag);
        }
    } catch (e) {}

    const normalizedInput = normalizeTag(inputTag);
    const canonicalTag = KOREAN_ALIAS_MAP[normalizedInput] || inputTag;
    const variants = KOREAN_VARIANTS[canonicalTag] || [];
    const pool = new Set([inputTag, canonicalTag, ...variants]);

    return Array.from(pool).map(createLooseRegex);
}

module.exports = {
    KO_ALIAS,
    resolveQuery,
    normalizeTag,
    KOREAN_ALIAS_MAP,
    KOREAN_VARIANTS,
    createLooseRegex,
    escapeRegex,
    safeGetQueryTags
};
