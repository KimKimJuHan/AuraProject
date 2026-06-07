/**
 * collect_new_releases.js
 * 최근 몇 달간 놓친 신작 게임을 대량 수집하는 전용 스크립트
 * 목표: DB를 3500개 수준까지 확장
 * 
 * 소스:
 *   1. SteamSpy 최근 2주 인기 (top100in2weeks)
 *   2. SteamSpy 전체 인기 (top100forever)
 *   3. Steam Featured Categories (신작/베스트셀러/스페셜)
 *   4. Steam 신작 목록 API (getappsingenre - 최근 출시순)
 *   5. ITAD 인기작
 * 
 * 사용: node scripts/collect_new_releases.js
 * 백그라운드: nohup node scripts/collect_new_releases.js > /tmp/collect_new.log 2>&1 &
 */
require('dotenv').config();
const axios = require('axios');
const mongoose = require('mongoose');
const Game = require('../models/Game');
const MONGODB_URI = process.env.MONGODB_URI;
const ITAD_API_KEY = process.env.ITAD_API_KEY;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const MAX_TARGET = 3500;   // 목표 게임 수
const BATCH_SIZE = 200;    // 한 번에 처리할 최대 수

// Steam 앱 상세 정보 가져오기
async function getSteamDetails(appid) {
    try {
        const res = await axios.get('https://store.steampowered.com/api/appdetails', {
            params: { appids: appid, cc: 'kr', l: 'korean' },
            timeout: 15000
        });
        const data = res.data?.[appid];
        if (!data?.success || data?.data?.type !== 'game') return null;
        return data.data;
    } catch { return null; }
}

// 후보 게임 목록 수집 (여러 소스)
async function getCandidates() {
    const candidates = new Map();
    console.log('\n📡 신작 후보 수집 중...');

    // 1. SteamSpy top100in2weeks
    try {
        const res = await axios.get('https://steamspy.com/api.php?request=top100in2weeks', { timeout: 15000 });
        Object.values(res.data || {}).forEach(g => {
            if (g.appid) candidates.set(Number(g.appid), { appid: Number(g.appid), name: g.name });
        });
        console.log(`  SteamSpy 2주 인기: ${candidates.size}개`);
    } catch (e) { console.warn('  SteamSpy 2주 실패:', e.message); }

    // 2. SteamSpy top100forever
    try {
        const res = await axios.get('https://steamspy.com/api.php?request=top100forever', { timeout: 15000 });
        const before = candidates.size;
        Object.values(res.data || {}).forEach(g => {
            if (g.appid) candidates.set(Number(g.appid), { appid: Number(g.appid), name: g.name });
        });
        console.log(`  SteamSpy 전체: +${candidates.size - before}개`);
    } catch (e) { console.warn('  SteamSpy 전체 실패:', e.message); }

    // 3. Steam Featured Categories (신작/베스트셀러/스페셜)
    try {
        const res = await axios.get('https://store.steampowered.com/api/featuredcategories', {
            params: { cc: 'kr', l: 'korean' }, timeout: 15000
        });
        const before = candidates.size;
        const sections = ['new_releases', 'top_sellers', 'specials', 'coming_soon'];
        for (const sec of sections) {
            (res.data?.[sec]?.items || []).forEach(g => {
                if (g.id) candidates.set(Number(g.id), { appid: Number(g.id), name: g.name });
            });
        }
        console.log(`  Steam featured: +${candidates.size - before}개`);
    } catch (e) { console.warn('  Steam featured 실패:', e.message); }

    // 4. Steam 장르별 신작 (액션, RPG, 전략, 어드벤처, 시뮬레이션)
    const genres = [
        { id: '1', name: '액션' },
        { id: '25', name: 'RPG' },
        { id: '2', name: '전략' },
        { id: '3', name: '어드벤처' },
        { id: '28', name: '시뮬레이션' },
        { id: '23', name: '인디' },
    ];
    for (const genre of genres) {
        try {
            const res = await axios.get('https://store.steampowered.com/api/getappsingenre', {
                params: { genre: genre.id, cc: 'kr', l: 'korean', sort_by: 'Released_DESC', page: 0 },
                timeout: 15000
            });
            const before = candidates.size;
            const tabs = res.data?.tabs || {};
            for (const tab of Object.values(tabs)) {
                (tab?.items || []).forEach(g => {
                    if (g.id) candidates.set(Number(g.id), { appid: Number(g.id), name: g.name });
                });
            }
            const added = candidates.size - before;
            if (added > 0) console.log(`  Steam ${genre.name}: +${added}개`);
            await sleep(500);
        } catch { /* 조용히 실패 */ }
    }

    // 5. ITAD 인기작 (최근 인기)
    if (ITAD_API_KEY) {
        try {
            const res = await axios.get('https://api.isthereanydeal.com/stats/popularity/v1', {
                params: { key: ITAD_API_KEY, limit: 200, country: 'KR' }, timeout: 15000
            });
            const before = candidates.size;
            (res.data || []).forEach(g => {
                if (g.appid) candidates.set(Number(g.appid), { appid: Number(g.appid), name: g.title });
            });
            console.log(`  ITAD 인기작: +${candidates.size - before}개`);
        } catch {}
    }

    // 6. SteamSpy all 여러 페이지 (pool 확장)
    for (let page = 0; page <= 5; page++) {
        try {
            const res = await axios.get(`https://steamspy.com/api.php?request=all&page=${page}`, { timeout: 20000 });
            const before = candidates.size;
            Object.values(res.data || {}).forEach(g => {
                if (g.appid) candidates.set(Number(g.appid), { appid: Number(g.appid), name: g.name });
            });
            const added = candidates.size - before;
            if (added > 0) console.log(`  SteamSpy all p${page}: +${added}개`);
            else break; // 더 이상 새 게임 없으면 중단
            await sleep(1000);
        } catch (e) { break; }
    }

    // 7. Steam 최근 출시 앱 목록 (GetAppList v2)
    try {
        const before = candidates.size;
        // 최근 출시 기준 appid가 높은 게임들 (최신 게임일수록 appid가 큼)
        // 알려진 최근 게임 appid 범위: 2000000~3500000
        const recentRanges = [
            { from: 2800000, to: 3500000 },
            { from: 2400000, to: 2800000 },
            { from: 2000000, to: 2400000 },
        ];
        for (const range of recentRanges) {
            try {
                const res = await axios.get('https://api.steampowered.com/IStoreService/GetAppList/v1/', {
                    params: { 
                        include_games: true, include_dlc: false, include_software: false,
                        include_videos: false, include_hardware: false,
                        last_appid: range.from, max_results: 1000
                    },
                    timeout: 20000
                });
                const apps = res.data?.response?.apps || [];
                apps.forEach(a => {
                    if (a.appid && Number(a.appid) <= range.to) {
                        candidates.set(Number(a.appid), { appid: Number(a.appid), name: a.name });
                    }
                });
                await sleep(500);
            } catch {}
        }
        console.log(`  Steam GetAppList (최근 범위): +${candidates.size - before}개`);
    } catch {}

    console.log(`\n📊 총 후보: ${candidates.size}개`);
    return Array.from(candidates.values());
}

