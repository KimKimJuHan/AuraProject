/**
 * SOOP API 실제 응답 구조 진단 스크립트
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const axios = require('axios');

async function main() {
    const clientId = process.env.SOOP_CLIENT_ID;
    console.log('SOOP_CLIENT_ID:', clientId ? '있음' : '없음');

    // 1. 게임 방송 목록 API 테스트
    try {
        const res = await axios.get('https://openapi.sooplive.com/broad/list', {
            params: { client_id: clientId, select_key: 'cate', select_value: '00040000', order_type: 'view_cnt', page_no: 1 },
            headers: { 'Accept': '*/*' },
            timeout: 10000,
        });
        console.log('\n[SOOP] broad/list 응답 상태:', res.status);
        console.log('[SOOP] 방송 수:', res.data?.broad?.length);
        if (res.data?.broad?.length > 0) {
            const sample = res.data.broad[0];
            console.log('[SOOP] 방송 샘플 키:', Object.keys(sample).join(', '));
            console.log('[SOOP] 샘플:', JSON.stringify(sample, null, 2));
        }
    } catch(e) {
        console.error('[SOOP] broad/list 실패:', e.response?.status, e.message);
        console.log('[SOOP] 응답 데이터:', JSON.stringify(e.response?.data)?.substring(0, 300));
    }

    // 2. 카테고리 목록 API 테스트
    try {
        const catRes = await axios.get('https://openapi.sooplive.com/broad/category/list', {
            params: { client_id: clientId, locale: 'ko_KR' },
            headers: { 'Accept': '*/*' }, timeout: 10000,
        });
        console.log('\n[SOOP] category/list 응답 상태:', catRes.status);
        const cats = catRes.data?.broad_category || [];
        console.log('[SOOP] 최상위 카테고리 수:', cats.length);
        // 게임 카테고리 찾기
        const gameCat = cats.find(c => c.cate_name?.includes('게임') || c.cate_no === '00040000');
        if (gameCat) {
            console.log('[SOOP] 게임 카테고리:', JSON.stringify(gameCat).substring(0, 400));
            console.log('[SOOP] 하위 카테고리 수:', gameCat.child?.length || 0);
            if (gameCat.child?.length > 0) {
                console.log('[SOOP] 하위 카테고리 샘플:', gameCat.child.slice(0, 5).map(c => `${c.cate_no}:${c.cate_name}`).join(', '));
            }
        }
    } catch(e) {
        console.error('[SOOP] category/list 실패:', e.response?.status, e.message);
    }

    // 3. 다른 엔드포인트 시도
    try {
        const res2 = await axios.get('https://openapi.sooplive.com/broad/list', {
            params: { client_id: clientId, order_type: 'view_cnt', page_no: 1 },
            headers: { 'Accept': '*/*' },
            timeout: 10000,
        });
        console.log('\n[SOOP] 전체 방송 목록 응답:', res2.status, '방송수:', res2.data?.broad?.length);
        if (res2.data?.broad?.[0]) {
            console.log('[SOOP] 전체 방송 샘플:', JSON.stringify(res2.data.broad[0], null, 2));
        }
    } catch(e) {
        console.error('[SOOP] 전체목록 실패:', e.response?.status, e.message);
    }
}

main().catch(console.error);
