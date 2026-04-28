// src/utils/pcCompatibility.js

export const PC_SPEC_STORAGE_KEY = 'userPcSpec';

export function getUserPcSpec() {
  try {
    const saved = localStorage.getItem(PC_SPEC_STORAGE_KEY);
    if (!saved) return null;

    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object') return null;

    return parsed;
  } catch (error) {
    console.error('PC 사양 불러오기 실패:', error);
    return null;
  }
}

export function saveUserPcSpec(spec) {
  try {
    localStorage.setItem(PC_SPEC_STORAGE_KEY, JSON.stringify(spec));
    return true;
  } catch (error) {
    console.error('PC 사양 저장 실패:', error);
    return false;
  }
}

export function removeUserPcSpec() {
  try {
    localStorage.removeItem(PC_SPEC_STORAGE_KEY);
    return true;
  } catch (error) {
    console.error('PC 사양 삭제 실패:', error);
    return false;
  }
}

// 기존 파일들과 호환용 별칭
export const getSavedPcSpec = getUserPcSpec;
export const savePcSpec = saveUserPcSpec;
export const removePcSpec = removeUserPcSpec;

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/™|®/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtml(html) {
  if (!html || html === '정보 없음') return '';

  let text = String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();

  return text;
}

function getLineValue(text, labels) {
  const lines = stripHtml(text)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const normalized = normalizeText(line);
    if (labels.some(label => normalized.includes(label))) {
      const parts = line.split(':');
      if (parts.length > 1) return parts.slice(1).join(':').trim();
      return line.trim();
    }
  }

  return '';
}

function normalizeNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function getSpecValue(spec, key) {
  if (!spec) return 0;
  if (Object.prototype.hasOwnProperty.call(spec, key)) return normalizeNumber(spec[key]);
  return 0;
}

function parseRam(requirementText) {
  const text = normalizeText(stripHtml(requirementText));
  const memoryLine = normalizeText(getLineValue(requirementText, ['memory', 'ram', '메모리']));

  const target = memoryLine || text;

  const gbMatch = target.match(/(\d+(?:\.\d+)?)\s*gb/);
  if (gbMatch) return Math.ceil(parseFloat(gbMatch[1]));

  const mbMatch = target.match(/(\d+(?:\.\d+)?)\s*mb/);
  if (mbMatch) return Math.ceil(parseFloat(mbMatch[1]) / 1024);

  return 0;
}

const CPU_MODEL_SCORES = [
  [/i9[-\s]?14/i, 45000], [/i9[-\s]?13/i, 42000], [/i9[-\s]?12/i, 38000], [/i9[-\s]?11/i, 30000], [/i9[-\s]?10/i, 26000],
  [/i7[-\s]?14/i, 38000], [/i7[-\s]?13/i, 35000], [/i7[-\s]?12/i, 31000], [/i7[-\s]?11/i, 24000], [/i7[-\s]?10/i, 20000], [/i7[-\s]?9/i, 17000], [/i7[-\s]?8/i, 14000], [/i7[-\s]?7/i, 11000], [/i7[-\s]?6/i, 9000], [/i7[-\s]?4/i, 6500], [/i7[-\s]?3/i, 5000], [/i7[-\s]?2/i, 4200],
  [/i5[-\s]?14/i, 30000], [/i5[-\s]?13/i, 25000], [/i5[-\s]?12/i, 19000], [/i5[-\s]?11/i, 15000], [/i5[-\s]?10/i, 12500], [/i5[-\s]?9/i, 10000], [/i5[-\s]?8/i, 8500], [/i5[-\s]?7/i, 6500], [/i5[-\s]?6/i, 5500], [/i5[-\s]?4/i, 4200], [/i5[-\s]?3/i, 3300], [/i5[-\s]?2/i, 2600],
  [/i3[-\s]?14/i, 18000], [/i3[-\s]?13/i, 16000], [/i3[-\s]?12/i, 13500], [/i3[-\s]?10/i, 9000], [/i3[-\s]?9/i, 7500], [/i3[-\s]?8/i, 6500], [/i3[-\s]?7/i, 4500], [/i3[-\s]?6/i, 3800], [/i3[-\s]?4/i, 2800],
  [/ryzen\s*9\s*7/i, 55000], [/ryzen\s*9\s*5/i, 42000], [/ryzen\s*9\s*3/i, 32000],
  [/ryzen\s*7\s*7/i, 38000], [/ryzen\s*7\s*5/i, 28000], [/ryzen\s*7\s*3/i, 22000], [/ryzen\s*7\s*2/i, 17000], [/ryzen\s*7\s*1/i, 13000],
  [/ryzen\s*5\s*7/i, 28000], [/ryzen\s*5\s*5/i, 21000], [/ryzen\s*5\s*3/i, 16000], [/ryzen\s*5\s*2/i, 13000], [/ryzen\s*5\s*1/i, 9500],
  [/ryzen\s*3\s*7/i, 16000], [/ryzen\s*3\s*5/i, 13000], [/ryzen\s*3\s*3/i, 9000], [/ryzen\s*3\s*2/i, 7000], [/ryzen\s*3\s*1/i, 5000],
  [/fx[-\s]?8350/i, 6000], [/fx[-\s]?6300/i, 4200],
  [/core\s*2\s*quad/i, 2500], [/core\s*2\s*duo/i, 1200],
  [/quad[-\s]?core/i, 5000], [/dual[-\s]?core/i, 1800]
];

