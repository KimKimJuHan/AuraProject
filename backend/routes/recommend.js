const express = require('express');
const router = express.Router();
const recommendController = require('../controllers/recommendController');

// 1. 메인 페이지(MainPage.js)의 기본 필터 및 무한 스크롤 요청 처리
router.post('/', recommendController.getMainPageGames);

// 2. 맞춤 추천 페이지(PersonalRecoPage.js)의 섹션별 데이터 요청 처리 (기존 코드 복구)
router.post('/personal', recommendController.getPersonalRecommendations);
router.post('/reco', recommendController.getPersonalRecommendations);

module.exports = router;