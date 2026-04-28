const fs = require('fs');
const path = require('path');

const root = process.cwd();
const srcDir = path.join(root, 'frontend', 'src');

function filePath(rel) {
  return path.join(root, rel);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function read(rel) {
  const p = filePath(rel);
  if (!fs.existsSync(p)) throw new Error(`파일을 찾을 수 없습니다: ${rel}`);
  return fs.readFileSync(p, 'utf8');
}

function write(rel, content) {
  const p = filePath(rel);
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, content, 'utf8');
  console.log(`작성 완료: ${rel}`);
}

function patch(rel, patcher) {
  const oldText = read(rel);
  const newText = patcher(oldText);
  if (newText === oldText) {
    console.log(`변경 없음 또는 이미 적용됨: ${rel}`);
    return;
  }
  fs.writeFileSync(filePath(rel), newText, 'utf8');
  console.log(`수정 완료: ${rel}`);
}

function addImport(text, importLine, afterPattern) {
  if (text.includes(importLine)) return text;
  if (afterPattern && text.includes(afterPattern)) {
    return text.replace(afterPattern, `${afterPattern}\n${importLine}`);
  }
  return `${importLine}\n${text}`;
}

const cpuScores = `export const CPU_OPTIONS = [
  { name: 'Intel Core i3-8100', score: 6200 },
  { name: 'Intel Core i3-10100', score: 8800 },
  { name: 'Intel Core i5-4460', score: 4800 },
  { name: 'Intel Core i5-8400', score: 9300 },
  { name: 'Intel Core i5-9400F', score: 9600 },
  { name: 'Intel Core i5-10400', score: 12300 },
  { name: 'Intel Core i5-11400F', score: 17000 },
  { name: 'Intel Core i5-12400F', score: 19500 },
  { name: 'Intel Core i5-13400F', score: 25000 },
  { name: 'Intel Core i7-7700', score: 8600 },
  { name: 'Intel Core i7-8700', score: 13000 },
  { name: 'Intel Core i7-9700K', score: 14500 },
  { name: 'Intel Core i7-10700K', score: 19000 },
  { name: 'Intel Core i7-12700K', score: 34500 },
  { name: 'Intel Core i7-13700K', score: 47000 },
  { name: 'Intel Core i9-9900K', score: 18800 },
  { name: 'Intel Core i9-12900K', score: 41000 },
  { name: 'Intel Core i9-13900K', score: 59000 },
  { name: 'AMD Ryzen 3 3100', score: 11700 },
  { name: 'AMD Ryzen 5 1600', score: 12300 },
  { name: 'AMD Ryzen 5 2600', score: 13200 },
  { name: 'AMD Ryzen 5 3600', score: 17800 },
  { name: 'AMD Ryzen 5 5600', score: 21500 },
  { name: 'AMD Ryzen 5 5600X', score: 22000 },
  { name: 'AMD Ryzen 5 7600', score: 27000 },
  { name: 'AMD Ryzen 7 2700X', score: 17600 },
  { name: 'AMD Ryzen 7 3700X', score: 22800 },
  { name: 'AMD Ryzen 7 5800X', score: 28000 },
  { name: 'AMD Ryzen 7 7700X', score: 36500 },
  { name: 'AMD Ryzen 9 5900X', score: 39000 },
  { name: 'AMD Ryzen 9 7900X', score: 52000 }
];

export const CPU_SCORE_MAP = CPU_OPTIONS.reduce((acc, item) => {
  acc[item.name.toLowerCase()] = item.score;
  return acc;
}, {});
`;

