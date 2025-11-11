// /backend/models/Game.js

const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  // 1. ITAD의 고유 ID (이걸 우리 시스템의 기준 ID로 사용)
  slug: { 
    type: String, 
    required: true,
    unique: true 
  },
  
  // 2. 스팀 AppID
  steam_appid: { type: Number, required: true },
  
  // 3. 기본 정보 (Info API + Steam API)
  title: { type: String, required: true },
  main_image: { type: String },
  description: { type: String },
  
  // 4. '번역된' 스마트 태그
  smart_tags: [String], // ["4인 협동", "RPG"]
  
  // 5. PC 사양 (Steam API)
  pc_requirements: {
    minimum: String,
    recommended: String
  },

  // 6. '인기순' 정렬을 위한 '인기도' (Info API)
  popularity: { type: Number, default: 0 },
  
  // 7. '출시일' (New 탭용)
  releaseDate: { type: Date },

  // 8. '스냅샷' 가격 정보 (Prices API + Steam API)
  price_info: {
    regular_price: Number, // ★ [수정] "가격 정보 없음"을 위해 'null' 허용
    current_price: Number, // ★ [수정] "가격 정보 없음"을 위해 'null' 허용
    discount_percent: Number,
    store_url: String,
    store_name: String, 
    historical_low: Number,
    expiry: String, 
    isFree: { type: Boolean, default: false }
  },

  // 9. 미디어 정보 (Steam API)
  screenshots: [String], 
  trailers: [String], 

  // ★ [삭제] 10. 리뷰 점수 (접근 불가 API라 삭제)
  // review_score: ...
  // review_platform: ...
});

module.exports = mongoose.model('Game', gameSchema);