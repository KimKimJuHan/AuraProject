const mongoose = require('mongoose');

const gameCategorySchema = new mongoose.Schema({
  steamAppId: { type: Number, required: true, unique: true }, // 스팀 ID (기준)
  title: { type: String, required: true }, // 게임 이름
  
  // 트위치 정보
  twitch: {
    id: String,        // 카테고리 ID (예: 32982)
    name: String,      // 카테고리 이름 (예: Grand Theft Auto V)
    boxArt: String     // 썸네일 이미지
  },

  // 치지직 정보
  chzzk: {
    categoryValue: String, // 검색어/카테고리명 (예: 리그 오브 레전드)
    posterImageUrl: String // 포스터 이미지
  },

  lastUpdated: { type: Date, default: Date.now }
});

module.exports = mongoose.model('GameCategory', gameCategorySchema);