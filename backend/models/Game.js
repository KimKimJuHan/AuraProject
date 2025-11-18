const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true },
  steam_appid: { type: Number, required: true },
  title: { type: String, required: true },
  main_image: { type: String },
  description: { type: String },
  
  smart_tags: [String], 
  pc_requirements: {
    minimum: String,
    recommended: String
  },

  // ★ [수정] 단순 숫자 대신 계산된 인기도 저장 (수집기용)
  popularity: { type: Number, default: 0 },
  releaseDate: { type: Date },

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

  screenshots: [String], 
  trailers: [String],
  play_time: { type: String, default: "정보 없음" },
  metacritic_score: { type: Number, default: 0 },

  // ★ [신규] 투표 시스템 (IP 중복 방지 및 가중치)
  votes: [{
    identifier: String, // IP 주소 또는 User ID
    type: { type: String, enum: ['like', 'dislike'] }, // 좋아요/싫어요
    weight: { type: Number, default: 1 }, // 비회원 1, 회원 3
    date: { type: Date, default: Date.now }
  }],
  // (빠른 조회를 위해 계산된 합계도 저장)
  likes_count: { type: Number, default: 0 },
  dislikes_count: { type: Number, default: 0 }
});

module.exports = mongoose.model('Game', gameSchema);