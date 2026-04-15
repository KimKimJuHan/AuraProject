const express = require("express");
const router = express.Router();
// ★ 팩트: 기존 recommendController가 아니라, 팀원이 추천 이유(reason) 로직을 새로 작성해둔 recoController를 불러와야 합니다.
const recoController = require("../controllers/recoController");

// 프론트엔드의 axios.post('/api/steam/reco') 요청을 정확히 받아냅니다.
router.post("/reco", (req, res) => recoController.getPersonalRecommendations(req, res));

// (만약 프론트엔드가 /api/advanced/recommend/personal 로 요청할 경우를 대비한 호환성 라우터)
router.post("/personal", (req, res) => recoController.getPersonalRecommendations(req, res));

module.exports = router;