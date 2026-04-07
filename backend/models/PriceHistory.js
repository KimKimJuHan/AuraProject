const mongoose = require('mongoose');

const priceHistorySchema = new mongoose.Schema({
  steam_appid: { type: Number, required: true, index: true },
  
  // 가격 정보
  regular_price: { type: Number, default: 0 },
  current_price: { type: Number, default: 0 },
  discount_percent: { type: Number, default: 0 },
  isFree: { type: Boolean, default: false },
  historical_low: { type: Number, default: 0 }, 
  
  // 수집 시점 (인덱스를 통해 빠른 시간 순 조회 가능)
  recordedAt: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('PriceHistory', priceHistorySchema, 'price_history');