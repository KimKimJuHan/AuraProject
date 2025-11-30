const mongoose = require('mongoose');

const trendHistorySchema = new mongoose.Schema({
  steam_appid: { type: Number, required: true, index: true },

  // 트렌드 정보 (그래프용)
  trend_score: { type: Number, default: 0 },
  twitch_viewers: { type: Number, default: 0 },
  chzzk_viewers: { type: Number, default: 0 },
  steam_ccu: { type: Number, default: 0 }, // ★ [추가] 스팀 동접자

  // 수집 시점
  recordedAt: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('TrendHistory', trendHistorySchema, 'trend_history');