const GPU_MODEL_SCORES = [
  [/rtx\s*4090/i, 39000], [/rtx\s*4080/i, 35000], [/rtx\s*4070/i, 27000], [/rtx\s*4060/i, 20000], [/rtx\s*4050/i, 15000],
  [/rtx\s*3090/i, 30000], [/rtx\s*3080/i, 28000], [/rtx\s*3070/i, 22000], [/rtx\s*3060/i, 17000], [/rtx\s*3050/i, 13000],
  [/rtx\s*2080/i, 18000], [/rtx\s*2070/i, 16000], [/rtx\s*2060/i, 14000],
  [/gtx\s*1660/i, 11500], [/gtx\s*1650/i, 7800], [/gtx\s*1080\s*ti/i, 18000], [/gtx\s*1080/i, 15000], [/gtx\s*1070/i, 13000], [/gtx\s*1060/i, 10000], [/gtx\s*1050\s*ti/i, 6300], [/gtx\s*1050/i, 5000],
  [/gtx\s*980\s*ti/i, 12000], [/gtx\s*980/i, 9500], [/gtx\s*970/i, 8500], [/gtx\s*960/i, 6000], [/gtx\s*950/i, 4500],
  [/gtx\s*780\s*ti/i, 8500], [/gtx\s*780/i, 7500], [/gtx\s*770/i, 6000], [/gtx\s*760/i, 4800], [/gtx\s*750\s*ti/i, 3800], [/gtx\s*750/i, 3200],
  [/gtx\s*660/i, 3200], [/gtx\s*650/i, 2200], [/gtx\s*560/i, 1800],
  [/rx\s*7900/i, 32000], [/rx\s*7800/i, 27000], [/rx\s*7700/i, 24000], [/rx\s*7600/i, 19000],
  [/rx\s*6900/i, 27000], [/rx\s*6800/i, 24000], [/rx\s*6700/i, 19000], [/rx\s*6600/i, 14500], [/rx\s*6500/i, 9500],
  [/rx\s*590/i, 9500], [/rx\s*580/i, 8500], [/rx\s*570/i, 7500], [/rx\s*560/i, 4500], [/rx\s*550/i, 3000],
  [/r9\s*390/i, 8500], [/r9\s*380/i, 6000], [/r9\s*290/i, 7500], [/r9\s*280/i, 5500], [/r7\s*370/i, 4000], [/r7\s*260/i, 2200],
  [/intel\s*hd/i, 600], [/intel\s*iris/i, 2500], [/vega\s*8/i, 2500], [/vega\s*11/i, 3500],
  [/directx\s*11/i, 2500], [/directx\s*12/i, 6000]
];

function scoreFromRules(rawText, rules) {
  const text = normalizeText(rawText);
  if (!text) return 0;

  const matches = [];

  for (const [regex, score] of rules) {
    if (regex.test(text)) matches.push(score);
  }

  if (matches.length === 0) return 0;

  // 요구 사양에 "A / B"처럼 여러 제품이 있으면 보통 둘 중 하나면 되므로 가장 낮은 점수를 기준으로 사용
  return Math.min(...matches);
}

function parseCpuScore(requirementText) {
  const cpuLine = getLineValue(requirementText, ['processor', 'cpu', '프로세서']);
  return scoreFromRules(cpuLine || requirementText, CPU_MODEL_SCORES);
}

function parseGpuScore(requirementText) {
  const gpuLine = getLineValue(requirementText, ['graphics', 'video card', 'gpu', '그래픽']);
  return scoreFromRules(gpuLine || requirementText, GPU_MODEL_SCORES);
}

function parseRequirementToSpec(requirementText) {
  if (!requirementText || requirementText === '정보 없음') return null;

  const cpu = parseCpuScore(requirementText);
  const gpu = parseGpuScore(requirementText);
  const ram = parseRam(requirementText);

  if (!cpu && !gpu && !ram) return null;

  return { cpu, gpu, ram };
}

