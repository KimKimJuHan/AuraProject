const mongoose = require('mongoose');

const priceHistorySchema = new mongoose.Schema({
  steam_appid: { type: Number, required: true, index: true },
  
  // 가격 정보
  regular_price: { type: Number, default: 0 },
  current_price: { type: Number, default: 0 },
  discount_percent: { type: Number, default: 0 },
  isFree: { type: Boolean, default: false },
  historical_low: { type: Number, default: 0 }, // 수집 당시 ITAD에서 확인된 역대 최저가
  
  // 수집 시점
  recordedAt: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('PriceHistory', priceHistorySchema, 'price_history');