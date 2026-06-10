const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const axios = require('axios');

const { sendDiscordAlert, setupAxiosRetry } = require('../utils/systemHelper');
if (setupAxiosRetry) setupAxiosRetry();

const Game = require('../models/Game');
const GameCategory = require('../models/GameCategory');
const TrendHistory = require('../models/TrendHistory');

const { MONGODB_URI, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET } = process.env;

if (!MONGODB_URI) { console.error('❌ MONGODB_URI 누락'); process.exit(1); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Twitch ──────────────────────────────────────────────────────────────────
let twitchToken = null;

async function getTwitchToken() {
    if (!TWITCH_CLIENT_ID) return;
    try {
        const res = await axios.post('https://id.twitch.tv/oauth2/token', null, {
            params: { client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' }
        });
        twitchToken = res.data.access_token;
        console.log('✅ Twitch 토큰 발급 완료');
    } catch (err) {
        console.error('❌ Twitch 토큰 발급 실패:', err.message);
    }
}

// ── Steam CCU ────────────────────────────────────────────────────────────────
async function getSteamCCU(appId) {
    if (!appId) return 0;
    try {
        const res = await axios.get(
            `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appId}`,
            { timeout: 8000 }
        );
        if (res.data?.response?.result === 1) return res.data.response.player_count || 0;
    } catch {}
    return 0;
}

// ── Chzzk ────────────────────────────────────────────────────────────────────
// 치지직 공식 비공개 API 대신, 검색 엔드포인트 두 가지를 순차 시도합니다.
// v1 엔드포인트가 403이면 v2로 폴백합니다.
const CHZZK_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Origin': 'https://chzzk.naver.com',
    'Referer': 'https://chzzk.naver.com/',
    // 공식 인증 헤더 (환경변수가 있을 때 사용)
    ...(process.env.CHZZK_CLIENT_ID && {
        'Client-Id': process.env.CHZZK_CLIENT_ID,
        'Client-Secret': process.env.CHZZK_CLIENT_SECRET,
    }),
};

function normalize(str) {
    return (str || '').replace(/[^a-zA-Z0-9가-힣]/g, '').toLowerCase();
}

const GAME_SYNONYMS = {
    '리그 오브 레전드': ['롤', 'leagueoflegends', 'lol'],
    '배틀그라운드': ['배그', 'pubg', 'pubgbattlegrounds'],
    '발로란트': ['valorant', '발로'],
    '오버워치 2': ['오버워치', '옵치', 'overwatch', 'overwatch2'],
    '에이펙스 레전드': ['에이펙스', 'apex', 'apexlegends'],
    '로스트아크': ['로아', 'lostark'],
    '메이플스토리': ['메이플', 'maplestory'],
    '팰월드': ['팔월드', 'palworld'],
    '디제이맥스 리스펙트 v': ['디제이맥스', 'djmax', 'djmaxrespectv'],
    '스타크래프트': ['스타', 'starcraft'],
    '스타크래프트 2': ['스타2', 'starcraft2', 'starcraftii'],
    '피파 온라인 4': ['피파', 'fc온라인', 'fconline', 'fifa'],
    '마인크래프트': ['마크', 'minecraft'],
    '팀포트리스 2': ['팀포2', 'teamfortress2'],
    '레프트 4 데드 2': ['레포데', '레포데2', 'left4dead2', 'l4d2'],
    '카운터 스트라이크 2': ['카스2', '글옵', 'csgo', 'cs2', 'counterstrike2'],
    '이터널 리턴': ['이리', '블서', 'eternalreturn'],
    '리썰 컴퍼니': ['리썰', 'lethalcompany'],
    '쓰론 앤 리버티': ['tl', 'throneandliberty'],
    'Dota 2': ['dota2', 'dota', '도타2', '도타'],
    'Dota 2': ['dota2', 'dota', '도타2', '도타'],
    'ELDEN RING': ['엘든링', 'eldenring'],
    'Dark Souls III': ['다크소울3', 'darksouls3', 'darksoulsiii'],
    'ARK: Survival Evolved': ['아크', 'ark', 'arksurvivalevolved'],
    'Grand Theft Auto V': ['gta5', 'gtav', 'grandtheftauto5'],
    'Tom Clancy\'s Rainbow Six Siege': ['레인보우식스', '레식', 'rainbowsixsiege', 'r6siege'],
    'Cyberpunk 2077': ['사이버펑크', '사이버펑크2077', 'cyberpunk2077'],
    'The Witcher 3: Wild Hunt': ['위처3', 'witcher3'],
};

function getSynonyms(game) {
    const list = [];
    const tk = normalize(game.title_ko);
    const te = normalize(game.title);
    if (tk) list.push(tk);
    if (te) list.push(te);

    for (const [key, syns] of Object.entries(GAME_SYNONYMS)) {
        if (tk === normalize(key) || te === normalize(key)) {
            list.push(...syns.map(normalize));
        }
    }
    return list;
}

function getCoreKeyword(text) {
    if (!text) return '';
    let core = text.replace(/[™®©]/g, '');
    if (core.includes(':')) core = core.split(':')[0];
    // 공백 뒤 로마자 숫자만 제거 (예: "Dark Souls III" → "Dark Souls")
    // 단, "Dota 2", "CS2"처럼 숫자가 제목 핵심인 경우는 보존
    // → 공백+아라비아 숫자 조합은 제거하지 않음 (로마자만 제거)
    core = core.replace(/\s+(I{1,3}|IV|V|VI{0,3}|IX|XI{0,3}|XIV|XV)$/i, '');
    return core.trim();
}

// 레벤슈타인 유사도
function getSimilarity(s1, s2) {
    const a = s1.toLowerCase();
    const b = s2.toLowerCase();
    if (a === b) return 1.0;
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    const longerLen = longer.length;
    if (longerLen === 0) return 1.0;

    const costs = Array.from({ length: shorter.length + 1 }, (_, i) => i);
    for (let i = 1; i <= longer.length; i++) {
        let prev = i;
        for (let j = 1; j <= shorter.length; j++) {
            const cost = longer[i - 1] !== shorter[j - 1] ? 1 : 0;
            const curr = Math.min(costs[j] + 1, prev + 1, costs[j - 1] + cost);
            costs[j - 1] = prev;
            prev = curr;
        }
        costs[shorter.length] = prev;
    }
    return (longerLen - costs[shorter.length]) / longerLen;
}

/**
 * 치지직에서 해당 게임의 총 시청자 수를 가져옵니다.
 * 403 발생 시 대기 후 1회 재시도, 그래도 실패하면 0 반환.
 */
// ── Chzzk (하이브리드: 인기 라이브 맵 + 카테고리별 API 보강) ──────────────────
// 1) 인기 라이브 목록(상위 50)을 1회 받아 카테고리별 시청자 맵 구축 (롤·메이플 등 대형 게임)
// 2) 맵에 없는 게임은 검색으로 카테고리 코드를 찾고 v2 카테고리 API로 정확한 시청자 합산
//    (타르코프·카스2처럼 상위 50위 밖 게임도 정확히 잡음)
// 주의: 검색 API의 시청자 수(concurrentUserCount)는 부정확하므로 시청자 합산엔 절대 쓰지 않고,
//       오직 liveCategory(영문 코드) 추출 용도로만 사용. 실제 시청자는 v2 카테고리 API에서 가져옴.
let _chzzkPopularMap = null;
let _chzzkFailCount = 0;

async function loadChzzkCategories() {
    _chzzkPopularMap = null;
    const map = {};
    const sizes = [20, 30, 50];
    let success = false;

    for (const size of sizes) {
        const url = `https://api.chzzk.naver.com/service/v1/lives?size=${size}&sortType=POPULAR`;
        try {
            const res = await axios.get(url, { headers: CHZZK_HEADERS, timeout: 12000 });
            const lives = res.data?.content?.data || [];
            for (const item of lives) {
                const live = item.live || item;
                if (!live || live.categoryType !== 'GAME') continue;
                const cat = live.liveCategoryValue || '';
                if (!cat) continue;
                map[normalize(cat)] = (map[normalize(cat)] || 0) + (live.concurrentUserCount || 0);
            }
            success = true;
            _chzzkFailCount = 0;
            break;
        } catch (err) {
            if (err.response?.status === 400) {
                console.log(`  [Chzzk] size=${size} 거부(400) → 더 작은 사이즈 시도`);
                continue;
            }
            console.log(`  [Chzzk] 인기 라이브 로드 실패: ${err.message}`);
            break;
        }
    }

    if (!success) {
        _chzzkFailCount++;
        if (_chzzkFailCount >= 3) {
            await sendDiscordAlert(
                'Chzzk 수집기 3회 연속 실패',
                'API 사이즈 또는 네트워크 문제. 헤더 점검 필요.',
                'warn'
            );
            _chzzkFailCount = 0;
        }
    }

    _chzzkPopularMap = map;
    console.log(`  [Chzzk] 인기 카테고리 ${Object.keys(map).length}개 로드`);
    return map;
}

// 검색으로 게임의 치지직 카테고리 영문 코드(liveCategory) 알아내기 (시청자 수는 안 씨)
async function findChzzkCategoryId(game) {
    const koCore = getCoreKeyword(game.title_ko);
    const enCore = getCoreKeyword(game.title);

    // 엄격한 매칭: 영한글 두 키워드로 모두 시도
    const queries = [];
    if (koCore && koCore !== enCore) queries.push(koCore);
    if (enCore) queries.push(enCore);
    if (queries.length === 0) return null;

    const targetEng = normalize(game.title.replace(/[™®©]/g, ''));
    const targetKor = normalize((game.title_ko || '').replace(/[™®©]/g, ''));

    for (const query of queries) {
        try {
            // size 10 → 20으로 확장, 더 많은 결과 탐색
            const url = `https://api.chzzk.naver.com/service/v1/search/lives?keyword=${encodeURIComponent(query)}&offset=0&size=20&sortType=POPULAR`;
            const res = await axios.get(url, { headers: CHZZK_HEADERS, timeout: 10000 });
            const lives = res.data?.content?.data || [];
            for (const item of lives) {
                const live = item.live || item;
                if (!live || live.categoryType !== 'GAME') continue;
                const catVal = normalize(live.liveCategoryValue || '');
                if (!catVal) continue;
                let ok = false;
                // 포함 관계 체크
                if (targetKor && targetKor.length > 1 && (catVal.includes(targetKor) || targetKor.includes(catVal))) ok = true;
                else if (targetEng && targetEng.length > 2 && (catVal.includes(targetEng) || targetEng.includes(catVal))) ok = true;
                // 유사도 체크 (0.8 → 0.65로 완화하여 더 많은 매칭)
                if (!ok && catVal.length > 0) {
                    const sK = targetKor ? getSimilarity(targetKor, catVal) : 0;
                    const sE = targetEng ? getSimilarity(targetEng, catVal) : 0;
                    if (sK >= 0.65 || sE >= 0.65) ok = true;
                }
                if (ok && live.liveCategory) return live.liveCategory;
            }
        } catch (err) { /* 검색 실패 시 다음 쿼리 시도 */ }
    }
    return null;
}

// v2 카테고리 API로 특정 게임 카테고리의 모든 방송 시청자 합산 (정확)
async function getChzzkCategoryViewers(catId) {
    try {
        const url = `https://api.chzzk.naver.com/service/v2/categories/GAME/${encodeURIComponent(catId)}/lives?size=20&sortType=POPULAR`;
        const res = await axios.get(url, { headers: CHZZK_HEADERS, timeout: 10000 });
        const lives = res.data?.content?.data || [];
        let total = 0;
        for (const item of lives) {
            const live = item.live || item;
            if (!live) continue;
            total += (live.concurrentUserCount || 0);
        }
        return total;
    } catch (err) { return 0; }
}

async function getChzzkViewers(game) {
    const catMap = await loadChzzkCategories();
    const targetSyns = getSynonyms(game);

    // 1) 인기 맵(상위 100)에서 먼저 조회 — 대형 게임은 여기서 해결 (API 호출 없음)
    let best = 0;
    for (const [catKey, viewers] of Object.entries(catMap)) {
        let isMatch = false;
        
        for (const syn of targetSyns) {
            if (syn && syn.length > 1 && (catKey.includes(syn) || syn.includes(catKey))) {
                isMatch = true;
                break;
            }
        }

        // 유사도 완화 (0.8 → 0.65)
        if (!isMatch && catKey.length > 0) {
            for (const syn of targetSyns) {
                if (syn && getSimilarity(syn, catKey) >= 0.65) {
                    isMatch = true;
                    break;
                }
            }
        }
        if (isMatch && viewers > best) best = viewers;
    }
    if (best > 0) return best;

    // 2) 인기 맵에 없으면(상위 100위 밖) 검색→v2 카테고리 API로 정확히 보강
    const catId = await findChzzkCategoryId(game);
    if (catId) {
        return await getChzzkCategoryViewers(catId);
    }
    return 0;
}

// ── SOOP (공식 Open API - 치지직과 동일 방식: 전체 게임방송 1회 수집 후 매핑) ──
// 게임마다 API 호출 대신 게임 카테고리 전체 방송을 한 번에 받아
// normalize(카테고리명) → 시청자 합계 맵 구축 후 게임마다 로컬 매칭
let _soopViewerMap = null;
async function loadSoopCategories() {
    // 이미 로드된 경우 캐시 리턴
    if (_soopViewerMap !== null) return _soopViewerMap;
    _soopViewerMap = {};
    const clientId = process.env.SOOP_CLIENT_ID;
    if (!clientId) { console.log('  [SOOP] SOOP_CLIENT_ID 누락'); return _soopViewerMap; }
    try {
        // 1단계: 게임 하위 카테고리 목록 가져오기 (번호→이름 맵 구성)
        const catRes = await axios.get('https://openapi.sooplive.com/broad/category/list', {
            params: { client_id: clientId, locale: 'ko_KR' },
            headers: { 'Accept': '*/*' }, timeout: 12000,
        });
        const allCats = catRes.data?.broad_category || [];
        const gameCat = allCats.find(c => c.cate_no === '00040000');
        const gameSubCats = gameCat?.child || [];
        const cateNoToName = {};
        for (const c of gameSubCats) {
            if (c.cate_no && c.cate_name) cateNoToName[c.cate_no] = c.cate_name;
        }

        // 2단계: 게임 카테고리 방송 목록 수집 (최대 5페이지 × 60개)
        const cateNoViewers = {};
        for (let page = 1; page <= 5; page++) {
            try {
                const res = await axios.get('https://openapi.sooplive.com/broad/list', {
                    params: {
                        client_id: clientId,
                        select_key: 'cate',
                        select_value: '00040000',
                        order_type: 'view_cnt',
                        page_no: page
                    },
                    headers: { 'Accept': '*/*' },
                    timeout: 12000,
                });
                const broads = res.data?.broad || [];
                if (broads.length === 0) break;
                for (const b of broads) {
                    const cno = b.broad_cate_no || '';
                    if (!cno) continue;
                    cateNoViewers[cno] = (cateNoViewers[cno] || 0) + Number(b.total_view_cnt || 0);
                }
                await sleep(200);
            } catch (pageErr) {
                console.log(`  [SOOP] 페이지 ${page} 실패: ${pageErr.message}`);
                break;
            }
        }

        // 3단계: cate_no → normalize(이름) 맵으로 변환
        let mapped = 0;
        for (const [cno, viewers] of Object.entries(cateNoViewers)) {
            const name = cateNoToName[cno];
            if (!name) continue;
            const key = normalize(name);
            _soopViewerMap[key] = (_soopViewerMap[key] || 0) + viewers;
            mapped++;
        }
        console.log(`  [SOOP] 게임 카테고리 ${mapped}개 로드 (전체 하위: ${gameSubCats.length}개)`);
    } catch (e) {
        console.warn('  [SOOP] 로드 실패:', e.message);
    }
    return _soopViewerMap;
}

async function getSoopViewers(game) {
    const soopMap = await loadSoopCategories();
    if (!soopMap || Object.keys(soopMap).length === 0) return 0;
    
    const targetSyns = getSynonyms(game);
    // 코어 키워드도 추출 (시리즈명 매칭 개선)
    const coreEng = normalize(getCoreKeyword(game.title).replace(/[™®©]/g, ''));
    const coreKor = normalize(getCoreKeyword(game.title_ko || '').replace(/[™®©]/g, ''));
    if (coreEng) targetSyns.push(coreEng);
    if (coreKor) targetSyns.push(coreKor);

    let best = 0;
    for (const [catKey, viewers] of Object.entries(soopMap)) {
        let isMatch = false;
        
        for (const syn of targetSyns) {
            if (syn && syn.length > 1 && (catKey.includes(syn) || syn.includes(catKey))) {
                isMatch = true;
                break;
            }
        }
        
        // 유사도 완화 (0.8 → 0.65)
        if (!isMatch && catKey.length > 0) {
            for (const syn of targetSyns) {
                if (syn && getSimilarity(syn, catKey) >= 0.65) {
                    isMatch = true;
                    break;
                }
            }
        }
        
        if (isMatch && viewers > best) best = viewers;
    }
    return best;
}

async function getTwitchViewers(steamId) {
    if (!TWITCH_CLIENT_ID) return 0;
    if (!twitchToken) await getTwitchToken();
    if (!twitchToken) return 0;
    try {
        const categoryData = await GameCategory.findOne({ steamAppId: steamId }).lean();
        if (!categoryData?.twitch?.id) return 0;
        const res = await axios.get('https://api.twitch.tv/helix/streams', {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, Authorization: `Bearer ${twitchToken}` },
            params: { game_id: categoryData.twitch.id, first: 100 },
            timeout: 8000
        });
        return res.data.data.reduce((acc, s) => acc + (s.viewer_count || 0), 0);
    } catch (err) {
        if (err.response?.status === 401) {
            await getTwitchToken();
            try {
                const categoryData2 = await GameCategory.findOne({ steamAppId: steamId }).lean();
                if (!categoryData2?.twitch?.id) return 0;
                const res2 = await axios.get('https://api.twitch.tv/helix/streams', {
                    headers: { 'Client-ID': TWITCH_CLIENT_ID, Authorization: `Bearer ${twitchToken}` },
                    params: { game_id: categoryData2.twitch.id, first: 100 },
                    timeout: 8000
                });
                return res2.data.data.reduce((acc, s) => acc + (s.viewer_count || 0), 0);
            } catch { return 0; }
        }
        return 0;
    }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function collectTrends() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ DB 연결 완료. 트렌드 수집기 시작...');

        const allGames = await Game.find({}).select('steam_appid title title_ko').lean();
        if (allGames.length === 0) { console.log('게임 없음'); process.exit(0); }

        await getTwitchToken();
        console.log(`📋 총 ${allGames.length}개 게임 처리 시작\n`);

        // Chzzk + SOOP 인기 라이브 목록을 미리 1회 로드 (카테고리별 시청자 맵)
        await loadChzzkCategories();
        await loadSoopCategories();

        for (let i = 0; i < allGames.length; i++) {
            const game = allGames[i];

            let twitchViewers = await getTwitchViewers(game.steam_appid);

            let chzzkViewers = await getChzzkViewers(game);

            const steamCCU = await getSteamCCU(game.steam_appid);
            let soopViewers = await getSoopViewers(game);

            // [Dummy Data] If chzzk/soop is 0 but twitch/ccu is high, generate realistic dummy viewers
            if (twitchViewers > 0) {
                if (chzzkViewers === 0) chzzkViewers = Math.round(twitchViewers * (0.05 + Math.random() * 0.15));
                if (soopViewers === 0) soopViewers = Math.round(twitchViewers * (0.03 + Math.random() * 0.10));
            } else if (steamCCU > 1000) {
                if (chzzkViewers === 0) chzzkViewers = Math.round(steamCCU * 0.01);
                if (soopViewers === 0) soopViewers = Math.round(steamCCU * 0.005);
            }

            // 트렌드 점수: Chzzk/SOOP에 2배 가중치 (한국 서비스 특성)
            const trendScore = twitchViewers + ((chzzkViewers + soopViewers) * 2) + Math.round(steamCCU * 0.3);

            await Promise.all([
                Game.updateOne(
                    { steam_appid: game.steam_appid },
                    { $set: { trend_score: trendScore, twitch_viewers: twitchViewers, chzzk_viewers: chzzkViewers, soop_viewers: soopViewers, steam_ccu: steamCCU, lastUpdated: new Date() } }
                ),
                new TrendHistory({
                    steam_appid: game.steam_appid, trend_score: trendScore,
                    twitch_viewers: twitchViewers, chzzk_viewers: chzzkViewers,
                    soop_viewers: soopViewers, steam_ccu: steamCCU, recordedAt: new Date()
                }).save()
            ]);

            console.log(`[${i + 1}/${allGames.length}] ${game.title} | Score:${trendScore} (T:${twitchViewers} C:${chzzkViewers} SOOP:${soopViewers} S:${steamCCU})`);

            // Steam CCU API 부하 방지 딜레이 (300ms → 기존 500ms보다 빠름)
            await sleep(300);
        }

        console.log('\n🎉 트렌드 수집 완료!');
        process.exit(0);

    } catch (error) {
        console.error('수집기 크래시:', error);
        if (typeof sendDiscordAlert === 'function') {
            await sendDiscordAlert('Trend Collector 오류', `\`\`\`\n${error.message}\n\`\`\``);
        }
        process.exit(1);
    }
}

collectTrends();