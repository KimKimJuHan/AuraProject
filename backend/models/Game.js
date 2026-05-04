// backend/models/Game.js

const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true },
  // ★ 수술 완료: 타 플랫폼 게임도 저장할 수 있도록 required: true를 제거했습니다.
  steam_appid: { type: Number }, 
  // ★ 수술 완료: 플랫폼 구분용 필드를 복구했습니다. (기본값은 Steam)
  platforms: { type: [String], default: ['Steam'], index: true }, 
  title: { type: String, required: true, index: true },
  title_ko: { type: String, default: "", index: true },
  main_image: { type: String },
  description: { type: String },
  
  isAdult: { type: Boolean, default: false },
  smart_tags: { type: [String], index: true },
  tags: { type: [String], default: undefined }, // Steam 원본 태그 (smart_tags 생성 소스)
  
  // ★ [과제 3] 난이도 필드 추가
  difficulty: { type: String, enum: ['초심자', '보통', '심화', '정보 없음'], default: '정보 없음', index: true },

  trend_score: { type: Number, default: 0 },
  twitch_viewers: { type: Number, default: 0 },
  chzzk_viewers: { type: Number, default: 0 },
  soop_viewers:  { type: Number, default: 0 },
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
    // ★ [과제 2] 원화 가격 필드 명시
    initial_price_krw: Number,
    current_price_krw: Number,
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
  
  play_time: { 
    main: Number,          
    extra: Number,         
    completionist: Number, 
    raw: String            
  },
  
  metacritic_score: { type: Number, default: 0 },
  igdb_score: { type: Number, default: 0 },

  votes: [{ identifier: String, type: { type: String, enum: ['like', 'dislike'] }, date: { type: Date, default: Date.now } }],
  likes_count: { type: Number, default: 0 },
  dislikes_count: { type: Number, default: 0 }
});

module.exports = mongoose.model('Game', gameSchema, 'games');
// ── 복합 인덱스 (추천 API 쿼리 최적화) ───────────────────────────────────────
// 메인 추천 API가 항상 isAdult 필터 + 정렬 조합으로 쿼리함
gameSchema.index({ isAdult: 1, steam_ccu: -1 });
gameSchema.index({ isAdult: 1, 'price_info.discount_percent': -1 });
gameSchema.index({ isAdult: 1, releaseDate: -1 });
gameSchema.index({ isAdult: 1, 'steam_reviews.overall.percent': -1 });
gameSchema.index({ isAdult: 1, 'price_info.current_price': 1 });
// 태그 + isAdult 복합 (태그 필터링 쿼리)
gameSchema.index({ isAdult: 1, smart_tags: 1, steam_ccu: -1 });