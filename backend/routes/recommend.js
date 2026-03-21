const express = require("express");
const router = express.Router();
const recommendController = require("../controllers/recommendController");

// 기존 주소 (유지)
router.post("/personal", recommendController.getPersonalRecommendations);

// ★ [수정] 프론트엔드(PersonalRecoPage)의 요청 주소와 일치하는 엔드포인트 추가
router.post("/reco", recommendController.getPersonalRecommendations);

module.exports = router;