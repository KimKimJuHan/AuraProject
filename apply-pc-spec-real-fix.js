const fs = require('fs');
const path = require('path');

const root = process.cwd();

function filePath(...parts) {
  return path.join(root, ...parts);
}

function writeFile(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
  console.log('작성 완료:', path.relative(root, target));
}

function readIfExists(target) {
  if (!fs.existsSync(target)) return null;
  return fs.readFileSync(target, 'utf8');
}

function saveIfChanged(target, content) {
  const before = readIfExists(target);
  if (before === null) {
    console.log('건너뜀, 파일 없음:', path.relative(root, target));
    return false;
  }
  if (before === content) {
    console.log('변경 없음:', path.relative(root, target));
    return true;
  }
  fs.writeFileSync(target, content, 'utf8');
  console.log('수정 완료:', path.relative(root, target));
  return true;
}

function ensureImport(content, importLine) {
  if (content.includes(importLine)) return content;
  if (content.includes('PcCompatibilityBadge')) return content;
  return importLine + '\n' + content;
}

function insertAfterFirst(content, target, insert) {
  if (content.includes(insert.trim())) return content;
  const index = content.indexOf(target);
  if (index === -1) return content;
  return content.slice(0, index + target.length) + insert + content.slice(index + target.length);
}

function patchMainPage() {
  const target = filePath('frontend', 'src', 'MainPage.js');
  let content = readIfExists(target);
  if (content === null) return;

  content = ensureImport(content, "import PcCompatibilityBadge from './components/PcCompatibilityBadge';");

  if (!content.includes('<PcCompatibilityBadge game={game}')) {
    const candidates = [
      "{game.reason || '이 조건에 잘 맞아 추천'}",
      "{game.reason || '현재 많은 유저가 즐기는 인기작'}",
      "{game.reason}",
      "{currentPriceText}"
    ];

    let patched = false;
    for (const candidate of candidates) {
      if (content.includes(candidate)) {
        if (candidate === "{currentPriceText}") {
          content = content.replace(candidate, "<PcCompatibilityBadge game={game} compact hideUnknown />" + candidate);
        } else {
          content = insertAfterFirst(content, candidate, " <PcCompatibilityBadge game={game} compact hideUnknown />");
        }
        patched = true;
        break;
      }
    }

    if (!patched) {
      console.log('주의: MainPage.js에서 삽입 위치를 못 찾았습니다. 수동 확인 필요');
    }
  }

  saveIfChanged(target, content);
}

function patchSearchResultsPage() {
  const target = filePath('frontend', 'src', 'SearchResultsPage.js');
  let content = readIfExists(target);
  if (content === null) return;

  content = ensureImport(content, "import PcCompatibilityBadge from './components/PcCompatibilityBadge';");

  if (!content.includes('<PcCompatibilityBadge game={game}')) {
    const candidates = [
      "{game.title_ko || game.title}",
      "{game.price_info?.isFree ? '무료'",
      "{game.price_info"
    ];

    let patched = false;
    for (const candidate of candidates) {
      if (content.includes(candidate)) {
        if (candidate.startsWith('{game.price_info')) {
          content = content.replace(candidate, "<PcCompatibilityBadge game={game} compact hideUnknown />" + candidate);
        } else {
          content = insertAfterFirst(content, candidate, " <PcCompatibilityBadge game={game} compact hideUnknown />");
        }
        patched = true;
        break;
      }
    }

    if (!patched) {
      console.log('주의: SearchResultsPage.js에서 삽입 위치를 못 찾았습니다. 수동 확인 필요');
    }
  }

  saveIfChanged(target, content);
}

function patchShopPage() {
  const target = filePath('frontend', 'src', 'ShopPage.js');
  let content = readIfExists(target);
  if (content === null) return;

  content = ensureImport(content, "import PcCompatibilityBadge from './components/PcCompatibilityBadge';");

  if (!content.includes('<PcCompatibilityBadge game={gameData}')) {
    const titleTarget = "{gameData.title_ko || gameData.title}";
    if (content.includes(titleTarget)) {
      content = insertAfterFirst(content, titleTarget, " <PcCompatibilityBadge game={gameData} hideUnknown />");
    } else {
      console.log('주의: ShopPage.js에서 삽입 위치를 못 찾았습니다. 수동 확인 필요');
    }
  }

  saveIfChanged(target, content);
}

