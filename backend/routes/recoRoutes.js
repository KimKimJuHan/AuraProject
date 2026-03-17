const express = require('express');
const router = express.Router();
const recoController = require('../controllers/recoController');

// 메인 페이지 필터링 및 검색 결과 반환
router.post('/recommend', recoController.getMainRecommendations);

// 특정 게임 상세 메타데이터 반환
router.get('/games/:id', recoController.getGameDetail);

// 트렌드 차트용 히스토리 데이터 조회
router.get('/games/:id/history', recoController.getGameHistory);

// 검색바 자동완성 기능
router.get('/search/autocomplete', recoController.getAutocomplete);

module.exports = router;