// backend/models/Game.js

const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true },
  steam_appid: { type: Number, required: true },
  title: { type: String, required: true, index: true },
  title_ko: { type: String, default: "", index: true },
  main_image: { type: String },
  description: { type: String },
  
  isAdult: { type: Boolean, default: false },
  smart_tags: { type: [String], index: true },

  trend_score: { type: Number, default: 0 },
  twitch_viewers: { type: Number, default: 0 },
  chzzk_viewers: { type: Number, default: 0 },
  steam_ccu: { type: Number, default: 0 },

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
  
  // ★ [핵심 수정] 플레이타임 구조화 (숫자 기반)
  play_time: { 
    main: Number,          // 메인 스토리
    extra: Number,         // 메인 + 서브
    completionist: Number, // 완전 정복
    raw: String            // 원본 문자열 (백업용)
  },
  
  metacritic_score: { type: Number, default: 0 },
  igdb_score: { type: Number, default: 0 },

  votes: [{ identifier: String, type: { type: String, enum: ['like', 'dislike'] }, date: { type: Date, default: Date.now } }],
  likes_count: { type: Number, default: 0 },
  dislikes_count: { type: Number, default: 0 }
});

module.exports = mongoose.model('Game', gameSchema, 'games');