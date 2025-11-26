const express = require('express');
const router = express.Router();
const axios = require('axios');
const Game = require('../models/Game');
const User = require('../models/User');
const { calculateSimilarity, gameToVector, userToVector } = require('../utils/vector');

// 스팀 API 키는 환경변수에서 가져옵니다
const STEAM_API_KEY = process.env.STEAM_API_KEY;

// [내부 함수] 유저 스팀 라이브러리 가져오기
async function fetchUserSteamLibrary(steamId) {
    if (!STEAM_API_KEY) {
        console.error("STEAM_API_KEY가 없습니다.");
        return [];
    }
    try {
        const response = await axios.get(`http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${steamId}&include_appinfo=true&format=json`);
        return response.data.response.games || [];
    } catch (error) {
        console.error("Steam API Error:", error.message);
        return [];
    }
}

// [API] 개인화 추천
router.post('/personal', async (req, res) => {
    const { userId, tags, steamId } = req.body; 

    try {
        let userVec = {};
        let ownedAppIds = [];

        // 1. 사용자 정보 로드 (로그인 시)
        if (userId) {
            const user = await User.findById(userId);
            if (user) {
                // 기존 선호 태그와 현재 선택한 태그 합치기
                const combinedTags = [...(user.likedTags || []), ...(tags || [])];
                // 사용자가 직접 고른 태그에 가중치를 부여하여 벡터 생성
                userVec = userToVector(combinedTags, []);
            }
        } else if (tags && tags.length > 0) {
             // 비로그인 상태에서도 태그 선택만으로 추천 가능
             userVec = userToVector(tags, []);
        }

        // 2. 스팀 연동 데이터 처리
        // 프론트엔드에서 steamId가 'LINKED'라는 문자열로 올 경우, 실제 ID를 DB에서 찾아야 함
        // (현재 User 모델에 steamId 필드가 없으므로, 이 부분은 추후 User 모델 업데이트가 필요할 수 있습니다.)
        // 여기서는 요청 body에 실제 숫자 ID가 들어오거나, User DB에 저장된 것으로 가정합니다.
        
        let realSteamId = steamId;
        
        // 로그인 유저라면 DB에서 스팀 ID 확인 시도
        if (userId && (!realSteamId || realSteamId === 'LINKED')) {
             const user = await User.findById(userId);
             // User 스키마에 steamId 필드가 있다면 사용
             if (user.steamId) realSteamId = user.steamId; 
        }

        // 실제 스팀 ID가 확보되었다면 라이브러리 분석 시작
        if (realSteamId && realSteamId !== 'LINKED') {
            // 스팀 라이브러리 가져오기
            const library = await fetchUserSteamLibrary(realSteamId);
            
            // 플레이 타임 높은 순으로 정렬 (상위 50개만 분석하여 속도 향상)
            const topPlayed = library.sort((a, b) => b.playtime_forever - a.playtime_forever).slice(0, 50);
            ownedAppIds = library.map(g => g.appid);

            // 우리 DB에 있는 게임들의 태그 정보 조회 (스팀 API는 태그를 안 줌)
            const playedGameIds = topPlayed.map(g => g.appid);
            const dbGames = await Game.find({ steam_appid: { $in: playedGameIds } }).select('steam_appid smart_tags');

            // 스팀 게임 데이터에 우리 DB의 태그(smart_tags)를 결합
            const analyzedGames = topPlayed.map(steamGame => {
                const match = dbGames.find(dbGame => dbGame.steam_appid === steamGame.appid);
                return {
                    ...steamGame,
                    tags: match ? match.smart_tags : [] // 우리 DB의 표준 태그 사용
                };
            });

            // 벡터 업데이트 (스팀 기록 반영)
            const steamVec = userToVector([], analyzedGames);
            
            // 기존 태그 벡터(userVec)에 스팀 플레이 기반 벡터(steamVec)를 더함
            for (const [tag, score] of Object.entries(steamVec)) {
                userVec[tag] = (userVec[tag] || 0) + score;
            }
        }

        // 3. 전체 게임과 유사도 계산
        // 필요한 필드만 조회하여 성능 최적화
        const allGames = await Game.find({}).select('slug title title_ko smart_tags main_image price_info metacritic_score trend_score steam_appid');
        
        let recommendations = allGames
            .filter(g => !ownedAppIds.includes(g.steam_appid)) // 이미 가진 게임 제외
            .map(game => {
                const gameVec = gameToVector(game.smart_tags);
                
                // 코사인 유사도 계산 (태그 일치도)
                const similarity = calculateSimilarity(userVec, gameVec);
                
                // 트렌드 점수 정규화 (로그 스케일 적용)
                const trendVal = game.trend_score || 0;
                const trendBonus = Math.log10(trendVal + 1) / 10; 
                
                // 메타크리틱 점수 정규화 (0~1)
                const metaScore = game.metacritic_score || 0;
                
                // 최종 점수 산출 공식
                // 유사도(60%) + 트렌드(20%) + 평점(20%)
                const score = (similarity * 0.6) + (trendBonus * 0.2) + ((metaScore / 100) * 0.2);

                return { 
                    ...game.toObject(), 
                    score, 
                    trend_score: trendVal 
                };
            })
            .sort((a, b) => b.score - a.score) // 점수 높은 순 정렬
            .slice(0, 20); // 상위 20개 추천

        // 프론트엔드 포맷({ games: [...] })에 맞춰 응답
        res.json({ games: recommendations });

    } catch (err) {
        console.error("추천 시스템 오류:", err);
        res.status(500).json({ error: "추천 시스템 오류 발생" });
    }
});

module.exports = router;