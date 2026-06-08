/**
 * 붉은사막 스팀 실제 가격 재확인 후 DB 수정
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('../models/Game');

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);

    // 붉은사막 실제 스팀 가격 직접 조회
    const appId = 3321460;
    try {
        const res = await axios.get('https://store.steampowered.com/api/appdetails', {
            params: { appids: appId, cc: 'kr', l: 'korean' },
            timeout: 10000
        });
        const data = res.data?.[appId]?.data;
        if (!data) { console.log('게임 데이터 없음'); process.exit(1); }

        const priceData = data.price_overview;
        console.log('=== 스팀 실제 가격 ===');
        console.log('이름:', data.name);
        console.log('isFree:', data.is_free);
        console.log('price_overview:', JSON.stringify(priceData, null, 2));

        if (priceData) {
            const currentPrice = Math.round(priceData.final / 100);  // 원화 (단위: 원)
            const regularPrice = Math.round(priceData.initial / 100);
            const discount = priceData.discount_percent || 0;
            console.log(`\n현재가: ${currentPrice}원 | 정가: ${regularPrice}원 | 할인율: ${discount}%`);

            // DB 업데이트
            const result = await Game.updateOne(
                { steam_appid: appId },
                { $set: {
                    'price_info.current_price': currentPrice,
                    'price_info.regular_price': regularPrice,
                    'price_info.discount_percent': discount,
                    'price_info.isFree': false,
                    'price_info.deals': [{
                        shopName: 'Steam',
                        price: currentPrice,
                        regularPrice: regularPrice,
                        discount: discount,
                        url: `https://store.steampowered.com/app/${appId}/`
                    }]
                }}
            );
            console.log('\n✅ DB 업데이트:', result.modifiedCount, '건');
        }
    } catch(e) {
        console.error('오류:', e.message);
    }

    process.exit(0);
}
main().catch(console.error);