const gpuScores = `export const GPU_OPTIONS = [
  { name: 'Intel UHD Graphics 630', score: 1200 },
  { name: 'AMD Radeon Vega 8', score: 1700 },
  { name: 'NVIDIA GeForce GTX 750 Ti', score: 3900 },
  { name: 'NVIDIA GeForce GTX 960', score: 6000 },
  { name: 'NVIDIA GeForce GTX 970', score: 9700 },
  { name: 'NVIDIA GeForce GTX 1050 Ti', score: 6300 },
  { name: 'NVIDIA GeForce GTX 1060', score: 10000 },
  { name: 'NVIDIA GeForce GTX 1650', score: 7900 },
  { name: 'NVIDIA GeForce GTX 1660', score: 11700 },
  { name: 'NVIDIA GeForce GTX 1660 SUPER', score: 12700 },
  { name: 'NVIDIA GeForce RTX 2060', score: 14000 },
  { name: 'NVIDIA GeForce RTX 2070', score: 16000 },
  { name: 'NVIDIA GeForce RTX 2080', score: 18800 },
  { name: 'NVIDIA GeForce RTX 3050', score: 13000 },
  { name: 'NVIDIA GeForce RTX 3060', score: 17100 },
  { name: 'NVIDIA GeForce RTX 3060 Ti', score: 20500 },
  { name: 'NVIDIA GeForce RTX 3070', score: 22500 },
  { name: 'NVIDIA GeForce RTX 3080', score: 25500 },
  { name: 'NVIDIA GeForce RTX 4060', score: 19500 },
  { name: 'NVIDIA GeForce RTX 4060 Ti', score: 22500 },
  { name: 'NVIDIA GeForce RTX 4070', score: 27000 },
  { name: 'NVIDIA GeForce RTX 4080', score: 35000 },
  { name: 'AMD Radeon RX 570', score: 7000 },
  { name: 'AMD Radeon RX 580', score: 8800 },
  { name: 'AMD Radeon RX 5500 XT', score: 9200 },
  { name: 'AMD Radeon RX 5600 XT', score: 14000 },
  { name: 'AMD Radeon RX 6600', score: 16000 },
  { name: 'AMD Radeon RX 6600 XT', score: 17600 },
  { name: 'AMD Radeon RX 6700 XT', score: 22000 },
  { name: 'AMD Radeon RX 7600', score: 18000 },
  { name: 'AMD Radeon RX 7700 XT', score: 26000 },
  { name: 'AMD Radeon RX 7800 XT', score: 30000 }
];

export const GPU_SCORE_MAP = GPU_OPTIONS.reduce((acc, item) => {
  acc[item.name.toLowerCase()] = item.score;
  return acc;
}, {});
`;

