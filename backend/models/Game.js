const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  // 1. ITAD의 고유 ID (기준 ID)
  slug: { type: String, required: true, unique: true },
  
  // 2. 기본 정보
  steam_appid: { type: Number, required: true },
  title: { type: String, required: true },
  main_image: { type: String },
  description: { type: String },
  
  // 3. 커스텀 태그 및 사양
  // ([String] 타입이므로 태그가 늘어나도 스키마 수정 불필요)
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
    
    // ★ 다나와 스타일 가격 비교를 위한 전체 딜 목록
    deals: [{
      shopName: String,
      price: Number,
      regularPrice: Number,
      discount: Number,
      url: String
    }]
  },

  // 6. 미디어 정보 (상세 페이지 갤러리용)
  screenshots: [String], 
  trailers: [String],

  // 7. 추가 정보 (HLTB & 평점)
  play_time: { type: String, default: "정보 없음" }, 
  metacritic_score: { type: Number, default: 0 },

  // 8. 투표 시스템 (좋아요/싫어요)
  votes: [{
    identifier: String, // IP 주소
    type: { type: String, enum: ['like', 'dislike'] },
    weight: { type: Number, default: 1 },
    date: { type: Date, default: Date.now }
  }],
  likes_count: { type: Number, default: 0 },
  dislikes_count: { type: Number, default: 0 }
});

module.exports = mongoose.model('Game', gameSchema);