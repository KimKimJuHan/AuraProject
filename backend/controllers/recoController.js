const Game = require('../models/Game');
const User = require('../models/User');
const cache = require('../utils/simpleCache');

exports.getRecommendations = async (req, res) => {
    // (recoRoutes.js에서 처리하므로 이 함수는 사용되지 않으나 구조 유지를 위해 빈 함수로 남겨둠)
    res.json({ success: true, games: [] });
};

// ★ 신규 추가: 유저의 과거 투표 내역 확인 로직 (404 에러 완벽 해결)
exports.getMyVote = async (req, res) => {
    try {
        const gameId = req.params.id;
        
        // 세션에서 유저 정보 확인 (로그인 안 했으면 빈 값 리턴)
        const sessionUser = req.session?.user;
        if (!sessionUser?.id) {
            return res.json({ success: true, userVote: null });
        }

        const userId = sessionUser.id.toString();

        let game = null;
        if (gameId.startsWith('steam-')) {
            const appId = parseInt(gameId.replace('steam-', ''), 10);
            game = await Game.findOne({ steam_appid: appId }).select('votes').lean();
        } else {
            game = await Game.findOne({ slug: gameId }).select('votes').lean();
        }

        if (!game) return res.status(404).json({ success: false, message: "게임을 찾을 수 없습니다." });

        const myVoteData = (game.votes || []).find(v => v.identifier === userId);
        
        return res.json({ 
            success: true, 
            userVote: myVoteData ? myVoteData.type : null 
        });

    } catch (error) {
        console.error("내 투표 확인 에러:", error);
        res.status(500).json({ success: false, message: "서버 오류" });
    }
};

// ★ 신규 추가: 실제 투표 처리 로직 (authenticateToken을 안 타더라도 자체 세션 검증) + 추천 알고리즘 학습 연동
exports.voteGame = async (req, res) => {
    try {
        const gameId = req.params.id;
        const { type } = req.body; 

        const sessionUser = req.session?.user;
        if (!sessionUser?.id) {
            return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
        }

        const userId = sessionUser.id.toString();

        let game = null;
        if (gameId.startsWith('steam-')) {
            const appId = parseInt(gameId.replace('steam-', ''), 10);
            game = await Game.findOne({ steam_appid: appId });
        } else {
            game = await Game.findOne({ slug: gameId });
        }

        if (!game) return res.status(404).json({ success: false, message: "게임을 찾을 수 없습니다." });

        if (!game.votes) game.votes = [];

        const existingVoteIndex = game.votes.findIndex(v => v.identifier === userId);
        let returnVote = null;
        let weightChange = 0;
        let isDisliked = false;
        let isUnDisliked = false;

        if (existingVoteIndex !== -1) {
            const prevVote = game.votes[existingVoteIndex].type;
            if (prevVote === type) {
                // 투표 취소
                game.votes.splice(existingVoteIndex, 1);
                if (type === 'like') game.likes_count = Math.max(0, (game.likes_count || 1) - 1);
                else game.dislikes_count = Math.max(0, (game.dislikes_count || 1) - 1);
                
                weightChange = type === 'like' ? -0.2 : 0.2;
                if (type === 'dislike') isUnDisliked = true;

            } else {
                // 투표 변경
                game.votes[existingVoteIndex].type = type;
                if (type === 'like') {
                    game.likes_count = (game.likes_count || 0) + 1;
                    game.dislikes_count = Math.max(0, (game.dislikes_count || 1) - 1);
                } else {
                    game.dislikes_count = (game.dislikes_count || 0) + 1;
                    game.likes_count = Math.max(0, (game.likes_count || 1) - 1);
                }
                
                weightChange = type === 'like' ? +0.4 : -0.4;
                returnVote = type;
                if (type === 'dislike') isDisliked = true;
                if (prevVote === 'dislike') isUnDisliked = true;
            }
        } else {
            // 신규 투표
            game.votes.push({ identifier: userId, type });
            if (type === 'like') game.likes_count = (game.likes_count || 0) + 1;
            else game.dislikes_count = (game.dislikes_count || 0) + 1;

            weightChange = type === 'like' ? +0.2 : -0.2;
            returnVote = type;
            if (type === 'dislike') isDisliked = true;
        }

        await game.save();

        // [핵심] 유저 tagWeights 업데이트 및 dislikedGames 목록 관리
        if (weightChange !== 0 || isDisliked || isUnDisliked) {
            const user = await User.findById(userId);
            if (user) {
                // 1. 태그별 가중치 업데이트
                if (game.smart_tags && game.smart_tags.length > 0) {
                    const weights = user.tagWeights ? Object.fromEntries(user.tagWeights) : {};
                    for (const tag of game.smart_tags) {
                        weights[tag] = Math.max(Math.min((weights[tag] || 0) + weightChange, 2.0), -1.0);
                    }
                    user.tagWeights = weights;
                }

                // 2. 싫어요를 누르면 dislikedGames에 추가 (추천 리스트에서 아예 안 보이게 하기 위함)
                if (isDisliked) {
                    if (!user.dislikedGames) user.dislikedGames = [];
                    if (!user.dislikedGames.includes(game.slug)) {
                        user.dislikedGames.push(game.slug);
                    }
                }
                
                // 3. 싫어요 취소/변경 시 dislikedGames에서 제거
                if (isUnDisliked && user.dislikedGames) {
                    user.dislikedGames = user.dislikedGames.filter(slug => slug !== game.slug);
                }

                await user.save();
                cache.deleteByPrefix(`reco:${userId}`); // 추천 캐시 즉시 무효화 (실시간 반영)
            }
        }

        return res.json({ success: true, likes: game.likes_count, dislikes: game.dislikes_count, userVote: returnVote });

    } catch (error) {
        console.error("투표 처리 에러:", error);
        res.status(500).json({ success: false, message: "서버 오류" });
    }
};