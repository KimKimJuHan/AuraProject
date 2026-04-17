const axios = require('axios');
const Game = require('../models/Game');

const updateExchangeRates = async () => {
    try {
        console.log('[배치 작업] 환율 데이터 업데이트 시작');
        
        // 1. 환율 오픈 API 호출 (무료, 키 불필요)
        const response = await axios.get('https://open.er-api.com/v6/latest/USD');
        const krwRate = response.data.rates.KRW;
        
        if (!krwRate) throw new Error('KRW 환율 정보를 가져오지 못했습니다.');
        console.log(`[배치 작업] 현재 1 USD = ${krwRate} KRW`);

        // 2. DB에서 가격 정보가 존재하는 모든 게임 조회
        // (필드가 존재하고, 가격이 0 이상인 데이터)
        const games = await Game.find({ 
            'price_info.current_price': { $exists: true, $gte: 0 } 
        });
        
        let updatedCount = 0;
        for (let game of games) {
            const priceInfo = game.price_info;
            
            // 기존 가격(USD 기준)이 있다고 가정하고 원화로 변환 후 10원 단위 반올림
            const initialKrw = Math.round((priceInfo.initial_price * krwRate) / 10) * 10;
            const currentKrw = Math.round((priceInfo.current_price * krwRate) / 10) * 10;
            
            // 스키마에 맞춰 원화 가격 필드 업데이트 (또는 덮어쓰기)
            // 주의: 프론트엔드에서 _krw 접미사가 붙은 필드를 읽도록 수정하거나, 
            // 아예 current_price 자체를 KRW로 덮어씌워야 합니다. 여기서는 안전하게 분리 저장합니다.
            game.price_info = {
                ...priceInfo,
                initial_price_krw: initialKrw || 0,
                current_price_krw: currentKrw || 0
            };

            await game.save();
            updatedCount++;
        }

        console.log(`[배치 작업] 환율 업데이트 완료. 총 ${updatedCount}개 게임 KRW 가격 갱신.`);
    } catch (error) {
        console.error('[배치 작업] 환율 업데이트 실패:', error.message);
    }
};

module.exports = updateExchangeRates;