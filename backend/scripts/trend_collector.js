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
    'Accept-Encoding': 'gzip, deflate, br',
    'Origin': 'https://chzzk.naver.com',
    'Referer': 'https://chzzk.naver.com/',
    'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
};

function normalize(str) {
    return (str || '').replace(/[^a-zA-Z0-9가-힣]/g, '').toLowerCase();
}

function getCoreKeyword(text) {
    if (!text) return '';
    let core = text.replace(/[™®©]/g, '');
    if (core.includes(':')) core = core.split(':')[0];
    core = core.replace(/\s+(I|II|III|IV|V|VI|VII|VIII|IX|X|\d+)$/i, '');
    core = core.replace(/(\d+)$/, '');
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
async function loadChzzkCategories() {
    if (_chzzkPopularMap) return _chzzkPopularMap;
    const map = {};           // normalize(카테고리명) → 시청자 합계
    const url = `https://api.chzzk.naver.com/service/v1/lives?size=50&sortType=POPULAR`;
    try {
        const res = await axios.get(url, { headers: CHZZK_HEADERS, timeout: 10000 });
        const lives = res.data?.content?.data || [];
        for (const item of lives) {
            const live = item.live || item;
            if (!live || live.categoryType !== 'GAME') continue;
            const cat = live.liveCategoryValue || '';
            if (!cat) continue;
            map[normalize(cat)] = (map[normalize(cat)] || 0) + (live.concurrentUserCount || 0);
        }
    } catch (err) {
        console.log(`  [Chzzk] 인기 라이브 로드 실패: ${err.message}`);
    }
    _chzzkPopularMap = map;
    console.log(`  [Chzzk] 인기 카테고리 ${Object.keys(map).length}개 로드`);
    return map;
}

// 검색으로 게임의 치지직 카테고리 영문 코드(liveCategory) 알아내기 (시청자 수는 안 씀)
async function findChzzkCategoryId(game) {
    const koCore = getCoreKeyword(game.title_ko);
    const enCore = getCoreKeyword(game.title);
    const query = koCore || enCore;
    if (!query) return null;

    const targetEng = normalize(game.title.replace(/[™®©]/g, ''));
    const targetKor = normalize((game.title_ko || '').replace(/[™®©]/g, ''));

    try {
        const url = `https://api.chzzk.naver.com/service/v1/search/lives?keyword=${encodeURIComponent(query)}&offset=0&size=10&sortType=POPULAR`;
        const res = await axios.get(url, { headers: CHZZK_HEADERS, timeout: 10000 });
        const lives = res.data?.content?.data || [];
        for (const item of lives) {
            const live = item.live || item;
            if (!live || live.categoryType !== 'GAME') continue;
            const catVal = normalize(live.liveCategoryValue || '');
            // 검색 결과 카테고리가 우리 게임과 일치하는지 확인 후 코드 반환
            let ok = false;
            if (targetKor && targetKor.length > 1 && (catVal.includes(targetKor) || targetKor.includes(catVal))) ok = true;
            else if (targetEng && targetEng.length > 2 && (catVal.includes(targetEng) || targetEng.includes(catVal))) ok = true;
            if (!ok && catVal.length > 0) {
                const sK = targetKor ? getSimilarity(targetKor, catVal) : 0;
                const sE = targetEng ? getSimilarity(targetEng, catVal) : 0;
                if (sK >= 0.8 || sE >= 0.8) ok = true;
            }
            if (ok && live.liveCategory) return live.liveCategory;
        }
    } catch (err) { /* 검색 실패 시 null */ }
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
    const targetEng = normalize(game.title.replace(/[™®©]/g, ''));
    const targetKor = normalize((game.title_ko || '').replace(/[™®©]/g, ''));

    // 1) 인기 맵(상위 50)에서 먼저 조회 — 대형 게임은 여기서 해결 (API 호출 없음)
    let best = 0;
    for (const [catKey, viewers] of Object.entries(catMap)) {
        let isMatch = false;
        if (targetKor && targetKor.length > 1 && (catKey.includes(targetKor) || targetKor.includes(catKey))) isMatch = true;
        else if (targetEng && targetEng.length > 2 && (catKey.includes(targetEng) || targetEng.includes(catKey))) isMatch = true;
        if (!isMatch && catKey.length > 0) {
            const sK = targetKor ? getSimilarity(targetKor, catKey) : 0;
            const sE = targetEng ? getSimilarity(targetEng, catKey) : 0;
            if (sK >= 0.8 || sE >= 0.8) isMatch = true;
        }
        if (isMatch && viewers > best) best = viewers;
    }
    if (best > 0) return best;

    // 2) 인기 맵에 없으면(상위 50위 밖) 검색→v2 카테고리 API로 정확히 보강
    const catId = await findChzzkCategoryId(game);
    if (catId) {
        return await getChzzkCategoryViewers(catId);
    }
    return 0;
}

// ── SOOP ─────────────────────────────────────────────────────────────────────
// ── SOOP (공식 Open API - 게임 카테고리 기반) ──────────────────────────────
// 게임 카테고리 목록을 1회 로드 후 캐싱 (카테고리명 → cate_no 매핑)
let _soopCategoryMap = null;
async function loadSoopCategories() {
    if (_soopCategoryMap !== null) return _soopCategoryMap;
    _soopCategoryMap = new Map();

    const clientId = process.env.SOOP_CLIENT_ID;
    if (!clientId) return _soopCategoryMap;

    try {
        const res = await axios.get('https://openapi.sooplive.com/broad/category/list', {
            params: { client_id: clientId, locale: 'ko_KR' },
            headers: { 'Accept': '*/*' },
            timeout: 10000,
        });
        const categories = res.data?.broad_category || [];
        for (const parent of categories) {
            // 게임 카테고리(00040000) 하위만 수집
            const children = parent.child || [];
            for (const child of children) {
                if (child.cate_name && child.cate_no) {
                    _soopCategoryMap.set(normalize(child.cate_name), child.cate_no);
                }
            }
            // 부모 자체도 등록 (게임명이 부모 카테고리인 경우)
            if (parent.cate_name && parent.cate_no) {
                _soopCategoryMap.set(normalize(parent.cate_name), parent.cate_no);
            }
        }
        console.log(`  [SOOP] 카테고리 ${_soopCategoryMap.size}개 로드`);
    } catch (e) {
        console.warn('  [SOOP] 카테고리 로드 실패:', e.message);
    }
    return _soopCategoryMap;
}

async function getSoopViewers(game) {
    const clientId = process.env.SOOP_CLIENT_ID;

    // ── 공식 API (카테고리 기반) ──
    if (clientId) {
        try {
            const catMap = await loadSoopCategories();
            // 게임명(한글 우선)으로 카테고리 번호 찾기
            const nameKo = normalize((game.title_ko || '').replace(/[™®©]/g, ''));
            const nameEn = normalize((game.title || '').replace(/[™®©]/g, ''));

            let cateNo = catMap.get(nameKo) || catMap.get(nameEn);
            // 부분 매칭 (정확히 안 맞으면 포함 관계 탐색)
            if (!cateNo) {
                for (const [catName, no] of catMap) {
                    if (catName.length >= 3 && (catName === nameKo || catName === nameEn ||
                        (nameKo && nameKo.includes(catName)) || (nameEn && nameEn.includes(catName)))) {
                        cateNo = no;
                        break;
                    }
                }
            }
            if (!cateNo) return 0;  // SOOP에 해당 게임 카테고리 없음

            // 해당 카테고리의 라이브 방송 시청자 합산
            const res = await axios.get('https://openapi.sooplive.com/broad/list', {
                params: { client_id: clientId, select_key: 'cate', select_value: cateNo,
                          order_type: 'view_cnt', page_no: 1 },
                headers: { 'Accept': '*/*' },
                timeout: 10000,
            });
            const broads = res.data?.broad || [];
            return broads.reduce((sum, b) => sum + Number(b.total_view_cnt || 0), 0);
        } catch (e) {
            // 공식 API 실패 시 아래 비공식 폴백
        }
    }

    // ── 비공식 API 폴백 (공식 키 없거나 실패 시) ──
    try {
        const searchQuery = getCoreKeyword(game.title_ko) || getCoreKeyword(game.title);
        if (!searchQuery) return 0;

        const targetEng = normalize(game.title.replace(/[™®©]/g, ''));
        const targetKor = normalize((game.title_ko || '').replace(/[™®©]/g, ''));

        const res = await axios.get('https://sch.afreecatv.com/api.php', {
            params: { szWork: 'schLive', szKeyword: searchQuery, nPageNo: 1, nListCnt: 50 },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.sooplive.co.kr/',
            },
            timeout: 10000,
        });

        const broads = res.data?.REAL_BROAD || [];
        let viewers = 0;
        for (const item of broads) {
            const catName = normalize(item.broad_cate_name || '');
            const titleNorm = normalize(item.broad_title || '');
            let isMatch = false;
            if (targetKor && (catName.includes(targetKor) || titleNorm.includes(targetKor))) isMatch = true;
            if (targetEng && (catName.includes(targetEng) || titleNorm.includes(targetEng))) isMatch = true;
            if (isMatch) viewers += Number(item.total_view_cnt || item.view_cnt || 0);
        }
        return viewers;
    } catch {
        return 0;
    }
}
// ── Twitch viewers ───────────────────────────────────────────────────────────
async function getTwitchViewers(steamId) {
    if (!twitchToken || !TWITCH_CLIENT_ID) return 0;
    try {
        const categoryData = await GameCategory.findOne({ steamAppId: steamId }).lean();
        if (!categoryData?.twitch?.id) return 0;

        const res = await axios.get('https://api.twitch.tv/helix/streams', {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, Authorization: `Bearer ${twitchToken}` },
            params: { game_id: categoryData.twitch.id, first: 100 },
            timeout: 8000
        });
        return res.data.data.reduce((acc, s) => acc + (s.viewer_count || 0), 0);
    } catch {
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

        // Chzzk 인기 라이브 목록을 미리 1회 로드 (카테고리별 시청자 맵)
        await loadChzzkCategories();

        for (let i = 0; i < allGames.length; i++) {
            const game = allGames[i];

            const twitchViewers = await getTwitchViewers(game.steam_appid);

            const chzzkViewers = await getChzzkViewers(game);

            const steamCCU = await getSteamCCU(game.steam_appid);
            const soopViewers = await getSoopViewers(game);

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