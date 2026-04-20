const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const passport = require('passport');
const axios = require('axios');
const User = require('../models/User');

const { generateAccessToken, generateRefreshToken } = require('../utils/tokens'); // 토큰 유틸리티 경로에 맞게 수정 필요
const authController = require('../controllers/authController');

// ★ 추가: 스팀 게임 데이터를 바탕으로 유저 등급을 계산하는 순수 함수
function calculatePlayerType(games) {
    if (!games || games.length === 0) return 'beginner';

    const totalGames = games.length;
    let totalPlaytime = 0;
    let maxSinglePlaytime = 0;

    games.forEach(game => {
        const pt = game.playtime_forever || 0;
        totalPlaytime += pt;
        if (pt > maxSinglePlaytime) {
            maxSinglePlaytime = pt;
        }
    });

    // 기준 1: 스트리머 (하드코어) - 게임 500개 이상 OR 단일 게임 5000시간(300,000분) 이상
    if (totalGames >= 500 || maxSinglePlaytime >= 300000) {
        return 'streamer';
    }
    
    // 기준 2: 중급자 - 총 플레이타임 300시간(18,000분) 이상 OR 게임 50개 이상
    if (totalPlaytime >= 18000 || totalGames >= 50) {
        return 'intermediate';
    }

    // 기준 3: 초심자 - 그 외
    return 'beginner';
}

// ---------------------------------------------------------
// 기존 이메일/비밀번호 로그인, 회원가입 라우터들 (authController 위임)
// ---------------------------------------------------------
router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/status', authController.checkStatus);
router.post('/refresh', authController.refreshToken);

// ---------------------------------------------------------
// 스팀(Steam) 연동 라우터
// ---------------------------------------------------------

// 1. 스팀 로그인 페이지로 리다이렉트
router.get('/steam', passport.authenticate('steam', { failureRedirect: '/' }));

// 2. 스팀 로그인 완료 후 콜백 (여기서 playerType 계산이 일어납니다)
router.get('/steam/return', passport.authenticate('steam', { session: false, failureRedirect: '/' }), async (req, res) => {
    try {
        const steamId = req.user.id; // Passport에서 넘어온 스팀 ID
        const steamDisplayName = req.user.displayName;
        
        // 현재 로그인된 유저 확인 (JWT 토큰 등 쿠키/헤더 확인 로직 필요)
        // JWT 검증 미들웨어를 통과했다고 가정하거나, 클라이언트에서 보낸 토큰을 검증해야 함
        const token = req.cookies.accessToken; // 쿠키 기반일 경우
        
        if (!token) {
            // 미로그인 상태에서 스팀 로그인만 시도한 경우 (신규 가입 또는 스팀 전용 로그인)
            // 임시로 스팀 ID 기반 유저 생성 또는 기존 유저 로드
            return res.redirect(`${process.env.CLIENT_URL}/login?error=need_login_first`);
        }

        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        const userId = decoded.id; // 몽고DB _id

        // 스팀 Web API를 통해 유저의 보유 게임 및 플레이타임 목록을 가져옵니다.
        const STEAM_API_KEY = process.env.STEAM_API_KEY;
        const gamesResponse = await axios.get(`http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${steamId}&format=json&include_appinfo=1`);
        
        let steamGames = [];
        if (gamesResponse.data.response && gamesResponse.data.response.games) {
            steamGames = gamesResponse.data.response.games.map(game => ({
                appid: game.appid,
                name: game.name,
                playtime_forever: game.playtime_forever,
                img_icon_url: game.img_icon_url,
                smart_tags: [] // 태그는 나중에 게임 메타데이터 DB와 조인해서 채울 수 있음
            }));
        }

        // ★ 핵심: 가져온 스팀 게임 데이터를 바탕으로 playerType 계산
        const calculatedType = calculatePlayerType(steamGames);

        // DB 유저 정보 업데이트
        await User.findByIdAndUpdate(userId, {
            steamId: steamId,
            steamGames: steamGames,
            playerType: calculatedType // 계산된 등급 저장
        });

        console.log(`✅ 스팀 연동 완료: 유저 ${userId} / 등급: ${calculatedType}`);

        // 프론트엔드 마이페이지로 리다이렉트
        res.redirect(`${process.env.CLIENT_URL}/mypage?steam_sync=success`);

    } catch (error) {
        console.error('스팀 연동 에러:', error);
        res.redirect(`${process.env.CLIENT_URL}/mypage?steam_sync=fail`);
    }
});

module.exports = router;