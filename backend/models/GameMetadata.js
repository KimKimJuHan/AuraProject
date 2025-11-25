const mongoose = require('mongoose');

const gameMetadataSchema = new mongoose.Schema({
  steamAppId: { type: Number, required: true, unique: true },
  title: { type: String, required: true },
  
  // ★ 추가: 같은 게임의 다른 버전 AppID 목록 (가격 상속용)
  aliasAppIds: [Number],

  // 1. 가격 수집 정보 (ITAD)
  itad: {
    uuid: String,        // ITAD 고유 ID (매번 Lookup 안 해도 됨)
    slug: String,        // URL 생성용 슬러그
    manualOverride: Boolean // 수동으로 ID를 지정했는지 여부
  },

  // 2. 트렌드 수집용 (트위치/치지직) - 추가됨
  trend: {
    twitchId: String,       // 트위치 카테고리 ID
    chzzkKeyword: String,   // 치지직 검색어
    lastChecked: Date
  },

  // 3. 스팀 데이터 수집 설정 (예외 처리용)
  steam: {
    usePackageId: Number, // 단품 가격이 없을 때 대체할 패키지 ID (GTA 5 등)
    isFree: Boolean       // 무료 게임 강제 지정
  },

  lastUpdated: { type: Date, default: Date.now }
});

module.exports = mongoose.model('GameMetadata', gameMetadataSchema);