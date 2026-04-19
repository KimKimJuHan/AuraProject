const express = require("express");
const router = express.Router();
const recommendController = require("../controllers/recommendController");

router.post("/personal", recommendController.getPersonalRecommendations);
router.post("/reco", recommendController.getPersonalRecommendations);

module.exports = router;