const pcCompatibility = `import { CPU_OPTIONS } from '../data/hardware/cpuScores';
import { GPU_OPTIONS } from '../data/hardware/gpuScores';

export const PC_SPEC_STORAGE_KEY = 'userPcSpec';

const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9가-힣]+/g, ' ').trim();

const stripHtml = (value) => String(value || '')
  .replace(/<br\s*\/?>(\s*)/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/\s+/g, ' ')
  .trim();

export function getSavedPcSpec() {
  try {
    const raw = localStorage.getItem(PC_SPEC_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.cpuScore || !parsed.gpuScore || !parsed.ram) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePcSpec(spec) {
  localStorage.setItem(PC_SPEC_STORAGE_KEY, JSON.stringify(spec));
  window.dispatchEvent(new Event('pcSpecChanged'));
}

export function removePcSpec() {
  localStorage.removeItem(PC_SPEC_STORAGE_KEY);
  window.dispatchEvent(new Event('pcSpecChanged'));
}

function findBestScore(text, options) {
  const normalizedText = normalize(text);
  let best = null;

  options.forEach((item) => {
    const fullName = normalize(item.name);
    const compactName = normalize(item.name.replace(/^(intel|amd|nvidia|geforce|radeon)\s+/i, ''));
    const tokens = [fullName, compactName].filter(Boolean);

    if (tokens.some((token) => normalizedText.includes(token))) {
      if (!best || item.score > best.score) best = item;
    }
  });

  return best;
}

function extractRam(text) {
  const safe = String(text || '');
  const matches = [...safe.matchAll(/(\d+)\s*(gb|기가|기가바이트)/gi)].map((m) => Number(m[1]));
  if (matches.length === 0) return null;
  return Math.max(...matches);
}

function pickRequirementText(game, mode) {
  const keys = mode === 'recommended'
    ? ['recommendedSpec', 'recommendSpec', 'recommended_requirements', 'recommendedRequirements', 'pc_requirements_recommended']
    : ['minSpec', 'minimumSpec', 'minimum_requirements', 'minimumRequirements', 'pc_requirements_minimum'];

  for (const key of keys) {
    if (game?.[key]) return stripHtml(game[key]);
  }

  const req = game?.system_requirements || game?.requirements || game?.pc_requirements || game?.steam_requirements;
  if (typeof req === 'string') return stripHtml(req);
  if (req && typeof req === 'object') {
    const value = mode === 'recommended'
      ? (req.recommended || req.recommend || req.pc_recommended)
      : (req.minimum || req.min || req.pc_minimum);
    if (value) return stripHtml(value);
  }

  return '';
}

function getSpecScoreFromGame(game, mode) {
  const scoreKey = mode === 'recommended' ? 'recommendSpecScore' : 'minSpecScore';
  const altScoreKey = mode === 'recommended' ? 'recommendedSpecScore' : 'minimumSpecScore';
  const score = game?.[scoreKey] || game?.[altScoreKey];

  if (score?.cpu && score?.gpu && score?.ram) {
    return { cpu: Number(score.cpu), gpu: Number(score.gpu), ram: Number(score.ram) };
  }

  const text = pickRequirementText(game, mode);
  if (!text) return null;

  const cpu = findBestScore(text, CPU_OPTIONS);
  const gpu = findBestScore(text, GPU_OPTIONS);
  const ram = extractRam(text);

  if (!cpu && !gpu && !ram) return null;

  return {
    cpu: cpu?.score || 0,
    gpu: gpu?.score || 0,
    ram: ram || 0,
    cpuName: cpu?.name || '',
    gpuName: gpu?.name || '',
    raw: text
  };
}

export function getCompatibilityStatus(game, userSpec = getSavedPcSpec()) {
  if (!userSpec) {
    return {
      level: 'unset',
      icon: '⚙️',
      label: 'PC 사양 미설정',
      description: '마이페이지에서 내 PC 사양을 저장하면 호환 여부가 표시됩니다.'
    };
  }

  const minimum = getSpecScoreFromGame(game, 'minimum');
  const recommended = getSpecScoreFromGame(game, 'recommended');

  if (!minimum && !recommended) {
    return {
      level: 'unknown',
      icon: 'ℹ️',
      label: '사양 정보 없음',
      description: '이 게임의 최소/권장 사양 데이터를 찾지 못했습니다.'
    };
  }

  const rec = recommended || minimum;
  const min = minimum || recommended;

  const passRecommended =
    Number(userSpec.cpuScore) >= Number(rec.cpu || 0) &&
    Number(userSpec.gpuScore) >= Number(rec.gpu || 0) &&
    Number(userSpec.ram) >= Number(rec.ram || 0);

  const passMinimum =
    Number(userSpec.cpuScore) >= Number(min.cpu || 0) &&
    Number(userSpec.gpuScore) >= Number(min.gpu || 0) &&
    Number(userSpec.ram) >= Number(min.ram || 0);

  if (passRecommended) {
    return { level: 'good', icon: '✅', label: '쾌적하게 가능', description: '권장 사양 이상으로 판단됩니다.' };
  }

  if (passMinimum) {
    return { level: 'medium', icon: '⚠️', label: '낮은 옵션 가능', description: '최소 사양 이상이지만 옵션 조절이 필요할 수 있습니다.' };
  }

  return { level: 'bad', icon: '❌', label: '사양 부족', description: '최소 사양보다 낮아 실행이 어려울 수 있습니다.' };
}
`;

