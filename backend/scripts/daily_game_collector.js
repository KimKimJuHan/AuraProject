/**
 * daily_game_collector.js
 *
 * 매일 KST 03:00 실행 — 신규 게임 수집 + 전체 가격 갱신 + 메타데이터 보완
 *
 * 실행 순서:
 * 1. ITAD/SteamSpy에서 인기 게임 목록 수집
 * 2. DB에 없는 신규 게임만 Steam API + Puppeteer로 전체 데이터 수집
 * 3. 기존 게임 중 가격이 오래된 것 갱신 (ITAD)
 * 4. smart_tags/difficulty 누락 게임 보완
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const axios = require('axios');
const puppeteer = require('puppeteer-core');
const { sendDiscordAlert } = require('../utils/systemHelper');
const Game = require('../models/Game');
const GameMetadata = require('../models/GameMetadata');
const { mapSteamTags } = require('../utils/tagMapper');

const { MONGODB_URI, ITAD_API_KEY, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET } = process.env;
if (!MONGODB_URI) { console.error('❌ MONGODB_URI 없음'); process.exit(1); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MAX_NEW_GAMES = 30; // 하루 최대 신규 수집 수
const PRICE_UPDATE_DAYS = 3; // N일 이상 가격 미갱신 게임 업데이트

// ── IGDB 토큰 ─────────────────────────────────────────────────────────────────
let igdbToken = null;
async function getIGDBToken() {
    if (!TWITCH_CLIENT_ID) return;
    try {
        const res = await axios.post('https://id.twitch.tv/oauth2/token', null, {
            params: { client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' }
        });
        igdbToken = res.data.access_token;
    } catch (e) { console.warn('⚠️ IGDB 토큰 발급 실패:', e.message); }
}

async function getIGDBScore(title) {
    if (!igdbToken) return 0;
    try {
        const res = await axios.post('https://api.igdb.com/v4/games',
            `fields rating; search "${title.replace(/"/g, '').replace(/[™®©]/g, '')}"; where rating_count > 5; limit 1;`,
            { headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${igdbToken}`, 'Content-Type': 'text/plain' }, timeout: 8000 }
        );
        return res.data?.[0]?.rating ? Math.round(res.data[0].rating) : 0;
    } catch { return 0; }
}

// ── Steam 데이터 수집 ─────────────────────────────────────────────────────────
async function getSteamDetails(appId) {
    try {
        const res = await axios.get('https://store.steampowered.com/api/appdetails', {
            params: { appids: appId, cc: 'kr', l: 'korean' }, timeout: 10000
        });
        const data = res.data?.[appId]?.data;
        if (!data || data.type !== 'game') return null;
        // trailers(movies) 필드 가공 - 신규/구버전 API 모두 대응
        data._trailers = (data.movies || [])
            .map(m => m.hls_h264 || m.dash_h264 || m.mp4?.max || m.mp4?.['480'] || m.webm?.max || '')
            .filter(Boolean)
            .filter(Boolean)
            .slice(0, 3);
        return data;
    } catch { return null; }
}

async function getSteamReviews(appId) {
    try {
        const res = await axios.get(`https://store.steampowered.com/appreviews/${appId}?json=1&language=all`, { timeout: 8000 });
        const qs = res.data?.query_summary;
        if (!qs) return null;
        const total = qs.total_reviews || 0;
        const positive = qs.total_positive || 0;
        return { summary: qs.review_score_desc || '', total, positive, percent: total > 0 ? Math.round((positive / total) * 100) : 0 };
    } catch { return null; }
}

async function getSteamCCU(appId) {
    try {
        const res = await axios.get(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appId}`, { timeout: 8000 });
        return res.data?.response?.player_count || 0;
    } catch { return 0; }
}

// ── ITAD 가격 수집 ────────────────────────────────────────────────────────────
async function getITADPrice(itadUuid) {
    if (!ITAD_API_KEY || !itadUuid) return null;
    try {
        const res = await axios.post(
            `https://api.isthereanydeal.com/games/prices/v3?key=${ITAD_API_KEY}&country=KR&capacity=5`,
            [itadUuid],
            { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
        );
        const deals = res.data?.[0]?.deals || [];
        if (deals.length === 0) return null;
        const sorted = [...deals].sort((a, b) => a.price.amount - b.price.amount);
        const best = sorted[0];

        // cents 단위 자동 감지 및 KRW 변환
        // ITAD API가 country=KR로 호출해도 일부 스토어는 USD cents 단위로 응답
        const convertToKRW = (amount) => {
            if (amount >= 2000) return Math.round(amount); // 이미 KRW
            if (amount >= 100) return Math.round((amount / 100) * 1350); // cents → KRW
            return Math.round(amount * 1350); // USD → KRW
        };

        return {
            current_price: convertToKRW(best.price.amount),
            regular_price: convertToKRW(best.regular.amount),
            discount_percent: best.cut || 0,
            store_url: best.url,
            store_name: best.shop?.name || 'Unknown',
            deals: sorted.slice(0, 10).map(d => ({
                shopName: d.shop?.name || '',
                price: convertToKRW(d.price.amount),
                regularPrice: convertToKRW(d.regular.amount),
                discount: d.cut || 0,
                url: d.url
            }))
        };
    } catch { return null; }
}

// ── Puppeteer로 .app_tag 스크래핑 ─────────────────────────────────────────────
let browser = null;
let page = null;

async function initBrowser() {
    const candidates = [
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
    ];
    const { existsSync } = require('fs');
    const chromePath = candidates.find(p => existsSync(p));
    if (!chromePath) {
        console.warn('⚠️ Chrome 없음 — Puppeteer 스크래핑 비활성화, Steam API만 사용');
        return;
    }
    console.log(`🌐 Chrome: ${chromePath}`);
    browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: 'new',
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', req => {
        ['image', 'stylesheet', 'font', 'media'].includes(req.resourceType()) ? req.abort() : req.continue();
    });
    await page.setCookie(
        { name: 'birthtime', value: '0', domain: 'store.steampowered.com' },
        { name: 'wants_mature_content', value: '1', domain: 'store.steampowered.com' },
        { name: 'Steam_Language', value: 'korean', domain: 'store.steampowered.com' }
    );
}

async function scrapeAppTags(appId) {
    if (!browser || !page) return []; // Puppeteer 없으면 스킵
    try {
        await page.goto(`https://store.steampowered.com/app/${appId}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        const ageGate = await page.$('#ageYear');
        if (ageGate) {
            await page.select('#ageYear', '2000');
            await page.click('.btnv6_blue_hoverfade_btn').catch(() => {});
            await sleep(1500);
        }
        return await page.evaluate(() =>
            Array.from(document.querySelectorAll('.app_tag'))
                .map(el => el.innerText.trim())
                .filter(t => t && t !== '+')
        );
    } catch { return []; }
}

// ── difficulty 계산 ───────────────────────────────────────────────────────────
function calcDifficulty(smartTags) {
    const tags = Array.isArray(smartTags) ? smartTags : [];
    if (['소울라이크', '고난이도', '로그라이크'].some(t => tags.includes(t))) return '심화';
    if (['귀여운', '힐링', '캐주얼', '리듬', '퍼즐', '비주얼노벨', '농장경영'].some(t => tags.includes(t))) return '초심자';
    return '보통';
}

// ── 신규 게임 수집 대상 목록 (SteamSpy + ITAD) ───────────────────────────────
async function getNewGameCandidates() {
    const candidates = new Map();

    // 1. SteamSpy 인기 게임
    try {
        const res = await axios.get('https://steamspy.com/api.php?request=top100in2weeks', { timeout: 10000 });
        Object.values(res.data || {}).forEach(g => {
            if (g.appid) candidates.set(g.appid, { appid: g.appid, name: g.name });
        });
        console.log(`  SteamSpy: ${candidates.size}개`);
    } catch (e) { console.warn('  SteamSpy 실패:', e.message); }

    // 2. ITAD 최근 인기작
    if (ITAD_API_KEY) {
        try {
            const res = await axios.get('https://api.isthereanydeal.com/stats/popularity/v1', {
                params: { key: ITAD_API_KEY, limit: 100, country: 'KR' }, timeout: 10000
            });
            (res.data || []).forEach(g => {
                if (g.appid) candidates.set(g.appid, { appid: g.appid, name: g.title });
            });
        } catch {}
    }

    // 3. Steam 신규 출시작 + 베스트셀러 (최신 인기 게임 보강)
    try {
        const res = await axios.get('https://store.steampowered.com/api/featuredcategories', {
            params: { cc: 'kr', l: 'korean' }, timeout: 10000
        });
        const newReleases = res.data?.new_releases?.items || [];
        const topSellers = res.data?.top_sellers?.items || [];
        [...newReleases, ...topSellers].forEach(g => {
            if (g.id) candidates.set(g.id, { appid: g.id, name: g.name });
        });
        console.log(`  Steam 신작/베스트셀러: +${newReleases.length + topSellers.length}개`);
    } catch (e) { console.warn('  Steam featured 실패:', e.message); }

    return Array.from(candidates.values());
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
    const startTime = Date.now();
    let newCollected = 0;
    let priceUpdated = 0;
    let metaFilled = 0;
    let errors = 0;

    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ DB 연결 완료');
        await getIGDBToken();
        try {
            await initBrowser();
        } catch (e) {
            console.warn('⚠️ Puppeteer 초기화 실패 — Steam API 폴백 모드:', e.message);
        }

        // ── 1단계: 신규 게임 수집 ────────────────────────────────────────────
        console.log('\n📥 1단계: 신규 게임 수집 시작');
        const existingIds = new Set((await Game.find({}).select('steam_appid').lean()).map(g => g.steam_appid));
        const candidates = await getNewGameCandidates();
        const newCandidates = candidates.filter(c => !existingIds.has(c.appid)).slice(0, MAX_NEW_GAMES);
        console.log(`  신규 수집 대상: ${newCandidates.length}개`);

        for (const candidate of newCandidates) {
            try {
                const data = await getSteamDetails(candidate.appid);
                if (!data) { await sleep(500); continue; }

                // 성인 게임 필터
                const isAdult = data.content_descriptors?.ids?.some(id => [3, 4].includes(id)) || false;

                // 태그 스크래핑
                const rawTags = await scrapeAppTags(candidate.appid);
                await sleep(1000);
                const smartTags = mapSteamTags(rawTags);

                // 리뷰
                const reviews = await getSteamReviews(candidate.appid);
                await sleep(300);

                // CCU
                const ccu = await getSteamCCU(candidate.appid);
                await sleep(300);

                // IGDB
                const igdbScore = await getIGDBScore(data.name);
                await sleep(250);

                // ITAD UUID (GameMetadata에서)
                const meta = await GameMetadata.findOne({ steamAppId: candidate.appid }).lean();
                let priceInfo = { current_price: 0, regular_price: 0, discount_percent: 0, isFree: data.is_free || false, deals: [] };
                if (meta?.itad?.uuid) {
                    const itadPrice = await getITADPrice(meta.itad.uuid);
                    if (itadPrice) priceInfo = { ...priceInfo, ...itadPrice };
                    await sleep(500);
                } else {
                    // ITAD 없으면 Steam 가격
                    priceInfo.current_price = Math.round((data.price_overview?.final || 0) / 100) || 0;
                    priceInfo.regular_price = Math.round((data.price_overview?.initial || 0) / 100) || 0;
                    priceInfo.discount_percent = data.price_overview?.discount_percent || 0;
                    priceInfo.store_url = `https://store.steampowered.com/app/${candidate.appid}`;
                    priceInfo.store_name = 'Steam';
                }

                // steam_appid 있으면 store_url은 항상 스팀 (itad.link 방지)
                if (candidate.appid && priceInfo) {
                    priceInfo.store_url = `https://store.steampowered.com/app/${candidate.appid}`;
                }

                const gameDoc = {
                    steam_appid: candidate.appid,
                    slug: `steam-${candidate.appid}`,
                    title: data.name,
                    title_ko: data.name,
                    description: data.detailed_description || data.short_description || '',
                    main_image: data.header_image || '',
                    screenshots: (data.screenshots || []).slice(0, 10).map(s => s.path_full),
                    trailers: data._trailers || [],
                    releaseDate: data.release_date?.date ? new Date(data.release_date.date) : null,
                    metacritic_score: data.metacritic?.score || 0,
                    igdb_score: igdbScore,
                    tags: rawTags,
                    smart_tags: smartTags,
                    difficulty: calcDifficulty(smartTags),
                    price_info: priceInfo,
                    steam_ccu: ccu,
                    steam_reviews: {
                        overall: reviews || { summary: '정보 없음', total: 0, positive: 0, percent: 0 },
                        recent: { summary: '정보 없음', total: 0, positive: 0, percent: 0 }
                    },
                    isAdult,
                    platforms: ['Steam'],
                    lastUpdated: new Date()
                };

                await Game.updateOne({ steam_appid: candidate.appid }, { $set: gameDoc }, { upsert: true });
                const tagNote = browser ? `태그:${smartTags.length}개` : '태그:Puppeteer없음';
            console.log(`  ✅ 신규: ${data.name} (${tagNote})`);
                newCollected++;
                await sleep(1500);
            } catch (e) {
                console.error(`  ❌ 수집 실패: ${candidate.name} — ${e.message}`);
                errors++;
            }
        }

        // ── 2단계: 가격 갱신 (N일 이상 미갱신) ──────────────────────────────
        console.log('\n💰 2단계: 가격 갱신 시작');
        const staleDate = new Date(Date.now() - PRICE_UPDATE_DAYS * 24 * 60 * 60 * 1000);
        const staleGames = await Game.find({
            steam_appid: { $exists: true, $ne: null },
            $or: [{ lastUpdated: { $lt: staleDate } }, { lastUpdated: { $exists: false } }]
        }).select('_id title steam_appid').limit(100).lean();

        console.log(`  가격 갱신 대상: ${staleGames.length}개`);

        for (const game of staleGames) {
            try {
                // ① Steam 공식 API를 항상 먼저 조회 (정확한 현재 가격 기준)
                const steamData = await getSteamDetails(game.steam_appid);
                await sleep(300);

                let steamPrice = null;
                if (steamData?.price_overview) {
                    const po = steamData.price_overview;
                    steamPrice = {
                        current_price: Math.round((po.final || 0) / 100),
                        regular_price: Math.round((po.initial || 0) / 100),
                        discount_percent: po.discount_percent || 0,
                        isFree: false,
                    };
                } else if (steamData?.is_free) {
                    steamPrice = { current_price: 0, regular_price: 0, discount_percent: 0, isFree: true };
                }

                if (!steamPrice) { await sleep(200); continue; }

                // ② ITAD에서 멀티스토어 딜 목록 추가 (Steam 가격이 기준이므로 보정 필요)
                let deals = [];
                let expiry = null;
                try {
                    const meta = await GameMetadata.findOne({ steamAppId: game.steam_appid }).lean();
                    if (meta?.itad?.uuid) {
                        const itadData = await getITADPrice(meta.itad.uuid);
                        if (itadData?.deals?.length > 0) {
                            // ITAD 딜이 Steam 가격과 너무 차이나면(50% 이상 낮으면) 제외
                            const minSane = steamPrice.regular_price * 0.3;
                            deals = itadData.deals.filter(d =>
                                d.price >= minSane || d.price === 0 || steamPrice.regular_price === 0
                            );
                        }
                        await sleep(300);
                    }
                } catch {}

                // ③ Steam 딜을 deals[0] 자리에 항상 포함
                const steamDeal = {
                    shopName: 'Steam',
                    price: steamPrice.current_price,
                    regularPrice: steamPrice.regular_price,
                    discount: steamPrice.discount_percent,
                    url: `https://store.steampowered.com/app/${game.steam_appid}/`
                };
                // Steam 딜이 중복이면 교체, 없으면 맨 앞에 추가
                const withoutSteam = deals.filter(d => d.shopName !== 'Steam');
                deals = [steamDeal, ...withoutSteam];

                // ④ 할인 중이면 expiry 설정 (ITAD expiry 없으면 30일 임시 설정)
                if (steamPrice.discount_percent > 0) {
                    expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 최대 30일
                } else {
                    expiry = null; // 할인 아니면 만료일 제거
                }

                const reviews = await getSteamReviews(game.steam_appid);
                await sleep(300);
                const ccu = await getSteamCCU(game.steam_appid);

                const updateData = {
                    'price_info.current_price': steamPrice.current_price,
                    'price_info.regular_price': steamPrice.regular_price,
                    'price_info.discount_percent': steamPrice.discount_percent,
                    'price_info.isFree': steamPrice.isFree,
                    'price_info.expiry': expiry,
                    'price_info.deals': deals,
                    steam_ccu: ccu,
                    lastUpdated: new Date()
                };
                if (reviews) {
                    updateData['steam_reviews.overall.percent'] = reviews.percent;
                    updateData['steam_reviews.overall.total'] = reviews.total;
                    updateData['steam_reviews.overall.positive'] = reviews.positive;
                    updateData['steam_reviews.overall.summary'] = reviews.summary;
                }

                await Game.updateOne({ _id: game._id }, { $set: updateData });
                priceUpdated++;
                if (priceUpdated % 10 === 0) console.log(`  💰 ${priceUpdated}/${staleGames.length} 갱신 중...`);
                await sleep(800);
            } catch (e) { errors++; }
        }
        console.log(`  ✅ 가격 갱신: ${priceUpdated}개`);


        // ── 3단계: 메타데이터 보완 (smart_tags 없는 게임) ─────────────────────
        console.log('\n🏷️  3단계: 메타데이터 보완');
        const noTagGames = await Game.find({
            $or: [{ smart_tags: { $exists: false } }, { smart_tags: { $size: 0 } }],
            steam_appid: { $exists: true }
        }).select('_id title steam_appid').limit(50).lean();

        for (const game of noTagGames) {
            try {
                const rawTags = await scrapeAppTags(game.steam_appid);
                if (rawTags.length === 0) { await sleep(500); continue; }
                const smartTags = mapSteamTags(rawTags);
                await Game.updateOne({ _id: game._id }, { $set: { tags: rawTags, smart_tags: smartTags, difficulty: calcDifficulty(smartTags) } });
                metaFilled++;
                await sleep(1000);
            } catch { errors++; }
        }
        console.log(`  ✅ 태그 보완: ${metaFilled}개`);

        if (browser) await browser.close().catch(() => {});

        const elapsed = Math.round((Date.now() - startTime) / 1000 / 60);
        const summary = `신규:${newCollected} / 가격갱신:${priceUpdated} / 태그보완:${metaFilled} / 오류:${errors} / 소요:${elapsed}분`;
        console.log(`\n🎉 완료! ${summary}`);

        await sendDiscordAlert('✅ 일일 게임 수집 완료', summary).catch(() => {});

    } catch (err) {
        console.error('💥 크래시:', err);
        await sendDiscordAlert('❌ 일일 게임 수집 크래시', err.message).catch(() => {});
        if (browser) await browser.close().catch(() => {});
        process.exit(1);
    }

    process.exit(0);
}

run();