async function run() {
    const startTime = Date.now();
    await mongoose.connect(MONGODB_URI);
    console.log('✅ DB 연결');

    const currentCount = await Game.countDocuments();
    console.log(`현재 게임 수: ${currentCount}개 | 목표: ${MAX_TARGET}개 | 필요: ${Math.max(0, MAX_TARGET - currentCount)}개`);

    if (currentCount >= MAX_TARGET) {
        console.log('목표 달성 완료. 종료.');
        process.exit(0);
    }

    const existingIds = new Set((await Game.find({}).select('steam_appid').lean()).map(g => g.steam_appid));
    const candidates = await getCandidates();
    const newCandidates = candidates
        .filter(c => c.appid > 0 && !existingIds.has(c.appid))
        .slice(0, Math.min(BATCH_SIZE, MAX_TARGET - currentCount));

    console.log(`\n🎮 신규 수집 대상: ${newCandidates.length}개 (기존 제외 후)`);

    let collected = 0, skipped = 0, errors = 0;

    for (let i = 0; i < newCandidates.length; i++) {
        const candidate = newCandidates[i];
        try {
            const data = await getSteamDetails(candidate.appid);
            if (!data) { skipped++; await sleep(300); continue; }

            // 게임 타입만 수집, DLC/영상 제외
            if (data.type !== 'game') { skipped++; continue; }

            // 이미 있으면 스킵
            const existing = await Game.findOne({ steam_appid: candidate.appid });
            if (existing) { skipped++; continue; }

            const releaseDate = data.release_date?.date ? new Date(data.release_date.date) : null;
            const isReleased = releaseDate && releaseDate <= new Date();

            const gameDoc = {
                steam_appid: candidate.appid,
                slug: `steam-${candidate.appid}`,
                title: data.name,
                title_ko: data.name,
                description: (data.detailed_description || data.short_description || '').slice(0, 2000),
                main_image: data.header_image || '',
                screenshots: (data.screenshots || []).slice(0, 10).map(s => s.path_full),
                trailers: [],
                releaseDate: isReleased ? releaseDate : null,
                tags: [],
                smart_tags: [],
                isAdult: false,
                trend_score: 0,
                steam_ccu: 0,
                price_info: {
                    current_price: data.is_free ? 0 : Math.round((data.price_overview?.final || 0) / 100),
                    regular_price: Math.round((data.price_overview?.initial || 0) / 100),
                    discount_percent: data.price_overview?.discount_percent || 0,
                    isFree: data.is_free || false,
                    store_url: `https://store.steampowered.com/app/${candidate.appid}`,
                    store_name: 'Steam',
                    deals: []
                },
                steam_reviews: {
                    overall: { summary: '정보 없음', total: 0, positive: 0, percent: 0 },
                    recent: { summary: '정보 없음', total: 0, positive: 0, percent: 0 }
                },
                pc_requirements: data.pc_requirements || {},
                lastUpdated: new Date()
            };

            await Game.create(gameDoc);
            collected++;

            const elapsed = Math.round((Date.now() - startTime) / 1000);
            if (collected % 10 === 0) {
                const total = await Game.countDocuments();
                console.log(`[${i+1}/${newCandidates.length}] ${collected}개 수집 | DB총: ${total}개 | ${elapsed}초 경과`);
            }

            await sleep(600); // Steam API 과부하 방지

        } catch (e) {
            errors++;
            if (errors % 20 === 0) console.warn(`  ⚠️ 에러 ${errors}개 누적`);
            await sleep(500);
        }
    }

    const finalCount = await Game.countDocuments();
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n✅ 완료! 수집: ${collected}개 | 스킵: ${skipped}개 | 에러: ${errors}개`);
    console.log(`DB: ${currentCount}개 → ${finalCount}개 | 소요: ${Math.round(elapsed/60)}분`);

    if (finalCount < MAX_TARGET) {
        console.log(`목표(${MAX_TARGET}) 미달. 다시 실행하면 추가 수집됩니다.`);
    }
    process.exit(0);
}

run().catch(e => { console.error('❌ 치명적 오류:', e.message); process.exit(1); });