const badge = `import React, { useEffect, useState } from 'react';
import { getCompatibilityStatus, getSavedPcSpec } from '../utils/pcCompatibility';

const COLORS = {
  good: { bg: 'rgba(46, 204, 113, 0.16)', color: '#2ecc71', border: 'rgba(46, 204, 113, 0.35)' },
  medium: { bg: 'rgba(241, 196, 15, 0.16)', color: '#f1c40f', border: 'rgba(241, 196, 15, 0.35)' },
  bad: { bg: 'rgba(229, 9, 20, 0.16)', color: '#ff5a63', border: 'rgba(229, 9, 20, 0.35)' },
  unset: { bg: 'rgba(255, 255, 255, 0.08)', color: '#bbb', border: 'rgba(255, 255, 255, 0.18)' },
  unknown: { bg: 'rgba(255, 255, 255, 0.08)', color: '#aaa', border: 'rgba(255, 255, 255, 0.18)' }
};

export default function PcCompatibilityBadge({ game, compact = false, style = {} }) {
  const [userSpec, setUserSpec] = useState(() => getSavedPcSpec());

  useEffect(() => {
    const reload = () => setUserSpec(getSavedPcSpec());
    window.addEventListener('storage', reload);
    window.addEventListener('pcSpecChanged', reload);
    return () => {
      window.removeEventListener('storage', reload);
      window.removeEventListener('pcSpecChanged', reload);
    };
  }, []);

  const status = getCompatibilityStatus(game, userSpec);
  const color = COLORS[status.level] || COLORS.unknown;

  return (
    <div
      title={status.description}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        maxWidth: '100%',
        marginTop: compact ? '4px' : '8px',
        padding: compact ? '4px 7px' : '6px 9px',
        borderRadius: '999px',
        border: '1px solid ' + color.border,
        background: color.bg,
        color: color.color,
        fontSize: compact ? '10px' : '12px',
        fontWeight: 700,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        ...style
      }}
    >
      <span>{status.icon}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{status.label}</span>
    </div>
  );
}
`;

write('frontend/src/data/hardware/cpuScores.js', cpuScores);
write('frontend/src/data/hardware/gpuScores.js', gpuScores);
write('frontend/src/utils/pcCompatibility.js', pcCompatibility);
write('frontend/src/components/PcCompatibilityBadge.js', badge);

