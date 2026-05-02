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
async function getChzzkViewers(game) {
    const koCore = getCoreKeyword(game.title_ko);
    const enCore = getCoreKeyword(game.title);
    const searchQuery = koCore || enCore;
    if (!searchQuery) return 0;

    const targetEng = normalize(game.title.replace(/[™®©]/g, ''));
    const targetKor = normalize((game.title_ko || '').replace(/[™®©]/g, ''));

    const ENDPOINTS = [
        `https://api.chzzk.naver.com/service/v1/search/lives?keyword=${encodeURIComponent(searchQuery)}&offset=0&size=50&sortType=POPULAR`,
        `https://api.chzzk.naver.com/service/v2/search/lives?keyword=${encodeURIComponent(searchQuery)}&offset=0&size=50&sortType=POPULAR`,
    ];

    for (let attempt = 0; attempt < ENDPOINTS.length; attempt++) {
        try {
            const res = await axios.get(ENDPOINTS[attempt], {
                headers: CHZZK_HEADERS,
                timeout: 10000
            });

            const lives = res.data?.content?.data || res.data?.data || [];
            let viewers = 0;

            for (const item of lives) {
                const live = item.live || item;
                if (!live) continue;

                const catValue = live.liveCategoryValue || live.categoryValue || '';
                const normCat = normalize(catValue);

                let isMatch = false;
                // 1순위: 직접 포함 일치
                if (targetKor && targetKor.length > 1 && normCat.includes(targetKor)) isMatch = true;
                else if (targetEng && targetEng.length > 2 && normCat.includes(targetEng)) isMatch = true;

                // 2순위: 유사도 매칭 (임계값 0.75 — 0.70보다 엄격하게)
                if (!isMatch && normCat.length > 0) {
                    const simKor = targetKor ? getSimilarity(targetKor, normCat) : 0;
                    const simEng = targetEng ? getSimilarity(targetEng, normCat) : 0;
                    if (simKor >= 0.75 || simEng >= 0.75) isMatch = true;
                }

                if (isMatch) {
                    viewers += live.concurrentUserCount || live.viewerCount || 0;
                }
            }

            return viewers;

        } catch (err) {
            const status = err.response?.status;
            if (status === 403 || status === 429) {
                console.log(`  [Chzzk ${status}] ${game.title} — ${attempt < ENDPOINTS.length - 1 ? '엔드포인트 전환 후 재시도' : '포기'}`);
                if (attempt < ENDPOINTS.length - 1) await sleep(3000);
            }
            // 다른 에러는 그냥 다음 엔드포인트로
        }
    }
    return 0;
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

        // Chzzk 연속 403 감지용 카운터
        let chzzkFailStreak = 0;
        const CHZZK_FAIL_LIMIT = 5; // 5연속 실패 시 Chzzk 수집 비활성화

        for (let i = 0; i < allGames.length; i++) {
            const game = allGames[i];

            const twitchViewers = await getTwitchViewers(game.steam_appid);

            let chzzkViewers = 0;
            if (chzzkFailStreak < CHZZK_FAIL_LIMIT) {
                chzzkViewers = await getChzzkViewers(game);
                if (chzzkViewers === 0) chzzkFailStreak++;
                else chzzkFailStreak = 0;
            }

            const steamCCU = await getSteamCCU(game.steam_appid);

            // 트렌드 점수: Chzzk에 2배 가중치 (한국 서비스 특성)
            const trendScore = twitchViewers + (chzzkViewers * 2) + Math.round(steamCCU * 0.1);

            await Promise.all([
                Game.updateOne(
                    { steam_appid: game.steam_appid },
                    { $set: { trend_score: trendScore, twitch_viewers: twitchViewers, chzzk_viewers: chzzkViewers, steam_ccu: steamCCU, lastUpdated: new Date() } }
                ),
                new TrendHistory({
                    steam_appid: game.steam_appid, trend_score: trendScore,
                    twitch_viewers: twitchViewers, chzzk_viewers: chzzkViewers,
                    steam_ccu: steamCCU, recordedAt: new Date()
                }).save()
            ]);

            console.log(`[${i + 1}/${allGames.length}] ${game.title} | Score:${trendScore} (T:${twitchViewers} C:${chzzkViewers} S:${steamCCU})`);

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