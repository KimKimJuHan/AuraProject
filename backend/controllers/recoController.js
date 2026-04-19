const Game = require('../models/Game');

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

// ★ 신규 추가: 실제 투표 처리 로직 (authenticateToken을 안 타더라도 자체 세션 검증)
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

        if (existingVoteIndex !== -1) {
            const prevVote = game.votes[existingVoteIndex].type;
            if (prevVote === type) {
                game.votes.splice(existingVoteIndex, 1);
                if (type === 'like') game.likes_count = Math.max(0, (game.likes_count || 1) - 1);
                else game.dislikes_count = Math.max(0, (game.dislikes_count || 1) - 1);
                
                await game.save();
                return res.json({ success: true, likes: game.likes_count, dislikes: game.dislikes_count, userVote: null });
            } else {
                game.votes[existingVoteIndex].type = type;
                if (type === 'like') {
                    game.likes_count = (game.likes_count || 0) + 1;
                    game.dislikes_count = Math.max(0, (game.dislikes_count || 1) - 1);
                } else {
                    game.dislikes_count = (game.dislikes_count || 0) + 1;
                    game.likes_count = Math.max(0, (game.likes_count || 1) - 1);
                }
                
                await game.save();
                return res.json({ success: true, likes: game.likes_count, dislikes: game.dislikes_count, userVote: type });
            }
        } else {
            game.votes.push({ identifier: userId, type });
            if (type === 'like') game.likes_count = (game.likes_count || 0) + 1;
            else game.dislikes_count = (game.dislikes_count || 0) + 1;

            await game.save();
            return res.json({ success: true, likes: game.likes_count, dislikes: game.dislikes_count, userVote: type });
        }

    } catch (error) {
        console.error("투표 처리 에러:", error);
        res.status(500).json({ success: false, message: "서버 오류" });
    }
};