patch('frontend/src/pages/MyPage.js', (text) => {
  text = addImport(text, "import PcCompatibilityBadge from '../components/PcCompatibilityBadge';", "import { safeLocalStorage } from '../utils/storage';");
  text = addImport(text, "import { CPU_OPTIONS } from '../data/hardware/cpuScores';", "import PcCompatibilityBadge from '../components/PcCompatibilityBadge';");
  text = addImport(text, "import { GPU_OPTIONS } from '../data/hardware/gpuScores';", "import { CPU_OPTIONS } from '../data/hardware/cpuScores';");
  text = addImport(text, "import { savePcSpec, removePcSpec, getSavedPcSpec } from '../utils/pcCompatibility';", "import { GPU_OPTIONS } from '../data/hardware/gpuScores';");

  if (!text.includes('const [pcSpecForm, setPcSpecForm]')) {
    text = text.replace(
      "const [newDisplayName, setNewDisplayName] = useState('');",
      `const [newDisplayName, setNewDisplayName] = useState('');
    const [pcSpecForm, setPcSpecForm] = useState({ cpuName: '', gpuName: '', ram: 16 });
    const [savedPcSpec, setSavedPcSpec] = useState(null);`
    );
  }

  if (!text.includes('setSavedPcSpec(savedSpec);')) {
    text = text.replace(
      "setNewDisplayName(user?.displayName || user?.username || '');",
      `setNewDisplayName(user?.displayName || user?.username || '');
        const savedSpec = getSavedPcSpec();
        setSavedPcSpec(savedSpec);
        if (savedSpec) {
            setPcSpecForm({
                cpuName: savedSpec.cpuName || '',
                gpuName: savedSpec.gpuName || '',
                ram: savedSpec.ram || 16
            });
        }`
    );
  }

  if (!text.includes('const handleSavePcSpec = () =>')) {
    text = text.replace(
      '    return (',
      `    const handleSavePcSpec = () => {
        const selectedCpu = CPU_OPTIONS.find(cpu => cpu.name === pcSpecForm.cpuName);
        const selectedGpu = GPU_OPTIONS.find(gpu => gpu.name === pcSpecForm.gpuName);

        if (!selectedCpu) return alert('CPU를 선택해주세요.');
        if (!selectedGpu) return alert('그래픽카드를 선택해주세요.');

        const nextSpec = {
            cpuName: selectedCpu.name,
            cpuScore: selectedCpu.score,
            gpuName: selectedGpu.name,
            gpuScore: selectedGpu.score,
            ram: Number(pcSpecForm.ram)
        };

        savePcSpec(nextSpec);
        setSavedPcSpec(nextSpec);
        alert('PC 사양이 저장되었습니다.');
    };

    const handleRemovePcSpec = () => {
        if (!window.confirm('저장된 PC 사양을 삭제하시겠습니까?')) return;
        removePcSpec();
        setSavedPcSpec(null);
        setPcSpecForm({ cpuName: '', gpuName: '', ram: 16 });
        alert('PC 사양이 삭제되었습니다.');
    };

    return (`
    );
  }

  const pcPanel = `

            <div className="search-panel" style={{marginTop:'20px'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap'}}>
                    <h3 style={{margin: 0}}>🖥️ 내 PC 사양 설정</h3>
                    {savedPcSpec && (
                        <span style={{fontSize:'12px', color:'#4CAF50', fontWeight:'bold'}}>저장됨</span>
                    )}
                </div>

                <p style={{fontSize:'13px', color:'#aaa', lineHeight:1.5, marginTop:'10px'}}>
                    DB에는 저장하지 않고 현재 브라우저(localStorage)에만 저장됩니다. 저장 후 게임 카드에 호환 여부가 표시됩니다.
                </p>

                <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:'12px', marginTop:'15px'}}>
                    <label style={{display:'flex', flexDirection:'column', gap:'6px', color:'#ddd', fontSize:'13px'}}>
                        CPU
                        <select
                            value={pcSpecForm.cpuName}
                            onChange={(e) => setPcSpecForm(prev => ({ ...prev, cpuName: e.target.value }))}
                            style={{padding:'10px', borderRadius:'6px', border:'1px solid #444', background:'#111', color:'#fff'}}
                        >
                            <option value="">CPU 선택</option>
                            {CPU_OPTIONS.map(cpu => (
                                <option key={cpu.name} value={cpu.name}>{cpu.name}</option>
                            ))}
                        </select>
                    </label>

                    <label style={{display:'flex', flexDirection:'column', gap:'6px', color:'#ddd', fontSize:'13px'}}>
                        그래픽카드
                        <select
                            value={pcSpecForm.gpuName}
                            onChange={(e) => setPcSpecForm(prev => ({ ...prev, gpuName: e.target.value }))}
                            style={{padding:'10px', borderRadius:'6px', border:'1px solid #444', background:'#111', color:'#fff'}}
                        >
                            <option value="">그래픽카드 선택</option>
                            {GPU_OPTIONS.map(gpu => (
                                <option key={gpu.name} value={gpu.name}>{gpu.name}</option>
                            ))}
                        </select>
                    </label>

                    <label style={{display:'flex', flexDirection:'column', gap:'6px', color:'#ddd', fontSize:'13px'}}>
                        RAM
                        <select
                            value={pcSpecForm.ram}
                            onChange={(e) => setPcSpecForm(prev => ({ ...prev, ram: Number(e.target.value) }))}
                            style={{padding:'10px', borderRadius:'6px', border:'1px solid #444', background:'#111', color:'#fff'}}
                        >
                            {[4, 8, 12, 16, 24, 32, 64].map(ram => (
                                <option key={ram} value={ram}>{ram}GB</option>
                            ))}
                        </select>
                    </label>
                </div>

                {savedPcSpec && (
                    <div style={{marginTop:'12px', padding:'10px', background:'#111', border:'1px solid #333', borderRadius:'6px', color:'#ccc', fontSize:'13px', lineHeight:1.6}}>
                        현재 저장 사양: {savedPcSpec.cpuName} / {savedPcSpec.gpuName} / RAM {savedPcSpec.ram}GB
                    </div>
                )}

                <div style={{display:'flex', gap:'10px', marginTop:'15px', flexWrap:'wrap'}}>
                    <button onClick={handleSavePcSpec} className="search-btn">PC 사양 저장</button>
                    {savedPcSpec && (
                        <button onClick={handleRemovePcSpec} className="search-btn" style={{backgroundColor:'#666'}}>삭제</button>
                    )}
                </div>
            </div>`;

  if (!text.includes('🖥️ 내 PC 사양 설정')) {
    text = text.replace(
      /\n\s*<div className="search-panel" style=\{\{marginTop:'20px'\}\}>\s*\n\s*<div style=\{\{display: 'flex', justifyContent: 'space-between', alignItems: 'center'\}\}>\s*\n\s*<h3 style=\{\{margin: 0\}\}>🏷️ 나의 선호 태그<\/h3>/,
      `${pcPanel}\n\n            <div className="search-panel" style={{marginTop:'20px'}}>\n                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>\n                    <h3 style={{margin: 0}}>🏷️ 나의 선호 태그</h3>`
    );
  }

  if (!text.includes('<PcCompatibilityBadge game={game} compact />')) {
    text = text.replace(
      `<div style={{fontSize:'14px', fontWeight:'bold'}} className="text-truncate">{game.title_ko || game.title}</div>`,
      `<div style={{fontSize:'14px', fontWeight:'bold'}} className="text-truncate">{game.title_ko || game.title}</div>\n                                <PcCompatibilityBadge game={game} compact />`
    );
  }

  return text;
});

