// backend/models/Game.js

const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true },
  steam_appid: { type: Number, required: true },
  title: { type: String, required: true },
  title_ko: { type: String, default: "" },
  main_image: { type: String },
  description: { type: String },
  smart_tags: [String], 

  // 트렌드
  trend_score: { type: Number, default: 0 },
  twitch_viewers: { type: Number, default: 0 },
  chzzk_viewers: { type: Number, default: 0 },
  steam_ccu: { type: Number, default: 0 },

  // ★ [수정] 리뷰 스키마 구조 변경 (전체 / 최근)
  steam_reviews: {
    overall: {
      summary: { type: String, default: "정보 없음" }, 
      positive: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
      percent: { type: Number, default: 0 }
    },
    recent: {
      summary: { type: String, default: "정보 없음" }, 
      positive: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
      percent: { type: Number, default: 0 }
    }
  },

  // ... (아래는 기존과 동일)
  pc_requirements: { minimum: String, recommended: String },
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
    deals: [
      {
        shopName: String,
        price: Number,
        regularPrice: Number,
        discount: Number,
        url: String,
      }
    ]
  },
  screenshots: [String],
  trailers: [String],
  play_time: { type: String, default: "정보 없음" },
  metacritic_score: { type: Number, default: 0 },
  votes: [{ identifier: String, type: { type: String, enum: ['like', 'dislike'] }, date: { type: Date, default: Date.now } }],
  likes_count: { type: Number, default: 0 },
  dislikes_count: { type: Number, default: 0 }
});

module.exports = mongoose.model('Game', gameSchema, 'games');