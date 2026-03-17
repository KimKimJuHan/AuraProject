const express = require("express");
const router = express.Router();
const recommendController = require("../controllers/recommendController");

// 개인화 게임 추천 요청
router.post("/personal", recommendController.getPersonalRecommendations);

module.exports = router;