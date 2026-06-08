/**
 * collect_trends_topgames.js
 * 인기 게임 상위 N개만 트렌드 수집 (전체 3453개 대신 빠른 테스트용)
 * 치지직/SOOP 매칭 개선 후 검증용
 */
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

// ── 수집 대상 수 (CLI 옵션)
const limitArg = process.argv.find(a => a.startsWith('--limit'));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1] || process.argv[process.argv.indexOf(limitArg) + 1]) : 200;

// 수정된 trend_collector.js의 핵심 함수들 재사용
let twitchToken = null;
async function getTwitchToken() {
    if (!TWITCH_CLIENT_ID) return;
    try {
        const res = await axios.post('https://id.twitch.tv/oauth2/token', null, {
            params: { client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' }
        });
        twitchToken = res.data.access_token;
        console.log('✅ Twitch 토큰 발급 완료');
    } catch (err) { console.error('❌ Twitch 토큰 실패:', err.message); }
}

async function getSteamCCU(appId) {
    if (!appId) return 0;
    try {
        const res = await axios.get(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appId}`, { timeout: 8000 });
        if (res.data?.response?.result === 1) return res.data.response.player_count || 0;
    } catch {}
    return 0;
}

function normalize(str) { return (str || '').replace(/[^a-zA-Z0-9가-힣]/g, '').toLowerCase(); }
function getCoreKeyword(text) {
    if (!text) return '';
    let core = text.replace(/[™®©]/g, '');
    if (core.includes(':')) core = core.split(':')[0];
    core = core.replace(/\s+(I|II|III|IV|V|VI|VII|VIII|IX|X|\d+)$/i, '');
    core = core.replace(/(\d+)$/, '');
    return core.trim();
}
function getSimilarity(s1, s2) {
    const a = s1.toLowerCase(), b = s2.toLowerCase();
    if (a === b) return 1.0;
    const longer = a.length > b.length ? a : b, shorter = a.length > b.length ? b : a;
    const longerLen = longer.length;
    if (longerLen === 0) return 1.0;
    const costs = Array.from({ length: shorter.length + 1 }, (_, i) => i);
    for (let i = 1; i <= longer.length; i++) {
        let prev = i;
        for (let j = 1; j <= shorter.length; j++) {
            const cost = longer[i-1] !== shorter[j-1] ? 1 : 0;
            const curr = Math.min(costs[j] + 1, prev + 1, costs[j-1] + cost);
            costs[j-1] = prev; prev = curr;
        }
        costs[shorter.length] = prev;
    }
    return (longerLen - costs[shorter.length]) / longerLen;
}

const CHZZK_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Origin': 'https://chzzk.naver.com',
    'Referer': 'https://chzzk.naver.com/',
};

let _chzzkPopularMap = null;
async function loadChzzkCategories() {
    if (_chzzkPopularMap) return _chzzkPopularMap;
    const map = {};
    try {
        const res = await axios.get(`https://api.chzzk.naver.com/service/v1/lives?size=100&sortType=POPULAR`, { headers: CHZZK_HEADERS, timeout: 12000 });
        const lives = res.data?.content?.data || [];
        for (const item of lives) {
            const live = item.live || item;
            if (!live || live.categoryType !== 'GAME') continue;
            const cat = live.liveCategoryValue || '';
            if (!cat) continue;
            map[normalize(cat)] = (map[normalize(cat)] || 0) + (live.concurrentUserCount || 0);
        }
    } catch (err) { console.log(`  [Chzzk] 인기 라이브 로드 실패: ${err.message}`); }
    _chzzkPopularMap = map;
    console.log(`  [Chzzk] 인기 카테고리 ${Object.keys(map).length}개 로드`);
    return map;
}

async function findChzzkCategoryId(game) {
    const koCore = getCoreKeyword(game.title_ko);
    const enCore = getCoreKeyword(game.title);
    const queries = [];
    if (koCore && koCore !== enCore) queries.push(koCore);
    if (enCore) queries.push(enCore);
    if (queries.length === 0) return null;

    const targetEng = normalize(game.title.replace(/[™®©]/g, ''));
    const targetKor = normalize((game.title_ko || '').replace(/[™®©]/g, ''));

    for (const query of queries) {
        try {
            const url = `https://api.chzzk.naver.com/service/v1/search/lives?keyword=${encodeURIComponent(query)}&offset=0&size=20&sortType=POPULAR`;
            const res = await axios.get(url, { headers: CHZZK_HEADERS, timeout: 10000 });
            const lives = res.data?.content?.data || [];
            for (const item of lives) {
                const live = item.live || item;
                if (!live || live.categoryType !== 'GAME') continue;
                const catVal = normalize(live.liveCategoryValue || '');
                if (!catVal) continue;
                let ok = false;
                if (targetKor && targetKor.length > 1 && (catVal.includes(targetKor) || targetKor.includes(catVal))) ok = true;
                else if (targetEng && targetEng.length > 2 && (catVal.includes(targetEng) || targetEng.includes(catVal))) ok = true;
                if (!ok && catVal.length > 0) {
                    const sK = targetKor ? getSimilarity(targetKor, catVal) : 0;
                    const sE = targetEng ? getSimilarity(targetEng, catVal) : 0;
                    if (sK >= 0.65 || sE >= 0.65) ok = true;
                }
                if (ok && live.liveCategory) return live.liveCategory;
            }
        } catch {}
    }
    return null;
}

async function getChzzkCategoryViewers(catId) {
    try {
        const url = `https://api.chzzk.naver.com/service/v2/categories/GAME/${encodeURIComponent(catId)}/lives?size=20&sortType=POPULAR`;
        const res = await axios.get(url, { headers: CHZZK_HEADERS, timeout: 10000 });
        const lives = res.data?.content?.data || [];
        let total = 0;
        for (const item of lives) { const live = item.live || item; total += (live?.concurrentUserCount || 0); }
        return total;
    } catch { return 0; }
}

async function getChzzkViewers(game) {
    const catMap = await loadChzzkCategories();
    const targetEng = normalize(game.title.replace(/[™®©]/g, ''));
    const targetKor = normalize((game.title_ko || '').replace(/[™®©]/g, ''));
    let best = 0;
    for (const [catKey, viewers] of Object.entries(catMap)) {
        let isMatch = false;
        if (targetKor && targetKor.length > 1 && (catKey.includes(targetKor) || targetKor.includes(catKey))) isMatch = true;
        else if (targetEng && targetEng.length > 2 && (catKey.includes(targetEng) || targetEng.includes(catKey))) isMatch = true;
        if (!isMatch && catKey.length > 0) {
            const sK = targetKor ? getSimilarity(targetKor, catKey) : 0;
            const sE = targetEng ? getSimilarity(targetEng, catKey) : 0;
            if (sK >= 0.65 || sE >= 0.65) isMatch = true;
        }
        if (isMatch && viewers > best) best = viewers;
    }
    if (best > 0) return best;
    const catId = await findChzzkCategoryId(game);
    if (catId) return await getChzzkCategoryViewers(catId);
    return 0;
}

let _soopViewerMap = null;
async function loadSoopCategories() {
    if (_soopViewerMap !== null) return _soopViewerMap;
    _soopViewerMap = {};
    const clientId = process.env.SOOP_CLIENT_ID;
    if (!clientId) { console.log('  [SOOP] SOOP_CLIENT_ID 누락'); return _soopViewerMap; }
    try {
        const cateNoViewers = {};
        for (let page = 1; page <= 10; page++) {
            try {
                const res = await axios.get('https://openapi.sooplive.com/broad/list', {
                    params: { client_id: clientId, select_key: 'cate', select_value: '00040000', order_type: 'view_cnt', page_no: page },
                    headers: { 'Accept': '*/*' }, timeout: 12000,
                });
                const broads = res.data?.broad || [];
                if (broads.length === 0) break;
                for (const b of broads) {
                    const cno = b.broad_cate_no || '';
                    if (!cno) continue;
                    cateNoViewers[cno] = (cateNoViewers[cno] || 0) + Number(b.total_view_cnt || 0);
                }
                await sleep(150);
            } catch (e) { console.log(`  [SOOP] 페이지 ${page} 실패: ${e.message}`); break; }
        }
        const catRes = await axios.get('https://openapi.sooplive.com/broad/category/list', {
            params: { client_id: clientId, locale: 'ko_KR' }, headers: { 'Accept': '*/*' }, timeout: 12000,
        });
        const cats = catRes.data?.broad_category || [];
        const cateNoToName = {};
        for (const parent of cats) {
            for (const child of (parent.child || [])) { if (child.cate_no) cateNoToName[child.cate_no] = child.cate_name; }
            if (parent.cate_no) cateNoToName[parent.cate_no] = parent.cate_name;
        }
        for (const [cno, viewers] of Object.entries(cateNoViewers)) {
            const name = cateNoToName[cno];
            if (!name) continue;
            _soopViewerMap[normalize(name)] = (_soopViewerMap[normalize(name)] || 0) + viewers;
        }
        console.log(`  [SOOP] 게임 카테고리 ${Object.keys(_soopViewerMap).length}개 로드`);
    } catch (e) { console.warn('  [SOOP] 로드 실패:', e.message); }
    return _soopViewerMap;
}

async function getSoopViewers(game) {
    const soopMap = await loadSoopCategories();
    if (!soopMap || Object.keys(soopMap).length === 0) return 0;
    const targetKor = normalize((game.title_ko || '').replace(/[™®©]/g, ''));
    const targetEng = normalize((game.title || '').replace(/[™®©]/g, ''));
    const coreEng = normalize(getCoreKeyword(game.title).replace(/[™®©]/g, ''));
    const coreKor = normalize(getCoreKeyword(game.title_ko || '').replace(/[™®©]/g, ''));
    let best = 0;
    for (const [catKey, viewers] of Object.entries(soopMap)) {
        let isMatch = false;
        if (targetKor && targetKor.length > 1 && (catKey.includes(targetKor) || targetKor.includes(catKey))) isMatch = true;
        else if (targetEng && targetEng.length > 2 && (catKey.includes(targetEng) || targetEng.includes(catKey))) isMatch = true;
        else if (coreKor && coreKor.length > 1 && (catKey.includes(coreKor) || coreKor.includes(catKey))) isMatch = true;
        else if (coreEng && coreEng.length > 2 && (catKey.includes(coreEng) || coreEng.includes(catKey))) isMatch = true;
        if (!isMatch && catKey.length > 0) {
            const sK = targetKor ? getSimilarity(targetKor, catKey) : 0;
            const sE = targetEng ? getSimilarity(targetEng, catKey) : 0;
            const sKc = coreKor ? getSimilarity(coreKor, catKey) : 0;
            const sEc = coreEng ? getSimilarity(coreEng, catKey) : 0;
            if (sK >= 0.65 || sE >= 0.65 || sKc >= 0.65 || sEc >= 0.65) isMatch = true;
        }
        if (isMatch && viewers > best) best = viewers;
    }
    return best;
}

async function getTwitchViewers(steamId) {
    if (!TWITCH_CLIENT_ID || !twitchToken) return 0;
    try {
        const categoryData = await GameCategory.findOne({ steamAppId: steamId }).lean();
        if (!categoryData?.twitch?.id) return 0;
        const res = await axios.get('https://api.twitch.tv/helix/streams', {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, Authorization: `Bearer ${twitchToken}` },
            params: { game_id: categoryData.twitch.id, first: 100 }, timeout: 8000
        });
        return res.data.data.reduce((acc, s) => acc + (s.viewer_count || 0), 0);
    } catch { return 0; }
}

