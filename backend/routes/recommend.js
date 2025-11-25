const express = require('express');
const router = express.Router();
const axios = require('axios');
const Game = require('../models/Game');
const User = require('../models/User');
const { calculateSimilarity, gameToVector, userToVector } = require('../utils/vector');

const STEAM_API_KEY = process.env.STEAM_API_KEY; // .env에 키가 있어야 함

// 유저 스팀 라이브러리 가져오기 (내부 함수)
async function fetchUserSteamLibrary(steamId) {
    try {
        const response = await axios.get(`http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${steamId}&include_appinfo=true&format=json`);
        return response.data.response.games || [];
    } catch (error) {
        console.error("Steam API Error:", error.message);
        return [];
    }
}

// 개인화 추천 API
router.post('/personal', async (req, res) => {
    const { userId, steamId } = req.body; // 프론트에서 steamId를 보내줘야 함

    try {
        let userVec = {};
        let ownedAppIds = [];

        // 1. 사용자 정보 로드
        if (userId) {
            const user = await User.findById(userId);
            if (user) {
                // 기존 선호 태그로 초기 벡터 생성
                userVec = userToVector(user.likedTags || [], []);
            }
        }

        // 2. 스팀 연동 데이터 처리
        if (steamId) {
            // 스팀 라이브러리 가져오기
            const library = await fetchUserSteamLibrary(steamId);
            
            // 플레이 타임 높은 순으로 정렬 (상위 50개만 분석)
            const topPlayed = library.sort((a, b) => b.playtime_forever - a.playtime_forever).slice(0, 50);
            ownedAppIds = library.map(g => g.appid);

            // 우리 DB에서 해당 게임들의 태그 정보 조회
            const playedGameIds = topPlayed.map(g => g.appid);
            const dbGames = await Game.find({ steam_appid: { $in: playedGameIds } }).select('steam_appid smart_tags');

            // 스팀 게임 데이터에 우리 DB의 태그를 결합
            const analyzedGames = topPlayed.map(steamGame => {
                const match = dbGames.find(dbGame => dbGame.steam_appid === steamGame.appid);
                return {
                    ...steamGame,
                    tags: match ? match.smart_tags : [] // 우리 DB에 있는 게임만 태그 분석 가능
                };
            });

            // 벡터 업데이트 (스팀 기록 반영)
            userVec = userToVector([], analyzedGames);
        }

        // 3. 전체 게임과 유사도 계산
        const allGames = await Game.find({}).select('slug title title_ko smart_tags main_image price_info metacritic_score trend_score steam_appid');
        
        const recommendations = allGames
            .filter(g => !ownedAppIds.includes(g.steam_appid)) // 이미 가진 게임 제외
            .map(game => {
                const gameVec = gameToVector(game.smart_tags);
                const similarity = calculateSimilarity(userVec, gameVec);
                
                // 최종 점수 = 유사도(60%) + 트렌드(20%) + 평점(20%)
                // trend_score가 보통 1000~20000 단위이므로 로그를 취해 정규화
                const trendBonus = Math.log10(game.trend_score + 1) / 10; 
                const score = (similarity * 0.6) + (trendBonus * 0.2) + ((game.metacritic_score / 100) * 0.2);

                return { ...game.toObject(), score };
            })
            .sort((a, b) => b.score - a.score) // 점수 높은 순
            .slice(0, 20); // 상위 20개

        res.json(recommendations);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "추천 시스템 오류 발생" });
    }
});

module.exports = router;