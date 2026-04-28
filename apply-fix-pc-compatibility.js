const fs = require('fs');
const path = require('path');

const targetPath = path.join(process.cwd(), 'frontend', 'src', 'utils', 'pcCompatibility.js');

const content = `// src/utils/pcCompatibility.js

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

function normalizeNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function getSpecValue(spec, key) {
  if (!spec) return 0;

  if (Object.prototype.hasOwnProperty.call(spec, key)) {
    return normalizeNumber(spec[key]);
  }

  return 0;
}

function getGameSpec(game, type) {
  if (!game) return null;

  if (type === 'recommended') {
    return (
      game.recommendSpecScore ||
      game.recommendedSpecScore ||
      game.recommendedScore ||
      game.recommend_spec_score ||
      null
    );
  }

  return (
    game.minSpecScore ||
    game.minimumSpecScore ||
    game.minimumScore ||
    game.min_spec_score ||
    null
  );
}

function hasPassed(userSpec, targetSpec) {
  if (!userSpec || !targetSpec) return false;

  const userCpu = getSpecValue(userSpec, 'cpuScore');
  const userGpu = getSpecValue(userSpec, 'gpuScore');
  const userRam = getSpecValue(userSpec, 'ram');

  const targetCpu = getSpecValue(targetSpec, 'cpu');
  const targetGpu = getSpecValue(targetSpec, 'gpu');
  const targetRam = getSpecValue(targetSpec, 'ram');

  return userCpu >= targetCpu && userGpu >= targetGpu && userRam >= targetRam;
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

  if (!minSpec && !recommendedSpec) {
    return {
      status: 'unknown',
      label: '사양 정보 없음',
      icon: '❔',
      color: '#bbb',
      background: 'rgba(255,255,255,0.08)',
      border: '#555'
    };
  }

  if (recommendedSpec && hasPassed(currentUserSpec, recommendedSpec)) {
    return {
      status: 'recommended',
      label: '쾌적하게 가능',
      icon: '✅',
      color: '#7CFF9B',
      background: 'rgba(76,175,80,0.18)',
      border: '#4CAF50'
    };
  }

  if (minSpec && hasPassed(currentUserSpec, minSpec)) {
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

export function getCompatibilityText(game, userSpec) {
  const result = checkPcCompatibility(game, userSpec);
  return result.icon + ' ' + result.label;
}
`;

fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.writeFileSync(targetPath, content, 'utf8');

console.log('수정 완료:', targetPath);
console.log('이제 frontend에서 npm start를 다시 실행하세요.');
