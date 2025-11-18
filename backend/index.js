require('dotenv').config(); 
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('./models/Game'); 

const app = express();
const PORT = 8000;
app.use(cors());
app.use(express.json());
// ★ [신규] 클라이언트 IP 가져오기 위한 설정
app.set('trust proxy', true);

const dbUri = process.env.MONGODB_URI;
if (!dbUri) {
  console.error("❌ 오류: MONGODB_URI 환경 변수 없음");
  process.exit(1); 
}

mongoose.connect(dbUri)
  .then(() => console.log("✅ 몽고DB (Atlas) 연결 성공"))
  .catch(err => console.error("❌ 몽고DB 연결 실패:", err));

// 1. 상세 페이지 API
app.get('/api/games/:id', async (req, res) => {
  try {
    const gameInfo = await Game.findOne({ slug: req.params.id });
    if (!gameInfo) return res.status(404).json({ error: "게임 없음" });
    res.status(200).json(gameInfo);
  } catch (error) {
    res.status(500).json({ error: "서버 오류" });
  }
});

// 2. 메인 페이지 API
app.post('/api/recommend', async (req, res) => {
  const { tags, sortBy, page = 1 } = req.body; 
  const limit = 15; 
  const skip = (page - 1) * limit; 

  try {
    let filter = {};
    if (tags && tags.length > 0) filter.smart_tags = { $all: tags };
    
    let sortRule = { popularity: -1 }; 
    if (sortBy === 'discount') {
        sortRule = { "price_info.discount_percent": -1 };
        filter["price_info.discount_percent"] = { $gt: 0 };
        filter["price_info.current_price"] = { $ne: null };
    } else if (sortBy === 'new') {
        sortRule = { releaseDate: -1 };
        filter["releaseDate"] = { $ne: null };
    } else if (sortBy === 'price') {
        sortRule = { "price_info.current_price": 1 };
        filter["price_info.current_price"] = { $ne: null };
    }

    const totalGames = await Game.countDocuments(filter);
    const games = await Game.find(filter).sort(sortRule).skip(skip).limit(limit);
      
    res.status(200).json({ games, totalPages: Math.ceil(totalGames / limit) });
  } catch (error) {
    res.status(500).json({ error: "서버 오류" });
  }
});

// 3. 검색 자동완성
app.get('/api/search/autocomplete', async (req, res) => {
  const query = req.query.q; 
  if (typeof query !== 'string' || !query) return res.json([]);
  
  const cleanQuery = query.trim().replace(/\s+/g, '').replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

  try {
    const regex = new RegExp(cleanQuery.split('').join('.*'), 'i'); 
    const suggestions = await Game.find({ title: regex }).select('title slug').limit(10); 
    res.json(suggestions);
  } catch (error) {
    res.status(500).json({ error: "서버 오류" });
  }
});

// 4. Steam 사용자 라이브러리
app.get('/api/user/library/:steamId', async (req, res) => {
  const { steamId } = req.params;
  const apiKey = process.env.STEAM_API_KEY; 
  if (!apiKey) return res.status(500).json({ error: "Steam API Key 없음" });

  try {
    const response = await axios.get(
      `http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${apiKey}&steamid=${steamId}&include_appinfo=true&format=json`
    );
    const games = response.data.response.games || [];
    const formattedGames = games.map(game => ({
      appid: game.appid,
      name: game.name,
      playtime_forever: Math.round(game.playtime_forever / 60), 
      img_icon_url: `http://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`
    }));
    formattedGames.sort((a, b) => b.playtime_forever - a.playtime_forever);
    res.json(formattedGames);
  } catch (error) {
    res.status(500).json({ error: "Steam 프로필 오류" });
  }
});

// 5. 찜 목록 조회
app.post('/api/wishlist', async (req, res) => {
  const { slugs } = req.body; 
  if (!slugs || !Array.isArray(slugs)) return res.status(400).json({ error: "잘못된 요청" });
  try {
    const games = await Game.find({ slug: { $in: slugs } });
    res.json(games);
  } catch (error) {
    res.status(500).json({ error: "서버 오류" });
  }
});

// ★ [신규] 6. 투표(좋아요/싫어요) API (IP 체크 및 중복 방지)
app.post('/api/games/:id/vote', async (req, res) => {
    const { id } = req.params; // game slug
    const { type } = req.body; // 'like' or 'dislike'
    // IP 가져오기 (x-forwarded-for는 프록시/로드밸런서 거칠 때 대비)
    const userIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    
    // TODO: 나중에 로그인 기능 추가 시, userIp 대신 userId를 사용하고 weight를 높이면 됨
    const weight = 1; 

    try {
        const game = await Game.findOne({ slug: id });
        if (!game) return res.status(404).json({ error: "게임 없음" });

        // 이미 투표했는지 확인
        const existingVoteIndex = game.votes.findIndex(v => v.identifier === userIp);

        if (existingVoteIndex !== -1) {
            // 이미 투표했다면? -> 투표 취소 또는 변경 로직
            // 여기서는 간단하게 "기존 투표 제거 후 새 투표" (혹은 토글)
            const existingVote = game.votes[existingVoteIndex];
            
            // 같은 타입(좋아요->좋아요)이면 취소(삭제)
            if (existingVote.type === type) {
                game.votes.splice(existingVoteIndex, 1);
                if(type === 'like') game.likes_count = Math.max(0, game.likes_count - weight);
                else game.dislikes_count = Math.max(0, game.dislikes_count - weight);
                await game.save();
                return res.json({ message: "투표 취소됨", likes: game.likes_count, dislikes: game.dislikes_count, userVote: null });
            } 
            // 다른 타입(좋아요->싫어요)이면 변경
            else {
                game.votes.splice(existingVoteIndex, 1); // 기존꺼 삭제
                if(type === 'like') {
                    game.likes_count += weight;
                    game.dislikes_count = Math.max(0, game.dislikes_count - weight);
                } else {
                    game.dislikes_count += weight;
                    game.likes_count = Math.max(0, game.likes_count - weight);
                }
                // 새 투표 추가
                game.votes.push({ identifier: userIp, type, weight });
                await game.save();
                return res.json({ message: "투표 변경됨", likes: game.likes_count, dislikes: game.dislikes_count, userVote: type });
            }
        }

        // 새로운 투표
        game.votes.push({ identifier: userIp, type, weight });
        if(type === 'like') game.likes_count += weight;
        else game.dislikes_count += weight;

        await game.save();
        res.json({ message: "투표 성공", likes: game.likes_count, dislikes: game.dislikes_count, userVote: type });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "투표 처리 중 오류" });
    }
});

app.listen(PORT, () => {
  console.log(`🚀 API 서버 실행 중: http://localhost:${PORT}`);
});