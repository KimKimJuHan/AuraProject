// backend/routes/user.js

const express = require('express');
const axios = require('axios');
const router = express.Router();

// 위에서 수정한 auth.js를 불러옵니다.
// { } 중괄호를 사용하여 구조 분해 할당으로 가져옵니다.
const { authenticateToken } = require('../middleware/auth'); 

const STEAM_WEB_API_KEY = process.env.STEAM_WEB_API_KEY || process.env.STEAM_API_KEY;

/**
 * 사용자 소유 게임 목록을 Steam Web API에서 가져오는 엔드포인트
 * GET /api/user/games
 */
router.get('/games', authenticateToken, async (req, res) => {
    // req.user는 authenticateToken 미들웨어에서 넣어준 값입니다.
    const steamId = req.user.steamId; 

    if (!steamId) {
        return res.status(400).json({ message: "Steam 계정이 연동되지 않았습니다." });
    }

    if (!STEAM_WEB_API_KEY) {
        console.error("Steam API Key Missing");
        return res.status(500).json({ message: "서버 설정 오류: Steam API Key 누락" });
    }

    // Steam API URL
    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/`;

    try {
        // Steam Web API 호출
        const steamRes = await axios.get(url, {
            params: {
                key: STEAM_WEB_API_KEY,
                steamid: steamId,
                include_appinfo: true,
                include_played_free_games: true,
                format: 'json'
            }
        });

        const games = steamRes.data?.response?.games || [];
        
        // 게임 목록 반환
        return res.json(games);
        
    } catch (error) {
        const statusCode = error.response?.status || 500;
        console.error("Steam Web API Error:", error.message);
        
        // 에러 발생 시 클라이언트에 메시지 전달
        return res.status(statusCode).json({ 
            message: "Steam API 호출 실패. Steam 프로필 공개 설정과 연동 상태를 확인해주세요." 
        });
    }
});

module.exports = router;