async function collectTrends() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ DB 연결 완료. 인기 게임 트렌드 수집 시작...');

        // trend_score + steam_ccu 기준 상위 LIMIT개 게임
        const allGames = await Game.find({})
            .select('steam_appid title title_ko')
            .sort({ trend_score: -1, steam_ccu: -1 })
            .limit(LIMIT)
            .lean();

        if (allGames.length === 0) { console.log('게임 없음'); process.exit(0); }

        await getTwitchToken();
        await loadChzzkCategories();
        await loadSoopCategories();

        console.log(`\n📋 상위 ${allGames.length}개 게임 트렌드 수집 시작\n`);
        let chzzkHit = 0, soopHit = 0;

        for (let i = 0; i < allGames.length; i++) {
            const game = allGames[i];
            const twitchViewers = await getTwitchViewers(game.steam_appid);
            const chzzkViewers = await getChzzkViewers(game);
            const steamCCU = await getSteamCCU(game.steam_appid);
            const soopViewers = await getSoopViewers(game);

            if (chzzkViewers > 0) chzzkHit++;
            if (soopViewers > 0) soopHit++;

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

            const marker = chzzkViewers > 0 ? '🟢치지직' : soopViewers > 0 ? '🟠SOOP' : '';
            console.log(`[${i + 1}/${allGames.length}] ${game.title} | T:${twitchViewers} C:${chzzkViewers} SOOP:${soopViewers} S:${steamCCU} ${marker}`);

            await sleep(250);
        }

        console.log(`\n🎉 수집 완료! 치지직 매칭: ${chzzkHit}개, SOOP 매칭: ${soopHit}개`);
        process.exit(0);

    } catch (error) {
        console.error('수집기 크래시:', error);
        process.exit(1);
    }
}

collectTrends();
