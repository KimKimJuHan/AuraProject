const express = require('express');
const axios = require('axios');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth'); 

const STEAM_WEB_API_KEY = process.env.STEAM_WEB_API_KEY || process.env.STEAM_API_KEY;

// GET /api/user/games
router.get('/games', authenticateToken, async (req, res) => {
    // 1. DB에 저장된 steamId 확인
    const steamId = req.user.steamId; 

    if (!steamId) {
        // 이 에러가 뜬다면 "연동이 저장되지 않은 것"입니다. (User.js 수정 후 재연동 필수)
        console.error(`[Steam Error] User ${req.user.username} has no steamId linked.`);
        return res.status(400).json({ message: "Steam 계정이 연동되지 않았습니다." });
    }

    if (!STEAM_WEB_API_KEY) {
        return res.status(500).json({ message: "서버 설정 오류: Steam API Key 누락" });
    }

    // ★ 가이드에 맞춘 API 엔드포인트 및 파라미터 설정 ★
    const url = `http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/`;

    try {
        const steamRes = await axios.get(url, {
            params: {
                key: STEAM_WEB_API_KEY,
                steamid: steamId,
                format: 'json',
                include_appinfo: true,       // 게임 이름, 아이콘 등 상세 정보
                include_played_free_games: true // 무료 게임(플레이 기록 있는) 포함
            }
        });

        const responseData = steamRes.data?.response;
        
        // 데이터가 없거나 games 배열이 없으면 '비공개 프로필'일 가능성이 높음
        if (!responseData || !responseData.games) {
            console.warn(`[Steam Warning] Private profile detected for ${steamId}`);
            return res.status(403).json({ 
                errorCode: "PRIVATE_PROFILE",
                message: "스팀 프로필이 비공개 상태입니다." 
            });
        }

        const games = responseData.games;
        // console.log(`[Steam Success] Fetched ${games.length} games for ${steamId}`);
        
        return res.json(games);
        
    } catch (error) {
        console.error("Steam Web API Error:", error.message);
        return res.status(500).json({ message: "Steam API 호출 실패" });
    }
});

module.exports = router;