const mongoose = require('mongoose');

const saleHistorySchema = new mongoose.Schema({
  steam_appid: { type: Number, required: true, index: true },
  
  // 할인 상세 정보
  current_price: { type: Number, required: true },
  regular_price: { type: Number, required: true },
  discount_percent: { type: Number, required: true },
  store_url: String,
  store_name: String,
  
  // 이벤트 시점
  startDate: { type: Date, default: Date.now, index: true },
  expiry: String, 
  
  // ITAD Deal 정보
  itad_deals: [{ shopName: String, price: Number, regularPrice: Number, discount: Number, url: String }]
});

module.exports = mongoose.model('SaleHistory', saleHistorySchema, 'sale_history');