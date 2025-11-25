const mongoose = require('mongoose');

const saleHistorySchema = new mongoose.Schema({
  steam_appid: { type: Number, required: true, index: true },
  
  // 할인 상세 정보 (deal이 발생했을 때만 기록)
  current_price: { type: Number, required: true },
  regular_price: { type: Number, required: true },
  discount_percent: { type: Number, required: true },
  store_url: String,
  store_name: String,
  
  // 이벤트 시점
  startDate: { type: Date, default: Date.now, index: true },
  expiry: String, // 할인 만료일 (Steam API에서 제공하는 경우)
  
  // ITAD Deal 정보 (선택 사항)
  itad_deals: [{ shopName: String, price: Number, regularPrice: Number, discount: Number, url: String }]
});

module.exports = mongoose.model('SaleHistory', saleHistorySchema, 'sale_history');