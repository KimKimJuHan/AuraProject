const fs = require('fs');
const path = require('path');

const root = process.cwd();

function p(...parts) {
  return path.join(root, ...parts);
}

function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
  console.log('작성/수정 완료:', path.relative(root, file));
}

function ensureImport(content, importLine) {
  if (content.includes('PcCompatibilityBadge')) return content;
  return importLine + '\n' + content;
}

function patchMainPage() {
  const file = p('frontend', 'src', 'MainPage.js');
  let content = read(file);
  if (content === null) {
    console.log('MainPage.js 없음');
    return;
  }

  content = ensureImport(content, "import PcCompatibilityBadge from './components/PcCompatibilityBadge';");

  if (!content.includes('<PcCompatibilityBadge game={game} compact')) {
    const exact1 = "{game.reason || '이 조건에 잘 맞아 추천'}";
    const exact2 = "{game.reason || '현재 많은 유저가 즐기는 인기작'}";
    const badge = "<PcCompatibilityBadge game={game} compact hideUnknown />";

    if (content.includes(exact1)) {
      content = content.replace(exact1, exact1 + badge);
    } else if (content.includes(exact2)) {
      content = content.replace(exact2, exact2 + badge);
    } else if (content.includes('{currentPriceText}')) {
      content = content.replace('{currentPriceText}', badge + '{currentPriceText}');
    } else {
      console.log('주의: MainPage.js 삽입 위치 못 찾음');
    }
  }

  write(file, content);
}

function patchSearchResultsPage() {
  const file = p('frontend', 'src', 'SearchResultsPage.js');
  let content = read(file);
  if (content === null) {
    console.log('SearchResultsPage.js 없음');
    return;
  }

  content = ensureImport(content, "import PcCompatibilityBadge from './components/PcCompatibilityBadge';");

  if (!content.includes('<PcCompatibilityBadge game={game} compact')) {
    const exact = "{game.title_ko || game.title}";
    const badge = "<PcCompatibilityBadge game={game} compact hideUnknown />";
    if (content.includes(exact)) {
      content = content.replace(exact, exact + badge);
    } else {
      console.log('주의: SearchResultsPage.js 삽입 위치 못 찾음');
    }
  }

  write(file, content);
}

function patchShopPage() {
  const file = p('frontend', 'src', 'ShopPage.js');
  let content = read(file);
  if (content === null) return;

  content = ensureImport(content, "import PcCompatibilityBadge from './components/PcCompatibilityBadge';");

  if (!content.includes('PcCompatibilityBadge game={gameData}')) {
    const badge = "<PcCompatibilityBadge game={gameData} hideUnknown />";
    if (content.includes('{gameData.title_ko || gameData.title}')) {
      content = content.replace('{gameData.title_ko || gameData.title}', '{gameData.title_ko || gameData.title}' + badge);
    }
  }

  write(file, content);
}

function patchMyPageUnknownHide() {
  const file = p('frontend', 'src', 'pages', 'MyPage.js');
  let content = read(file);
  if (content === null) return;

  // 찜 목록의 사양 정보 없음은 안 보이게 처리
  content = content.replace(/<PcCompatibilityBadge game=\{game\} compact \/>/g, '<PcCompatibilityBadge game={game} compact hideUnknown />');
  content = content.replace(/<PcCompatibilityBadge game=\{game\} \/>/g, '<PcCompatibilityBadge game={game} hideUnknown />');

  // 저장/삭제 후 같은 탭 갱신 이벤트 보강
  if (content.includes('savePcSpec(') && !content.includes("pcSpecUpdated")) {
    content = content.replace(/savePcSpec\(([^)]*)\);/, "savePcSpec($1);\n    window.dispatchEvent(new Event('pcSpecUpdated'));");
  }
  if (content.includes('removePcSpec(') && !content.includes("pcSpecUpdated")) {
    content = content.replace(/removePcSpec\(\);/, "removePcSpec();\n    window.dispatchEvent(new Event('pcSpecUpdated'));");
  }

  write(file, content);
}