patch('frontend/src/MainPage.js', (text) => {
  text = addImport(text, "import PcCompatibilityBadge from './components/PcCompatibilityBadge';", "import { formatPrice } from './utils/priceFormatter';");
  if (!text.includes('<PcCompatibilityBadge game={game} compact />')) {
    text = text.replace(
      `{game.reason || '이 조건에 잘 맞아 추천'}`,
      `{game.reason || '이 조건에 잘 맞아 추천'}\n                <PcCompatibilityBadge game={game} compact />`
    );
  }
  return text;
});

patch('frontend/src/pages/PersonalRecoPage.js', (text) => {
  text = addImport(text, "import PcCompatibilityBadge from '../components/PcCompatibilityBadge';", "import { formatPrice } from '../utils/priceFormatter';");
  if (!text.includes('<PcCompatibilityBadge game={game} compact />')) {
    text = text.replace(
      `{game.title_ko || game.title || game.name}`,
      `{game.title_ko || game.title || game.name}\n                <PcCompatibilityBadge game={game} compact />`
    );
  }
  return text;
});

patch('frontend/src/SearchResultsPage.js', (text) => {
  text = addImport(text, "import PcCompatibilityBadge from './components/PcCompatibilityBadge';", "import { API_BASE_URL } from './config';");
  if (!text.includes('<PcCompatibilityBadge game={game} compact />')) {
    text = text.replace(
      `{game.title_ko || game.title}`,
      `{game.title_ko || game.title}\n                                <PcCompatibilityBadge game={game} compact />`
    );
  }
  return text;
});

patch('frontend/src/ComparisonPage.js', (text) => {
  text = addImport(text, "import PcCompatibilityBadge from './components/PcCompatibilityBadge';", "import { formatPrice } from './utils/priceFormatter';");
  if (!text.includes('<PcCompatibilityBadge game={game} />')) {
    text = text.replace(
      `<h3 style={{marginTop:0, color:'#fff'}}>{game.title_ko || game.title}</h3>`,
      `<h3 style={{marginTop:0, color:'#fff'}}>{game.title_ko || game.title}</h3>\n                            <PcCompatibilityBadge game={game} />`
    );
  }
  return text;
});

patch('frontend/src/ShopPage.js', (text) => {
  text = addImport(text, "import PcCompatibilityBadge from './components/PcCompatibilityBadge';", "import { safeLocalStorage } from './utils/storage';");
  if (!text.includes('<PcCompatibilityBadge game={gameData} />')) {
    text = text.replace(
      `{gameData.steam_ccu > 0 &&`,
      `<PcCompatibilityBadge game={gameData} />\n                    {gameData.steam_ccu > 0 &&`
    );
  }
  return text;
});

console.log('\nPC 사양 호환 기능 적용 완료');
console.log('실행 후 npm start로 화면 확인하고, 문제가 없으면 git add/commit/push 하세요.');