function getDirectGameSpec(game, type) {
  if (!game) return null;

  if (type === 'recommended') {
    return (
      game.recommendSpecScore ||
      game.recommendedSpecScore ||
      game.recommendedScore ||
      game.recommend_spec_score ||
      game.recommended_spec_score ||
      game.pcRecommendedSpec ||
      game.pc_recommended_spec ||
      null
    );
  }

  return (
    game.minSpecScore ||
    game.minimumSpecScore ||
    game.minimumScore ||
    game.min_spec_score ||
    game.minimum_spec_score ||
    game.pcMinSpec ||
    game.pc_min_spec ||
    null
  );
}

function getRequirementHtml(game, type) {
  if (!game) return '';

  const pcRequirements = game.pc_requirements || game.pcRequirements || game.system_requirements || game.systemRequirements || {};

  if (type === 'recommended') {
    return (
      pcRequirements.recommended ||
      pcRequirements.recommend ||
      game.recommended_requirements ||
      game.recommendedRequirements ||
      ''
    );
  }

  return (
    pcRequirements.minimum ||
    pcRequirements.min ||
    game.minimum_requirements ||
    game.minimumRequirements ||
    ''
  );
}

function getGameSpec(game, type) {
  const directSpec = getDirectGameSpec(game, type);
  if (directSpec) return directSpec;

  const requirementHtml = getRequirementHtml(game, type);
  return parseRequirementToSpec(requirementHtml);
}

function hasPassed(userSpec, targetSpec) {
  if (!userSpec || !targetSpec) return false;

  const userCpu = getSpecValue(userSpec, 'cpuScore');
  const userGpu = getSpecValue(userSpec, 'gpuScore');
  const userRam = getSpecValue(userSpec, 'ram');

  const targetCpu = getSpecValue(targetSpec, 'cpu');
  const targetGpu = getSpecValue(targetSpec, 'gpu');
  const targetRam = getSpecValue(targetSpec, 'ram');

  // 파싱이 안 된 항목은 비교에서 제외. 예: CPU만 못 찾았으면 GPU/RAM으로만 판단
  const cpuOk = targetCpu ? userCpu >= targetCpu : true;
  const gpuOk = targetGpu ? userGpu >= targetGpu : true;
  const ramOk = targetRam ? userRam >= targetRam : true;

  return cpuOk && gpuOk && ramOk;
}

function hasAnyComparableSpec(spec) {
  if (!spec) return false;
  return Boolean(getSpecValue(spec, 'cpu') || getSpecValue(spec, 'gpu') || getSpecValue(spec, 'ram'));
}

export function checkPcCompatibility(game, userSpec) {
  const currentUserSpec = userSpec || getUserPcSpec();

  if (!currentUserSpec) {
    return {
      status: 'unset',
      label: 'PC 사양 미설정',
      icon: '⚙️',
      color: '#aaa',
      background: 'rgba(255,255,255,0.08)',
      border: '#555'
    };
  }

  const minSpec = getGameSpec(game, 'minimum');
  const recommendedSpec = getGameSpec(game, 'recommended');

  if (!hasAnyComparableSpec(minSpec) && !hasAnyComparableSpec(recommendedSpec)) {
    return {
      status: 'unknown',
      label: '사양 정보 없음',
      icon: '❔',
      color: '#bbb',
      background: 'rgba(255,255,255,0.08)',
      border: '#555'
    };
  }

  if (hasAnyComparableSpec(recommendedSpec) && hasPassed(currentUserSpec, recommendedSpec)) {
    return {
      status: 'recommended',
      label: '쾌적하게 가능',
      icon: '✅',
      color: '#7CFF9B',
      background: 'rgba(76,175,80,0.18)',
      border: '#4CAF50'
    };
  }

  if (hasAnyComparableSpec(minSpec) && hasPassed(currentUserSpec, minSpec)) {
    return {
      status: 'minimum',
      label: '낮은 옵션 가능',
      icon: '⚠️',
      color: '#FFD166',
      background: 'rgba(255,193,7,0.18)',
      border: '#FFC107'
    };
  }

  return {
    status: 'fail',
    label: '사양 부족',
    icon: '❌',
    color: '#FF8A8A',
    background: 'rgba(229,9,20,0.18)',
    border: '#E50914'
  };
}

export function getCompatibilityStatus(game, userSpec) {
  return checkPcCompatibility(game, userSpec);
}

export function getCompatibilityText(game, userSpec) {
  const result = checkPcCompatibility(game, userSpec);
  return result.icon + ' ' + result.label;
}
