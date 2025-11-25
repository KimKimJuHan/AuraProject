const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true },
  steam_appid: { type: Number, required: true },
  title: { type: String, required: true },
  title_ko: { type: String, default: "" },
  main_image: { type: String },
  description: { type: String },
  smart_tags: [String], 
  
  // ★ 삭제됨: trend_score, twitch_viewers, chzzk_viewers
  
  pc_requirements: { minimum: String, recommended: String },
  popularity: { type: Number, default: 0 },
  releaseDate: { type: Date },

  // ★ 삭제됨: price_info
  
  screenshots: [String], 
  trailers: [String],
  play_time: { type: String, default: "정보 없음" }, 
  metacritic_score: { type: Number, default: 0 },
  votes: [{ identifier: String, type: { type: String, enum: ['like', 'dislike'] }, date: { type: Date, default: Date.now } }],
  likes_count: { type: Number, default: 0 },
  dislikes_count: { type: Number, default: 0 }
});

module.exports = mongoose.model('Game', gameSchema, 'games');