// backend/controllers/recommendController.js
const recommendService = require("../services/recommendService");

class RecommendController {
  async getPersonalRecommendations(req, res) {
    try {
      const { userId, tags, term } = req.body;
      const games = await recommendService.getPersonalRecommendations({ userId, tags, term });
      res.status(200).json({ games });
    } catch (error) {
      console.error("Recommend Error:", error);
      res.status(500).json({ error: "Server Error", message: error.message });
    }
  }
}

module.exports = new RecommendController();