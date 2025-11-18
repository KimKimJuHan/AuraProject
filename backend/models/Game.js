const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  // 1. ITAD의 고유 ID
  slug: { type: String, required: true, unique: true },
  
  // 2. 기본 정보
  steam_appid: { type: Number, required: true },
  title: { type: String, required: true },
  main_image: { type: String },
  description: { type: String },
  
  // 3. 커스텀 태그 및 사양
  smart_tags: [String], 
  pc_requirements: {
    minimum: String,
    recommended: String
  },

  // 4. 정렬 및 필터링용 데이터
  popularity: { type: Number, default: 0 },
  releaseDate: { type: Date },

  // 5. 가격 정보
  price_info: {
    regular_price: Number,
    current_price: Number,
    discount_percent: Number,
    store_url: String,
    store_name: String, 
    historical_low: Number,
    expiry: String, 
    isFree: { type: Boolean, default: false },
    deals: [{
      shopName: String,
      price: Number,
      regularPrice: Number,
      discount: Number,
      url: String
    }]
  },

  // 6. 미디어 정보
  screenshots: [String], 
  trailers: [String],

  // 7. 추가 정보 (HLTB & 평점)
  play_time: { type: String, default: "정보 없음" }, // HowLongToBeat
  metacritic_score: { type: Number, default: 0 }    // ★ [신규] 메타크리틱 점수
});

module.exports = mongoose.model('Game', gameSchema);