/**
 * rehearsal_fill.js  (v3 - 자연스러운 시계열 시뮬레이션)
 * ─────────────────────────────────────────────────────────────────
 * 직선 문제 해결:
 *  - 요일별 가중치 (주말 > 평일)
 *  - 랜덤워크: 전날 대비 ±20~40% 변동
 *  - 스파이크 이벤트: 주 1~2회 1.5~2.5배 피크
 *  - Mulberry32 PRNG: appid+날짜 조합 시드 → 진짜 랜덤처럼 보이는 고정값
 *
 * 되돌리기: node scripts/rehearsal_cleanup.js
 * ─────────────────────────────────────────────────────────────────
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('../models/Game');
const { MONGODB_URI } = process.env;
if (!MONGODB_URI) { console.error('❌ MONGODB_URI 누락'); process.exit(1); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ══════════════════════════════════════════════════════════════════
// 1. Mulberry32 PRNG — 시드 기반의 품질 좋은 의사난수 생성기
//    같은 시드 → 항상 같은 수열 (재현 가능)
//    appid + 날짜(ms)를 조합해 게임/날짜별로 고유한 수열 생성
// ══════════════════════════════════════════════════════════════════
function makePRNG(seed) {
    let s = seed >>> 0;
    return function () {
        s += 0x6D2B79F5;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), 1 | t);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
// appid + 날짜 조합 시드 (서로 다른 날짜/게임은 완전히 다른 수열)
function gameDaySeed(appid, dateMs) {
    // 날짜를 일 단위로 환산 (같은 날이면 같은 값)
    const dayIndex = Math.floor(dateMs / 86400000);
    // 비트 혼합으로 시드 생성
    let h = (appid * 1000003 + dayIndex * 999983) >>> 0;
    h ^= h >>> 16; h = Math.imul(h, 0x45d9f3b); h ^= h >>> 16;
    return h;
}

// ══════════════════════════════════════════════════════════════════
// 2. 요일별 시청자 배율 (월=0 ~ 일=6)
//    실제 스트리밍 플랫폼의 요일 트렌드 반영
// ══════════════════════════════════════════════════════════════════
const DOW_MULT = [
    0.72,  // 월요일 — 직장/학교 시작, 최저
    0.78,  // 화요일
    0.82,  // 수요일
    0.88,  // 목요일
    1.05,  // 금요일 — 퇴근 후 급상승
    1.42,  // 토요일 — 주말 피크
    1.35,  // 일요일 — 피크이나 월요일 대비 약간 하락
];

// ══════════════════════════════════════════════════════════════════
// 3. 자연스러운 7일치 시청자 시계열 생성
//    - 오늘(anchor) 기준으로 과거 방향으로 랜덤워크
//    - 요일 가중치 × 랜덤워크 × 이벤트 스파이크
// ══════════════════════════════════════════════════════════════════
function generateTimeSeries(appid, anchor, days, now) {
    // anchor가 너무 작으면 최소값 설정 (차트 의미 있으려면)
    const base = Math.max(anchor, 5);
    const series = []; // index 0 = 오늘, 1 = 어제, ...

    let current = base;
    for (let daysAgo = 0; daysAgo <= days; daysAgo++) {
        const dt = new Date(now - daysAgo * 86400000);
        const dow = dt.getDay(); // 0=일, 1=월, ..., 6=토
        const rng = makePRNG(gameDaySeed(appid, dt.getTime()));

        // 요일 배율
        const dowFactor = DOW_MULT[dow];

        // 랜덤워크: 전날 대비 -30% ~ +35% 변동
        const walkDelta = -0.30 + rng() * 0.65;
        current = current * (1 + walkDelta);
        // 너무 벗어나면 anchor 쪽으로 당겨옴 (mean-reversion)
        const reversion = 0.15;
        current = current + reversion * (base - current);

        // 이벤트 스파이크: 15% 확률로 1.5~2.5배 피크
        let spike = 1.0;
        if (rng() < 0.15) {
            spike = 1.5 + rng() * 1.0;
        }

        // 최종값 = 랜덤워크값 × 요일배율 × 스파이크, 최소 1
        const value = Math.max(Math.round(current * dowFactor * spike), 1);
        series.push({ daysAgo, dt, value });
    }
    return series;
}

// ══════════════════════════════════════════════════════════════════
// 4. 장르별 한국 플랫폼 비율 테이블
// ══════════════════════════════════════════════════════════════════
const GENRE_RATIO = {
    'MOBA':         { ratio: [2.0, 4.0], chzzkShare: 0.65 },
    '온라인RPG':    { ratio: [1.5, 3.0], chzzkShare: 0.55 },
    '배틀로얄':     { ratio: [0.8, 1.5], chzzkShare: 0.60 },
    'FPS':          { ratio: [0.6, 1.2], chzzkShare: 0.65 },
    'PvP':          { ratio: [0.5, 1.0], chzzkShare: 0.60 },
    '경쟁':         { ratio: [0.5, 1.0], chzzkShare: 0.60 },
    '격투':         { ratio: [0.4, 0.8], chzzkShare: 0.55 },
    '공포':         { ratio: [0.6, 1.0], chzzkShare: 0.70 },
    '생존':         { ratio: [0.5, 0.9], chzzkShare: 0.60 },
    '협동':         { ratio: [0.5, 0.9], chzzkShare: 0.65 },
    '로컬협동':     { ratio: [0.6, 1.0], chzzkShare: 0.70 },
    '멀티플레이':   { ratio: [0.4, 0.8], chzzkShare: 0.60 },
    '소울라이크':   { ratio: [0.4, 0.8], chzzkShare: 0.60 },
    '메트로배니아': { ratio: [0.3, 0.6], chzzkShare: 0.55 },
    '로그라이크':   { ratio: [0.2, 0.5], chzzkShare: 0.55 },
    'RPG':          { ratio: [0.3, 0.6], chzzkShare: 0.55 },
    '액션':         { ratio: [0.3, 0.6], chzzkShare: 0.55 },
    '어드벤처':     { ratio: [0.2, 0.5], chzzkShare: 0.55 },
    '전략':         { ratio: [0.15, 0.4], chzzkShare: 0.50 },
    '턴제':         { ratio: [0.10, 0.3], chzzkShare: 0.50 },
    '시뮬레이션':   { ratio: [0.10, 0.3], chzzkShare: 0.50 },
    '자원관리':     { ratio: [0.08, 0.25], chzzkShare: 0.50 },
    '기지건설':     { ratio: [0.08, 0.25], chzzkShare: 0.50 },
    '힐링':         { ratio: [0.12, 0.3], chzzkShare: 0.60 },
    '캐주얼':       { ratio: [0.10, 0.25], chzzkShare: 0.55 },
    '퍼즐':         { ratio: [0.08, 0.2], chzzkShare: 0.55 },
    '플랫포머':     { ratio: [0.10, 0.25], chzzkShare: 0.55 },
    '리듬':         { ratio: [0.15, 0.35], chzzkShare: 0.60 },
    '비주얼노벨':   { ratio: [0.08, 0.2], chzzkShare: 0.55 },
    '카드게임':     { ratio: [0.10, 0.25], chzzkShare: 0.55 },
    'default':      { ratio: [0.10, 0.20], chzzkShare: 0.55 },
};
const TAG_PRIORITY = [
    'MOBA','배틀로얄','FPS','공포','로컬협동','협동','격투','소울라이크',
    'RPG','PvP','경쟁','생존','멀티플레이','메트로배니아','로그라이크',
    '액션','어드벤처','전략','턴제','시뮬레이션','자원관리','기지건설',
    '힐링','리듬','캐주얼','퍼즐','플랫포머','비주얼노벨','카드게임',
];
function getGenreProfile(game) {
    const tags = [...(game.smart_tags || []), ...(game.tags || [])];
    for (const p of TAG_PRIORITY) {
        if (tags.some(t => t === p || t.includes(p))) return { genre: p, ...GENRE_RATIO[p] };
    }
    return { genre: 'default', ...GENRE_RATIO.default };
}
function isKoreanGame(game) {
    if (game.title_ko && game.title_ko !== game.title && /[가-힣]/.test(game.title_ko)) return true;
    const kw = ['로스트아크','메이플','배틀그라운드','이터널','쓰론','퍼스트 디센던트','스텔라 블레이드','나인 솔즈'];
    return kw.some(k => ((game.title_ko||'')+' '+(game.title||'')).includes(k));
}

// 게임별 오늘 기준 치지직/SOOP 앵커값 계산
function calcAnchorKorean(game, twitchViewers) {
    if (!game.steam_appid) return { chzzk: 0, soop: 0 };
    const profile = getGenreProfile(game);
    const korean = isKoreanGame(game);

    let effectiveTwitch = twitchViewers;
    if (effectiveTwitch <= 0 && game.steam_ccu > 0) {
        const rng = makePRNG(gameDaySeed(game.steam_appid, 9999));
        effectiveTwitch = Math.round(game.steam_ccu * (0.003 + rng() * 0.012));
    }
    if (effectiveTwitch <= 0) {
        const reviewTotal = game.steam_reviews?.overall?.total || 0;
        if (reviewTotal > 0) effectiveTwitch = Math.round(Math.log10(reviewTotal + 1) * 5);
    }
    if (effectiveTwitch <= 0) return { chzzk: 0, soop: 0 };

    let [rMin, rMax] = profile.ratio;
    if (korean) { rMin *= 2.5; rMax *= 2.5; }

    // 앵커 비율: appid로 고정
    const rng = makePRNG(game.steam_appid ^ 0xDEAD);
    const ratio = rMin + rng() * (rMax - rMin);
    const totalKorean = Math.round(effectiveTwitch * ratio);

    const chzzkShare = profile.chzzkShare + (rng() * 0.1 - 0.05);
    const chzzk = Math.round(totalKorean * Math.min(Math.max(chzzkShare, 0.3), 0.8));
    const soop = Math.max(totalKorean - chzzk, 0);
    return { chzzk, soop };
}

// ══════════════════════════════════════════════════════════════════
// 5. 치지직 / SOOP API 수집
// ══════════════════════════════════════════════════════════════════
const CHZZK_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json', 'Accept-Language': 'ko-KR,ko;q=0.9',
    'Origin': 'https://chzzk.naver.com', 'Referer': 'https://chzzk.naver.com/',
};
function normalize(str) { return (str||'').replace(/[^a-zA-Z0-9가-힣]/g,'').toLowerCase(); }

async function loadChzzkMap() {
    const map = {};
    for (const size of [20,30,50]) {
        try {
            const res = await axios.get(`https://api.chzzk.naver.com/service/v1/lives?size=${size}&sortType=POPULAR`,{ headers: CHZZK_HEADERS, timeout: 12000 });
            const lives = res.data?.content?.data || [];
            for (const item of lives) {
                const live = item.live||item;
                if (!live || live.categoryType !== 'GAME') continue;
                const cat = normalize(live.liveCategoryValue||'');
                if (cat) map[cat] = (map[cat]||0) + (live.concurrentUserCount||0);
            }
            console.log(`  [치지직] ${Object.keys(map).length}개 카테고리 로드`); break;
        } catch(e) { if(e.response?.status===400) continue; break; }
    }
    return map;
}
async function loadSoopMap() {
    const map = {}; const clientId = process.env.SOOP_CLIENT_ID;
    if (!clientId) { console.log('  [SOOP] 스킵'); return map; }
    try {
        const catRes = await axios.get('https://openapi.sooplive.com/broad/category/list',{ params:{client_id:clientId,locale:'ko_KR'}, headers:{'Accept':'*/*'}, timeout:12000 });
        const gameCat = (catRes.data?.broad_category||[]).find(c=>c.cate_no==='00040000');
        const cateNoToName = {};
        for (const c of (gameCat?.child||[])) { if(c.cate_no&&c.cate_name) cateNoToName[c.cate_no]=c.cate_name; }
        const cateNoViewers = {};
        for (let page=1; page<=5; page++) {
            try {
                const res = await axios.get('https://openapi.sooplive.com/broad/list',{ params:{client_id:clientId,select_key:'cate',select_value:'00040000',order_type:'view_cnt',page_no:page}, headers:{'Accept':'*/*'}, timeout:12000 });
                const broads = res.data?.broad||[]; if(!broads.length) break;
                for (const b of broads) { const cno=b.broad_cate_no||''; if(cno) cateNoViewers[cno]=(cateNoViewers[cno]||0)+Number(b.total_view_cnt||0); }
                await sleep(200);
            } catch { break; }
        }
        for (const [cno,viewers] of Object.entries(cateNoViewers)) { const name=cateNoToName[cno]; if(name) map[normalize(name)]=(map[normalize(name)]||0)+viewers; }
        console.log(`  [SOOP] ${Object.keys(map).length}개 카테고리 로드`);
    } catch(e) { console.log(`  [SOOP] 실패: ${e.message}`); }
    return map;
}
function findInApiMap(map, game) {
    const keys = [normalize(game.title), normalize(game.title_ko||'')].filter(Boolean);
    let best = 0;
    for (const [catKey, viewers] of Object.entries(map)) {
        for (const k of keys) {
            if (k.length>=2 && (catKey.includes(k)||k.includes(catKey)) && viewers>best) best=viewers;
        }
    }
    return best;
}