function patchMyPageDispatchEvent() {
  const target = filePath('frontend', 'src', 'pages', 'MyPage.js');
  let content = readIfExists(target);
  if (content === null) return;

  // PC 사양 저장 후 같은 탭 배지 갱신용 이벤트 추가
  if (content.includes('savePcSpec(') && !content.includes("pcSpecUpdated")) {
    content = content.replace(
      /savePcSpec\(([^)]*)\);/,
      "savePcSpec($1);\n    window.dispatchEvent(new Event('pcSpecUpdated'));"
    );
  }

  if (content.includes('removePcSpec(') && !content.includes("pcSpecUpdated")) {
    content = content.replace(
      /removePcSpec\(\);/,
      "removePcSpec();\n    window.dispatchEvent(new Event('pcSpecUpdated'));"
    );
  }

  saveIfChanged(target, content);
}

const pcCompatibilityContent = "// src/utils/pcCompatibility.js\n\nexport const PC_SPEC_STORAGE_KEY = 'userPcSpec';\n\nfunction normalizeKey(value) {\n  return String(value || '')\n    .toLowerCase()\n    .replace(/\u2122/g, '')\n    .replace(/\u00ae/g, '')\n    .replace(/[^a-z0-9\uac00-\ud7a3]+/g, '-')\n    .replace(/^-+|-+$/g, '');\n}\n\nexport function getUserPcSpec() {\n  try {\n    const saved = localStorage.getItem(PC_SPEC_STORAGE_KEY);\n    if (!saved) return null;\n\n    const parsed = JSON.parse(saved);\n    if (!parsed || typeof parsed !== 'object') return null;\n\n    return parsed;\n  } catch (error) {\n    console.error('PC \uc0ac\uc591 \ubd88\ub7ec\uc624\uae30 \uc2e4\ud328:', error);\n    return null;\n  }\n}\n\nexport function saveUserPcSpec(spec) {\n  try {\n    localStorage.setItem(PC_SPEC_STORAGE_KEY, JSON.stringify(spec));\n    return true;\n  } catch (error) {\n    console.error('PC \uc0ac\uc591 \uc800\uc7a5 \uc2e4\ud328:', error);\n    return false;\n  }\n}\n\nexport function removeUserPcSpec() {\n  try {\n    localStorage.removeItem(PC_SPEC_STORAGE_KEY);\n    return true;\n  } catch (error) {\n    console.error('PC \uc0ac\uc591 \uc0ad\uc81c \uc2e4\ud328:', error);\n    return false;\n  }\n}\n\n// \uae30\uc874 \ud30c\uc77c\ub4e4\uc774 \uc0ac\uc6a9\ud558\ub358 \uc774\ub984 \uc720\uc9c0\uc6a9 \ubcc4\uce6d\nexport const getSavedPcSpec = getUserPcSpec;\nexport const savePcSpec = saveUserPcSpec;\nexport const removePcSpec = removeUserPcSpec;\n\nconst GAME_SPEC_PRESETS = {\n  // \uba54\uc778 \ud654\uba74 \uc778\uae30 \uac8c\uc784\n  'counter-strike': {\n    min: { cpu: 2500, gpu: 1800, ram: 4 },\n    recommended: { cpu: 7000, gpu: 6000, ram: 8 }\n  },\n  'counter-strike-2': {\n    min: { cpu: 6000, gpu: 5000, ram: 8 },\n    recommended: { cpu: 12000, gpu: 10000, ram: 16 }\n  },\n  'tom-clancys-rainbow-six-siege-x': {\n    min: { cpu: 5000, gpu: 5000, ram: 8 },\n    recommended: { cpu: 10000, gpu: 9000, ram: 16 }\n  },\n  'rainbow-six-siege': {\n    min: { cpu: 5000, gpu: 5000, ram: 8 },\n    recommended: { cpu: 10000, gpu: 9000, ram: 16 }\n  },\n  'terraria': {\n    min: { cpu: 1000, gpu: 500, ram: 2 },\n    recommended: { cpu: 2500, gpu: 1200, ram: 4 }\n  },\n  'rust': {\n    min: { cpu: 9000, gpu: 9000, ram: 10 },\n    recommended: { cpu: 16000, gpu: 16000, ram: 16 }\n  },\n  'garrys-mod': {\n    min: { cpu: 1500, gpu: 800, ram: 2 },\n    recommended: { cpu: 3500, gpu: 2500, ram: 4 }\n  },\n  'wallpaper-engine': {\n    min: { cpu: 1500, gpu: 1000, ram: 2 },\n    recommended: { cpu: 3500, gpu: 3500, ram: 4 }\n  },\n  'black-myth-wukong': {\n    min: { cpu: 14000, gpu: 16000, ram: 16 },\n    recommended: { cpu: 22000, gpu: 25000, ram: 16 }\n  },\n  'stardew-valley': {\n    min: { cpu: 1000, gpu: 500, ram: 2 },\n    recommended: { cpu: 2500, gpu: 1200, ram: 4 }\n  },\n  'elden-ring': {\n    min: { cpu: 12000, gpu: 12000, ram: 12 },\n    recommended: { cpu: 17000, gpu: 17000, ram: 16 }\n  },\n  'left-4-dead-2': {\n    min: { cpu: 1000, gpu: 600, ram: 2 },\n    recommended: { cpu: 2500, gpu: 1500, ram: 4 }\n  },\n  'red-dead-redemption-2': {\n    min: { cpu: 8000, gpu: 9000, ram: 8 },\n    recommended: { cpu: 14000, gpu: 14000, ram: 12 }\n  },\n  'baldurs-gate-3': {\n    min: { cpu: 9000, gpu: 10000, ram: 8 },\n    recommended: { cpu: 16000, gpu: 17000, ram: 16 }\n  },\n  'baldur-s-gate-3': {\n    min: { cpu: 9000, gpu: 10000, ram: 8 },\n    recommended: { cpu: 16000, gpu: 17000, ram: 16 }\n  },\n  'euro-truck-simulator-2': {\n    min: { cpu: 3000, gpu: 2500, ram: 4 },\n    recommended: { cpu: 7000, gpu: 6500, ram: 8 }\n  },\n  'phasmophobia': {\n    min: { cpu: 6000, gpu: 6500, ram: 8 },\n    recommended: { cpu: 11000, gpu: 11000, ram: 8 }\n  },\n  'dead-by-daylight': {\n    min: { cpu: 5000, gpu: 4500, ram: 8 },\n    recommended: { cpu: 9000, gpu: 8500, ram: 8 }\n  },\n  'among-us': {\n    min: { cpu: 500, gpu: 300, ram: 1 },\n    recommended: { cpu: 1500, gpu: 800, ram: 2 }\n  },\n  'ark-survival-evolved': {\n    min: { cpu: 6000, gpu: 7500, ram: 8 },\n    recommended: { cpu: 12000, gpu: 14000, ram: 16 }\n  },\n  'the-forest': {\n    min: { cpu: 3000, gpu: 3000, ram: 4 },\n    recommended: { cpu: 8000, gpu: 7000, ram: 8 }\n  },\n  'geometry-dash': {\n    min: { cpu: 800, gpu: 300, ram: 1 },\n    recommended: { cpu: 1500, gpu: 700, ram: 2 }\n  },\n  'hollow-knight': {\n    min: { cpu: 1500, gpu: 800, ram: 4 },\n    recommended: { cpu: 3000, gpu: 1500, ram: 4 }\n  },\n\n  // \ub9c8\uc774\ud398\uc774\uc9c0 \ucc1c \ubaa9\ub85d \uc608\uc2dc\n  'battlefield-1': {\n    min: { cpu: 7000, gpu: 7500, ram: 8 },\n    recommended: { cpu: 12000, gpu: 12000, ram: 16 }\n  },\n  'stray': {\n    min: { cpu: 7000, gpu: 8000, ram: 8 },\n    recommended: { cpu: 12000, gpu: 13000, ram: 16 }\n  },\n  'wavetale': {\n    min: { cpu: 3000, gpu: 3000, ram: 4 },\n    recommended: { cpu: 7000, gpu: 6000, ram: 8 }\n  },\n  'clair-obscur-expedition-33': {\n    min: { cpu: 13000, gpu: 15000, ram: 16 },\n    recommended: { cpu: 22000, gpu: 24000, ram: 16 }\n  },\n  'dishonored': {\n    min: { cpu: 2500, gpu: 1800, ram: 3 },\n    recommended: { cpu: 5000, gpu: 3500, ram: 4 }\n  },\n  'subnautica': {\n    min: { cpu: 3500, gpu: 4000, ram: 4 },\n    recommended: { cpu: 8000, gpu: 8000, ram: 8 }\n  },\n\n  // \uc790\uc8fc \ub098\uc624\ub294 \uac8c\uc784 \ucd94\uac00\n  'cyberpunk-2077': {\n    min: { cpu: 11000, gpu: 12000, ram: 12 },\n    recommended: { cpu: 18000, gpu: 20000, ram: 16 }\n  },\n  'grand-theft-auto-v': {\n    min: { cpu: 3500, gpu: 3000, ram: 4 },\n    recommended: { cpu: 8000, gpu: 7000, ram: 8 }\n  },\n  'gta-v': {\n    min: { cpu: 3500, gpu: 3000, ram: 4 },\n    recommended: { cpu: 8000, gpu: 7000, ram: 8 }\n  },\n  'pubg-battlegrounds': {\n    min: { cpu: 7000, gpu: 7500, ram: 8 },\n    recommended: { cpu: 13000, gpu: 13000, ram: 16 }\n  },\n  'palworld': {\n    min: { cpu: 9000, gpu: 9000, ram: 16 },\n    recommended: { cpu: 16000, gpu: 16000, ram: 32 }\n  },\n  'helldivers-2': {\n    min: { cpu: 10000, gpu: 12000, ram: 8 },\n    recommended: { cpu: 17000, gpu: 19000, ram: 16 }\n  }\n};\n\nconst TITLE_ALIASES = {\n  'counter-strike': 'counter-strike',\n  'counter-strike-2': 'counter-strike-2',\n  'tom-clancys-rainbow-six-siege-x': 'tom-clancys-rainbow-six-siege-x',\n  'tom-clancy-s-rainbow-six-siege-x': 'tom-clancys-rainbow-six-siege-x',\n  'rainbow-six-siege-x': 'tom-clancys-rainbow-six-siege-x',\n  'rainbow-six-siege': 'rainbow-six-siege',\n  'garrys-mod': 'garrys-mod',\n  'garry-s-mod': 'garrys-mod',\n  'baldurs-gate-3': 'baldurs-gate-3',\n  'baldur-s-gate-3': 'baldurs-gate-3',\n  'battlefieldtm-1': 'battlefield-1',\n  'battlefield-1': 'battlefield-1',\n  'clair-obscur-expedition-33': 'clair-obscur-expedition-33',\n  'left-4-dead-2': 'left-4-dead-2'\n};\n\nfunction normalizeNumber(value) {\n  const numberValue = Number(value);\n  return Number.isFinite(numberValue) ? numberValue : 0;\n}\n\nfunction getSpecValue(spec, key) {\n  if (!spec) return 0;\n\n  if (Object.prototype.hasOwnProperty.call(spec, key)) {\n    return normalizeNumber(spec[key]);\n  }\n\n  return 0;\n}\n\nfunction getDirectGameSpec(game, type) {\n  if (!game) return null;\n\n  if (type === 'recommended') {\n    return (\n      game.recommendSpecScore ||\n      game.recommendedSpecScore ||\n      game.recommendedScore ||\n      game.recommend_spec_score ||\n      game.recommended_spec_score ||\n      game.pcRecommendedSpec ||\n      game.pc_recommended_spec ||\n      null\n    );\n  }\n\n  return (\n    game.minSpecScore ||\n    game.minimumSpecScore ||\n    game.minimumScore ||\n    game.min_spec_score ||\n    game.minimum_spec_score ||\n    game.pcMinSpec ||\n    game.pc_min_spec ||\n    null\n  );\n}\n\nfunction getPresetByGame(game) {\n  if (!game) return null;\n\n  const possibleKeys = [\n    game.slug,\n    game.title,\n    game.title_ko,\n    game.name,\n    game.appid,\n    game.steam_appid\n  ]\n    .filter(Boolean)\n    .map(normalizeKey);\n\n  for (const key of possibleKeys) {\n    const aliasKey = TITLE_ALIASES[key] || key;\n    if (GAME_SPEC_PRESETS[aliasKey]) return GAME_SPEC_PRESETS[aliasKey];\n  }\n\n  return null;\n}\n\nfunction getGameSpec(game, type) {\n  const directSpec = getDirectGameSpec(game, type);\n  if (directSpec) return directSpec;\n\n  const preset = getPresetByGame(game);\n  if (!preset) return null;\n\n  return type === 'recommended' ? preset.recommended : preset.min;\n}\n\nfunction hasPassed(userSpec, targetSpec) {\n  if (!userSpec || !targetSpec) return false;\n\n  const userCpu = getSpecValue(userSpec, 'cpuScore');\n  const userGpu = getSpecValue(userSpec, 'gpuScore');\n  const userRam = getSpecValue(userSpec, 'ram');\n\n  const targetCpu = getSpecValue(targetSpec, 'cpu');\n  const targetGpu = getSpecValue(targetSpec, 'gpu');\n  const targetRam = getSpecValue(targetSpec, 'ram');\n\n  return userCpu >= targetCpu && userGpu >= targetGpu && userRam >= targetRam;\n}\n\nexport function checkPcCompatibility(game, userSpec) {\n  const currentUserSpec = userSpec || getUserPcSpec();\n\n  if (!currentUserSpec) {\n    return {\n      status: 'unset',\n      label: 'PC \uc0ac\uc591 \ubbf8\uc124\uc815',\n      icon: '\u2699\ufe0f',\n      color: '#aaa',\n      background: 'rgba(255,255,255,0.08)',\n      border: '#555'\n    };\n  }\n\n  const minSpec = getGameSpec(game, 'minimum');\n  const recommendedSpec = getGameSpec(game, 'recommended');\n\n  if (!minSpec && !recommendedSpec) {\n    return {\n      status: 'unknown',\n      label: '\uc0ac\uc591 \uc815\ubcf4 \uc5c6\uc74c',\n      icon: '\u2754',\n      color: '#bbb',\n      background: 'rgba(255,255,255,0.08)',\n      border: '#555'\n    };\n  }\n\n  if (recommendedSpec && hasPassed(currentUserSpec, recommendedSpec)) {\n    return {\n      status: 'recommended',\n      label: '\ucf8c\uc801\ud558\uac8c \uac00\ub2a5',\n      icon: '\u2705',\n      color: '#7CFF9B',\n      background: 'rgba(76,175,80,0.18)',\n      border: '#4CAF50'\n    };\n  }\n\n  if (minSpec && hasPassed(currentUserSpec, minSpec)) {\n    return {\n      status: 'minimum',\n      label: '\ub0ae\uc740 \uc635\uc158 \uac00\ub2a5',\n      icon: '\u26a0\ufe0f',\n      color: '#FFD166',\n      background: 'rgba(255,193,7,0.18)',\n      border: '#FFC107'\n    };\n  }\n\n  return {\n    status: 'fail',\n    label: '\uc0ac\uc591 \ubd80\uc871',\n    icon: '\u274c',\n    color: '#FF8A8A',\n    background: 'rgba(229,9,20,0.18)',\n    border: '#E50914'\n  };\n}\n\nexport function getCompatibilityStatus(game, userSpec) {\n  return checkPcCompatibility(game, userSpec);\n}\n\nexport function getCompatibilityText(game, userSpec) {\n  const result = checkPcCompatibility(game, userSpec);\n  return result.icon + ' ' + result.label;\n}\n";
const badgeContent = "// src/components/PcCompatibilityBadge.js\nimport React, { useEffect, useState } from 'react';\nimport { checkPcCompatibility, getUserPcSpec } from '../utils/pcCompatibility';\n\nexport default function PcCompatibilityBadge({ game, compact = false, hideUnknown = false }) {\n  const [userSpec, setUserSpec] = useState(() => getUserPcSpec());\n\n  useEffect(() => {\n    const handleStorageChange = () => {\n      setUserSpec(getUserPcSpec());\n    };\n\n    window.addEventListener('storage', handleStorageChange);\n    window.addEventListener('pcSpecUpdated', handleStorageChange);\n\n    return () => {\n      window.removeEventListener('storage', handleStorageChange);\n      window.removeEventListener('pcSpecUpdated', handleStorageChange);\n    };\n  }, []);\n\n  const result = checkPcCompatibility(game, userSpec);\n\n  if (hideUnknown && result.status === 'unknown') {\n    return null;\n  }\n\n  return (\n    <div\n      className=\"pc-compatibility-badge\"\n      title={result.label}\n      style={{\n        display: 'inline-flex',\n        alignItems: 'center',\n        gap: '4px',\n        width: 'fit-content',\n        maxWidth: '100%',\n        marginTop: compact ? '4px' : '6px',\n        marginBottom: compact ? '4px' : '6px',\n        padding: compact ? '3px 8px' : '5px 10px',\n        borderRadius: '999px',\n        fontSize: compact ? '10px' : '11px',\n        lineHeight: 1.2,\n        fontWeight: '700',\n        color: result.color,\n        background: result.background,\n        border: '1px solid ' + result.border,\n        whiteSpace: 'nowrap'\n      }}\n    >\n      <span>{result.icon}</span>\n      <span>{result.label}</span>\n    </div>\n  );\n}\n";

writeFile(filePath('frontend', 'src', 'utils', 'pcCompatibility.js'), pcCompatibilityContent);
writeFile(filePath('frontend', 'src', 'components', 'PcCompatibilityBadge.js'), badgeContent);

patchMainPage();
patchSearchResultsPage();
patchShopPage();
patchMyPageDispatchEvent();

console.log('');
console.log('PC 사양 호환 표시 수정 완료');
console.log('다음 명령어 실행:');
console.log('cd frontend');
console.log('npm start');
