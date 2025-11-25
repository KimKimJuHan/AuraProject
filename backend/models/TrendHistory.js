const mongoose = require('mongoose');

const trendHistorySchema = new mongoose.Schema({
  steam_appid: { type: Number, required: true, index: true },

  // 트렌드 정보
  trend_score: { type: Number, default: 0 },
  twitch_viewers: { type: Number, default: 0 },
  chzzk_viewers: { type: Number, default: 0 },

  // 수집 시점
  recordedAt: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('TrendHistory', trendHistorySchema, 'trend_history');