write(p('frontend', 'src', 'utils', 'pcCompatibility.js'), "// src/utils/pcCompatibility.js\n\nexport const PC_SPEC_STORAGE_KEY = 'userPcSpec';\n\nfunction normalizeKey(value) {\n  return String(value || '')\n    .toLowerCase()\n    .replace(/\u2122/g, '')\n    .replace(/\u00ae/g, '')\n    .replace(/'/g, '')\n    .replace(/[^a-z0-9\uac00-\ud7a3]+/g, '-')\n    .replace(/^-+|-+$/g, '');\n}\n\nexport function getUserPcSpec() {\n  try {\n    const saved = localStorage.getItem(PC_SPEC_STORAGE_KEY);\n    if (!saved) return null;\n    const parsed = JSON.parse(saved);\n    if (!parsed || typeof parsed !== 'object') return null;\n    return parsed;\n  } catch (error) {\n    console.error('PC \uc0ac\uc591 \ubd88\ub7ec\uc624\uae30 \uc2e4\ud328:', error);\n    return null;\n  }\n}\n\nexport function saveUserPcSpec(spec) {\n  try {\n    localStorage.setItem(PC_SPEC_STORAGE_KEY, JSON.stringify(spec));\n    return true;\n  } catch (error) {\n    console.error('PC \uc0ac\uc591 \uc800\uc7a5 \uc2e4\ud328:', error);\n    return false;\n  }\n}\n\nexport function removeUserPcSpec() {\n  try {\n    localStorage.removeItem(PC_SPEC_STORAGE_KEY);\n    return true;\n  } catch (error) {\n    console.error('PC \uc0ac\uc591 \uc0ad\uc81c \uc2e4\ud328:', error);\n    return false;\n  }\n}\n\nexport const getSavedPcSpec = getUserPcSpec;\nexport const savePcSpec = saveUserPcSpec;\nexport const removePcSpec = removeUserPcSpec;\n\nconst GAME_SPEC_PRESETS = {\n  'counter-strike': { min: { cpu: 2500, gpu: 1800, ram: 4 }, recommended: { cpu: 7000, gpu: 6000, ram: 8 } },\n  'counter-strike-2': { min: { cpu: 6000, gpu: 5000, ram: 8 }, recommended: { cpu: 12000, gpu: 10000, ram: 16 } },\n  'tom-clancys-rainbow-six-siege-x': { min: { cpu: 5000, gpu: 5000, ram: 8 }, recommended: { cpu: 10000, gpu: 9000, ram: 16 } },\n  'rainbow-six-siege': { min: { cpu: 5000, gpu: 5000, ram: 8 }, recommended: { cpu: 10000, gpu: 9000, ram: 16 } },\n  'terraria': { min: { cpu: 1000, gpu: 500, ram: 2 }, recommended: { cpu: 2500, gpu: 1200, ram: 4 } },\n  'rust': { min: { cpu: 9000, gpu: 9000, ram: 10 }, recommended: { cpu: 16000, gpu: 16000, ram: 16 } },\n  'garrys-mod': { min: { cpu: 1500, gpu: 800, ram: 2 }, recommended: { cpu: 3500, gpu: 2500, ram: 4 } },\n  'wallpaper-engine': { min: { cpu: 1500, gpu: 1000, ram: 2 }, recommended: { cpu: 3500, gpu: 3500, ram: 4 } },\n  'black-myth-wukong': { min: { cpu: 14000, gpu: 16000, ram: 16 }, recommended: { cpu: 22000, gpu: 25000, ram: 16 } },\n  'stardew-valley': { min: { cpu: 1000, gpu: 500, ram: 2 }, recommended: { cpu: 2500, gpu: 1200, ram: 4 } },\n  'elden-ring': { min: { cpu: 12000, gpu: 12000, ram: 12 }, recommended: { cpu: 17000, gpu: 17000, ram: 16 } },\n  'left-4-dead-2': { min: { cpu: 1000, gpu: 600, ram: 2 }, recommended: { cpu: 2500, gpu: 1500, ram: 4 } },\n  'red-dead-redemption-2': { min: { cpu: 8000, gpu: 9000, ram: 8 }, recommended: { cpu: 14000, gpu: 14000, ram: 12 } },\n  'baldurs-gate-3': { min: { cpu: 9000, gpu: 10000, ram: 8 }, recommended: { cpu: 16000, gpu: 17000, ram: 16 } },\n  'euro-truck-simulator-2': { min: { cpu: 3000, gpu: 2500, ram: 4 }, recommended: { cpu: 7000, gpu: 6500, ram: 8 } },\n  'phasmophobia': { min: { cpu: 6000, gpu: 6500, ram: 8 }, recommended: { cpu: 11000, gpu: 11000, ram: 8 } },\n  'dead-by-daylight': { min: { cpu: 5000, gpu: 4500, ram: 8 }, recommended: { cpu: 9000, gpu: 8500, ram: 8 } },\n  'among-us': { min: { cpu: 500, gpu: 300, ram: 1 }, recommended: { cpu: 1500, gpu: 800, ram: 2 } },\n  'ark-survival-evolved': { min: { cpu: 6000, gpu: 7500, ram: 8 }, recommended: { cpu: 12000, gpu: 14000, ram: 16 } },\n  'the-forest': { min: { cpu: 3000, gpu: 3000, ram: 4 }, recommended: { cpu: 8000, gpu: 7000, ram: 8 } },\n  'geometry-dash': { min: { cpu: 800, gpu: 300, ram: 1 }, recommended: { cpu: 1500, gpu: 700, ram: 2 } },\n  'hollow-knight': { min: { cpu: 1500, gpu: 800, ram: 4 }, recommended: { cpu: 3000, gpu: 1500, ram: 4 } },\n\n  'battlefield-1': { min: { cpu: 7000, gpu: 7500, ram: 8 }, recommended: { cpu: 12000, gpu: 12000, ram: 16 } },\n  'stray': { min: { cpu: 7000, gpu: 8000, ram: 8 }, recommended: { cpu: 12000, gpu: 13000, ram: 16 } },\n  'wavetale': { min: { cpu: 3000, gpu: 3000, ram: 4 }, recommended: { cpu: 7000, gpu: 6000, ram: 8 } },\n  'clair-obscur-expedition-33': { min: { cpu: 13000, gpu: 15000, ram: 16 }, recommended: { cpu: 22000, gpu: 24000, ram: 16 } },\n  'dishonored': { min: { cpu: 2500, gpu: 1800, ram: 3 }, recommended: { cpu: 5000, gpu: 3500, ram: 4 } },\n  'subnautica': { min: { cpu: 3500, gpu: 4000, ram: 4 }, recommended: { cpu: 8000, gpu: 8000, ram: 8 } },\n  'factorio': { min: { cpu: 2500, gpu: 1000, ram: 4 }, recommended: { cpu: 5000, gpu: 2500, ram: 8 } },\n  'warhammer-40000-gladius-relics-of-war': { min: { cpu: 3000, gpu: 2500, ram: 4 }, recommended: { cpu: 7000, gpu: 6000, ram: 8 } },\n  'warhammer-40-000-gladius-relics-of-war': { min: { cpu: 3000, gpu: 2500, ram: 4 }, recommended: { cpu: 7000, gpu: 6000, ram: 8 } },\n  'dota-2': { min: { cpu: 1500, gpu: 1000, ram: 4 }, recommended: { cpu: 3500, gpu: 2500, ram: 8 } },\n  'pubg-battlegrounds': { min: { cpu: 7000, gpu: 7500, ram: 8 }, recommended: { cpu: 13000, gpu: 13000, ram: 16 } },\n  'dead-cells': { min: { cpu: 1500, gpu: 800, ram: 2 }, recommended: { cpu: 3000, gpu: 1500, ram: 4 } },\n  'bioshock-infinite': { min: { cpu: 2500, gpu: 1500, ram: 2 }, recommended: { cpu: 5000, gpu: 3500, ram: 4 } },\n\n  'cyberpunk-2077': { min: { cpu: 11000, gpu: 12000, ram: 12 }, recommended: { cpu: 18000, gpu: 20000, ram: 16 } },\n  'grand-theft-auto-v': { min: { cpu: 3500, gpu: 3000, ram: 4 }, recommended: { cpu: 8000, gpu: 7000, ram: 8 } },\n  'gta-v': { min: { cpu: 3500, gpu: 3000, ram: 4 }, recommended: { cpu: 8000, gpu: 7000, ram: 8 } },\n  'palworld': { min: { cpu: 9000, gpu: 9000, ram: 16 }, recommended: { cpu: 16000, gpu: 16000, ram: 32 } },\n  'helldivers-2': { min: { cpu: 10000, gpu: 12000, ram: 8 }, recommended: { cpu: 17000, gpu: 19000, ram: 16 } }\n};\n\nconst TITLE_ALIASES = {\n  'tom-clancys-rainbow-six-siege-x': 'tom-clancys-rainbow-six-siege-x',\n  'tom-clancy-s-rainbow-six-siege-x': 'tom-clancys-rainbow-six-siege-x',\n  'tom-clancys-rainbow-six': 'tom-clancys-rainbow-six-siege-x',\n  'tom-clancys-rainbow-six-siege': 'rainbow-six-siege',\n  'rainbow-six-siege-x': 'tom-clancys-rainbow-six-siege-x',\n  'garry-s-mod': 'garrys-mod',\n  'baldur-s-gate-3': 'baldurs-gate-3',\n  'battlefieldtm-1': 'battlefield-1',\n  'battlefield-1-revolution': 'battlefield-1',\n  'warhammer-40000-gladius-relics-of-war': 'warhammer-40000-gladius-relics-of-war',\n  'warhammer-40-000-gladius-relics-of-war': 'warhammer-40000-gladius-relics-of-war',\n  'pubg': 'pubg-battlegrounds',\n  'playerunknowns-battlegrounds': 'pubg-battlegrounds'\n};\n\nfunction normalizeNumber(value) {\n  const numberValue = Number(value);\n  return Number.isFinite(numberValue) ? numberValue : 0;\n}\n\nfunction getSpecValue(spec, key) {\n  if (!spec) return 0;\n  if (Object.prototype.hasOwnProperty.call(spec, key)) {\n    return normalizeNumber(spec[key]);\n  }\n  return 0;\n}\n\nfunction getDirectGameSpec(game, type) {\n  if (!game) return null;\n\n  if (type === 'recommended') {\n    return (\n      game.recommendSpecScore ||\n      game.recommendedSpecScore ||\n      game.recommendedScore ||\n      game.recommend_spec_score ||\n      game.recommended_spec_score ||\n      game.pcRecommendedSpec ||\n      game.pc_recommended_spec ||\n      null\n    );\n  }\n\n  return (\n    game.minSpecScore ||\n    game.minimumSpecScore ||\n    game.minimumScore ||\n    game.min_spec_score ||\n    game.minimum_spec_score ||\n    game.pcMinSpec ||\n    game.pc_min_spec ||\n    null\n  );\n}\n\nfunction getPresetByGame(game) {\n  if (!game) return null;\n\n  const possibleKeys = [\n    game.slug,\n    game.title,\n    game.title_ko,\n    game.name,\n    game.appid,\n    game.steam_appid\n  ].filter(Boolean).map(normalizeKey);\n\n  for (const key of possibleKeys) {\n    const aliasKey = TITLE_ALIASES[key] || key;\n    if (GAME_SPEC_PRESETS[aliasKey]) return GAME_SPEC_PRESETS[aliasKey];\n\n    // \uc81c\ubaa9\uc774 \uae38\uac8c \uc798\ub824 \ub4e4\uc5b4\uc640\ub3c4 \uc77c\ubd80 \ud3ec\ud568\ub418\uba74 \ub9e4\uce6d\n    const foundKey = Object.keys(GAME_SPEC_PRESETS).find(specKey => key.includes(specKey) || specKey.includes(key));\n    if (foundKey) return GAME_SPEC_PRESETS[foundKey];\n  }\n\n  return null;\n}\n\nfunction getGameSpec(game, type) {\n  const directSpec = getDirectGameSpec(game, type);\n  if (directSpec) return directSpec;\n\n  const preset = getPresetByGame(game);\n  if (!preset) return null;\n\n  return type === 'recommended' ? preset.recommended : preset.min;\n}\n\nfunction hasPassed(userSpec, targetSpec) {\n  if (!userSpec || !targetSpec) return false;\n\n  const userCpu = getSpecValue(userSpec, 'cpuScore');\n  const userGpu = getSpecValue(userSpec, 'gpuScore');\n  const userRam = getSpecValue(userSpec, 'ram');\n\n  const targetCpu = getSpecValue(targetSpec, 'cpu');\n  const targetGpu = getSpecValue(targetSpec, 'gpu');\n  const targetRam = getSpecValue(targetSpec, 'ram');\n\n  return userCpu >= targetCpu && userGpu >= targetGpu && userRam >= targetRam;\n}\n\nexport function checkPcCompatibility(game, userSpec) {\n  const currentUserSpec = userSpec || getUserPcSpec();\n\n  if (!currentUserSpec) {\n    return {\n      status: 'unset',\n      label: 'PC \uc0ac\uc591 \ubbf8\uc124\uc815',\n      icon: '\u2699\ufe0f',\n      color: '#aaa',\n      background: 'rgba(255,255,255,0.08)',\n      border: '#555'\n    };\n  }\n\n  const minSpec = getGameSpec(game, 'minimum');\n  const recommendedSpec = getGameSpec(game, 'recommended');\n\n  if (!minSpec && !recommendedSpec) {\n    return {\n      status: 'unknown',\n      label: '\uc0ac\uc591 \uc815\ubcf4 \uc5c6\uc74c',\n      icon: '\u2754',\n      color: '#bbb',\n      background: 'rgba(255,255,255,0.08)',\n      border: '#555'\n    };\n  }\n\n  if (recommendedSpec && hasPassed(currentUserSpec, recommendedSpec)) {\n    return {\n      status: 'recommended',\n      label: '\ucf8c\uc801\ud558\uac8c \uac00\ub2a5',\n      icon: '\u2705',\n      color: '#7CFF9B',\n      background: 'rgba(76,175,80,0.18)',\n      border: '#4CAF50'\n    };\n  }\n\n  if (minSpec && hasPassed(currentUserSpec, minSpec)) {\n    return {\n      status: 'minimum',\n      label: '\ub0ae\uc740 \uc635\uc158 \uac00\ub2a5',\n      icon: '\u26a0\ufe0f',\n      color: '#FFD166',\n      background: 'rgba(255,193,7,0.18)',\n      border: '#FFC107'\n    };\n  }\n\n  return {\n    status: 'fail',\n    label: '\uc0ac\uc591 \ubd80\uc871',\n    icon: '\u274c',\n    color: '#FF8A8A',\n    background: 'rgba(229,9,20,0.18)',\n    border: '#E50914'\n  };\n}\n\nexport function getCompatibilityStatus(game, userSpec) {\n  return checkPcCompatibility(game, userSpec);\n}\n\nexport function getCompatibilityText(game, userSpec) {\n  const result = checkPcCompatibility(game, userSpec);\n  return result.icon + ' ' + result.label;\n}\n");
write(p('frontend', 'src', 'components', 'PcCompatibilityBadge.js'), "// src/components/PcCompatibilityBadge.js\nimport React, { useEffect, useState } from 'react';\nimport { checkPcCompatibility, getUserPcSpec } from '../utils/pcCompatibility';\n\nexport default function PcCompatibilityBadge({ game, compact = false, hideUnknown = false }) {\n  const [userSpec, setUserSpec] = useState(() => getUserPcSpec());\n\n  useEffect(() => {\n    const handleStorageChange = () => setUserSpec(getUserPcSpec());\n\n    window.addEventListener('storage', handleStorageChange);\n    window.addEventListener('pcSpecUpdated', handleStorageChange);\n\n    return () => {\n      window.removeEventListener('storage', handleStorageChange);\n      window.removeEventListener('pcSpecUpdated', handleStorageChange);\n    };\n  }, []);\n\n  const result = checkPcCompatibility(game, userSpec);\n\n  if (hideUnknown && result.status === 'unknown') return null;\n\n  return (\n    <div\n      className=\"pc-compatibility-badge\"\n      title={result.label}\n      style={{\n        display: 'inline-flex',\n        alignItems: 'center',\n        gap: '4px',\n        width: 'fit-content',\n        maxWidth: '100%',\n        marginTop: compact ? '5px' : '7px',\n        marginBottom: compact ? '5px' : '7px',\n        padding: compact ? '3px 8px' : '5px 10px',\n        borderRadius: '999px',\n        fontSize: compact ? '10px' : '11px',\n        lineHeight: 1.2,\n        fontWeight: '700',\n        color: result.color,\n        background: result.background,\n        border: '1px solid ' + result.border,\n        whiteSpace: 'nowrap'\n      }}\n    >\n      <span>{result.icon}</span>\n      <span>{result.label}</span>\n    </div>\n  );\n}\n");

patchMainPage();
patchSearchResultsPage();
patchShopPage();
patchMyPageUnknownHide();

console.log('');
console.log('완료. 이제 아래 명령어 실행:');
console.log('cd frontend');
console.log('npm start');