// ══════════════════════════════════════════════════════════════════
// 6. TrendHistory 도큐먼트 생성 — 시계열 적용
// ══════════════════════════════════════════════════════════════════
function buildNaturalHistoryDocs(game, chzzkAnchor, soopAnchor, twitchAnchor, steamCcuAnchor, existingDays, now) {
    const DAYS = 14; // 14일치 생성 (차트가 더 풍부하게 보임)
    const inserts = [];

    // 각 시계열 독립 생성 (seed 다르게 → 다른 패턴)
    const chzzkSeries = generateTimeSeries(game.steam_appid,          chzzkAnchor,  DAYS, now);
    const soopSeries  = generateTimeSeries(game.steam_appid ^ 0xABCD, soopAnchor,   DAYS, now);
    const twitchSeries= generateTimeSeries(game.steam_appid ^ 0x1234, twitchAnchor, DAYS, now);
    const steamSeries = generateTimeSeries(game.steam_appid ^ 0x5678, steamCcuAnchor, DAYS, now);

    for (let i = 1; i <= DAYS; i++) {
        const entry = chzzkSeries[i];
        if (!entry) continue;
        const dt = entry.dt;
        const dayKey = `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
        if (existingDays.has(dayKey)) continue;

        const c = chzzkSeries[i]?.value || 0;
        const s = soopSeries[i]?.value  || 0;
        const t = twitchSeries[i]?.value || 0;
        const sc= steamSeries[i]?.value  || 0;

        inserts.push({
            steam_appid: game.steam_appid,
            trend_score: t + ((c+s)*2) + Math.round(sc*0.3),
            twitch_viewers: t,
            chzzk_viewers: c,
            soop_viewers: s,
            steam_ccu: sc,
            recordedAt: dt,
            isEstimated: true,
        });
    }
    return inserts;
}

// ══════════════════════════════════════════════════════════════════
// 7. 메인
// ══════════════════════════════════════════════════════════════════
async function main() {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ DB 연결 완료\n');

    console.log('📡 치지직 / SOOP 현재 방송 데이터 수집 중...');
    const chzzkApiMap = await loadChzzkMap();
    const soopApiMap  = await loadSoopMap();
    console.log('');

    const games = await Game.find({ steam_appid: { $exists: true, $ne: null } })
        .select('steam_appid title title_ko twitch_viewers chzzk_viewers soop_viewers steam_ccu smart_tags tags steam_reviews')
        .lean();
    console.log(`🎮 전체 처리 대상: ${games.length}개 게임\n`);

    const col = mongoose.connection.collection('trend_history');
    const now = new Date();
    const fourteenDaysAgo = new Date(now - 14 * 86400000);

    console.log('📂 기존 TrendHistory 로드 중...');
    const allAppids = games.map(g => g.steam_appid);
    const existingRecs = await col.find({
        steam_appid: { $in: allAppids },
        recordedAt: { $gte: fourteenDaysAgo },
    }).toArray();

    // appid → 날짜Set
    const existingDayMap = {};
    for (const rec of existingRecs) {
        const d = new Date(rec.recordedAt);
        const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        if (!existingDayMap[rec.steam_appid]) existingDayMap[rec.steam_appid] = new Set();
        existingDayMap[rec.steam_appid].add(dayKey);
    }
    console.log(`  기존 레코드 ${existingRecs.length}건 로드 완료\n`);

    // 기존 레코드 중 chzzk=0 & soop=0인 것 시계열로 업데이트
    const existingUpdateOps = [];
    for (const rec of existingRecs) {
        if (rec.chzzk_viewers !== 0 || rec.soop_viewers !== 0) continue;
        // 이 레코드의 appid에 해당하는 게임 찾기
        const game = games.find(g => g.steam_appid === rec.steam_appid);
        if (!game) continue;

        const chzzkAnchor = game.chzzk_viewers || 0;
        const soopAnchor  = game.soop_viewers  || 0;
        if (chzzkAnchor === 0 && soopAnchor === 0) continue;

        const d = new Date(rec.recordedAt);
        const daysAgo = Math.round((now - d) / 86400000);
        const dow = d.getDay();

        const cSeries = generateTimeSeries(game.steam_appid,          chzzkAnchor, daysAgo+1, now);
        const sSeries = generateTimeSeries(game.steam_appid ^ 0xABCD, soopAnchor,  daysAgo+1, now);

        const c = cSeries[daysAgo]?.value || 0;
        const s = sSeries[daysAgo]?.value  || 0;
        existingUpdateOps.push({
            updateOne: {
                filter: { _id: rec._id },
                update: { $set: {
                    chzzk_viewers: c, soop_viewers: s,
                    trend_score: (rec.twitch_viewers||0) + ((c+s)*2) + Math.round((rec.steam_ccu||0)*0.3),
                    isEstimated: true,
                }}
            }
        });
    }
    if (existingUpdateOps.length > 0) {
        await col.bulkWrite(existingUpdateOps, { ordered: false });
        console.log(`  기존 레코드 ${existingUpdateOps.length}건 시계열 업데이트 완료\n`);
    }

    let fromAPI = 0, fromEst = 0, skipped = 0;
    const BATCH = 200;

    for (let bStart = 0; bStart < games.length; bStart += BATCH) {
        const batch = games.slice(bStart, bStart + BATCH);
        const gameUpdateOps = [];
        const historyInserts = [];

        for (const game of batch) {
            if (!game.steam_appid) { skipped++; continue; }

            // API 실측
            const apiChzzk = findInApiMap(chzzkApiMap, game);
            const apiSoop  = findInApiMap(soopApiMap, game);

            let chzzkAnchor, soopAnchor, source;
            if (apiChzzk > 0 || apiSoop > 0) {
                chzzkAnchor = apiChzzk; soopAnchor = apiSoop;
                source = 'API'; fromAPI++;
            } else {
                const est = calcAnchorKorean(game, game.twitch_viewers||0);
                chzzkAnchor = est.chzzk; soopAnchor = est.soop;
                source = 'genre-est';
                if (chzzkAnchor === 0 && soopAnchor === 0) { skipped++; continue; }
                fromEst++;
            }

            const trendScore = (game.twitch_viewers||0) + ((chzzkAnchor+soopAnchor)*2) + Math.round((game.steam_ccu||0)*0.3);
            gameUpdateOps.push({
                updateOne: {
                    filter: { steam_appid: game.steam_appid },
                    update: { $set: { chzzk_viewers: chzzkAnchor, soop_viewers: soopAnchor, trend_score: trendScore } }
                }
            });

            // 자연스러운 14일치 히스토리 생성
            const existingDays = existingDayMap[game.steam_appid] || new Set();
            const newDocs = buildNaturalHistoryDocs(
                game, chzzkAnchor, soopAnchor,
                game.twitch_viewers||0, game.steam_ccu||0,
                existingDays, now
            );
            historyInserts.push(...newDocs);
        }

        if (gameUpdateOps.length > 0)  await Game.bulkWrite(gameUpdateOps, { ordered: false });
        if (historyInserts.length > 0) await col.insertMany(historyInserts, { ordered: false });

        const progress = Math.min(bStart + BATCH, games.length);
        console.log(`[${progress}/${games.length}] 배치 완료 | API:${fromAPI} 추정:${fromEst} 스킵:${skipped}`);
    }

    console.log('\n──────────────────────────────────────────');
    console.log(`✅ 완료! API:${fromAPI} 장르추정:${fromEst} 스킵:${skipped}`);
    console.log('🗑️  되돌리려면: node scripts/rehearsal_cleanup.js');
    process.exit(0);
}

main().catch(e => { console.error('오류:', e); process.exit(1); });
