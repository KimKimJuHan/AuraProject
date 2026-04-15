// backend/controllers/recoController.js
const recoService = require('../services/recoService');

class RecoController {
    async getMainRecommendations(req, res) {
        try {
            const { tags, sortBy, page, searchQuery } = req.body;
            const result = await recoService.getMainRecommendations({ tags, sortBy, page, searchQuery });
            res.status(200).json(result);
        } catch (error) {
            console.error("Main Reco Error:", error);
            res.status(500).json({ error: 'Server Error', message: error.message });
        }
    }

    async getGameDetail(req, res) {
        try {
            const game = await recoService.getGameDetail(req.params.id);
            if (!game) return res.status(404).json({ error: 'Game Not found' });
            res.status(200).json(game);
        } catch (error) {
            res.status(500).json({ error: 'Server Error' });
        }
    }

    async getGameHistory(req, res) {
        try {
            const history = await recoService.getGameHistory(req.params.id);
            if (!history) return res.status(404).json({ error: 'History Not found' });
            res.status(200).json(history);
        } catch (error) {
            res.status(500).json({ error: 'Server Error' });
        }
    }

    async getAutocomplete(req, res) {
        try {
            const q = req.query.q?.trim();
            const suggestions = await recoService.getAutocomplete(q);
            res.status(200).json(suggestions);
        } catch (error) {
            res.status(500).json({ error: 'Server Error' });
        }
    }
}

module.exports = new RecoController();