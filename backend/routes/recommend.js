const express = require('express');
const router = express.Router();
const recommendController = require('../controllers/recommendController');
const { optionalAuth } = require('../middleware/auth');

// 게스트도 사용 가능하지만, 개인화는 로그인한 "본인" 정보로만 한다
// (컨트롤러는 req.body.userId 대신 req.user._id 를 사용)
router.use(optionalAuth);

// 1. 메인 페이지(MainPage.js)의 기본 필터 및 무한 스크롤 요청 처리
router.post('/', recommendController.getMainPageGames);

// 2. 맞춤 추천 페이지(PersonalRecoPage.js)의 섹션별 데이터 요청 처리 (기존 코드 복구)
router.post('/personal', recommendController.getPersonalRecommendations);
router.post('/reco', recommendController.getPersonalRecommendations);

module.exports = router;