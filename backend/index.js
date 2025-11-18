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

const dbUri = process.env.MONGODB_URI;
if (!dbUri) {
  console.error("❌ 오류: MONGODB_URI 환경 변수 없음");
  process.exit(1); 
}

mongoose.connect(dbUri)
  .then(() => console.log("✅ 몽고DB (Atlas) 연결 성공"))
  .catch(err => console.error("❌ 몽고DB 연결 실패:", err));

app.get('/api/games/:id', async (req, res) => {
  const itad_id = req.params.id; 
  try {
    const gameInfo = await Game.findOne({ slug: itad_id });
    if (!gameInfo) return res.status(404).json({ error: "게임 없음" });
    res.status(200).json(gameInfo);
  } catch (error) {
    res.status(500).json({ error: "서버 오류" });
  }
});

// 메인 페이지 추천 API (필터링 강화)
app.post('/api/recommend', async (req, res) => {
  const { tags, sortBy, page = 1 } = req.body; 
  const limit = 15; 
  const skip = (page - 1) * limit; 

  try {
    let filter = {};
    if (tags && tags.length > 0) {
      filter.smart_tags = { $all: tags };
    }
    
    let sortRule = { popularity: -1 }; 
    if (sortBy === 'discount') {
        sortRule = { "price_info.discount_percent": -1 };
        filter["price_info.discount_percent"] = { $gt: 0 };
        filter["price_info.current_price"] = { $ne: null };
    }
    else if (sortBy === 'new') {
        sortRule = { releaseDate: -1 };
        filter["releaseDate"] = { $ne: null };
    }
    else if (sortBy === 'price') {
        sortRule = { "price_info.current_price": 1 };
        filter["price_info.current_price"] = { $ne: null };
    }

    // ★ [추가] 검색 페이지에서 태그+검색어 동시에 필터링 할 경우를 대비
    // (현재는 프론트엔드에서 2차 필터링하지만, 백엔드에서 하면 더 좋음)
    
    const totalGames = await Game.countDocuments(filter);
    const games = await Game.find(filter).sort(sortRule).skip(skip).limit(limit);
    res.status(200).json({ games, totalPages: Math.ceil(totalGames / limit) });
  } catch (error) {
    res.status(500).json({ error: "서버 오류" });
  }
});

// ★ [수정] 검색 자동완성 API (한글/영어 동시 검색 + 부분 일치 강화)
app.get('/api/search/autocomplete', async (req, res) => {
  const query = req.query.q; 
  if (typeof query !== 'string' || !query) return res.json([]);

  // 특수문자 이스케이프
  function escapeRegex(string) {
    return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  }
  
  // 공백 제거 후 한 글자씩 쪼개서 정규식 생성 (p o t a l -> p.*o.*t.*a.*l)
  // 이렇게 하면 "potal"로 "Portal"을 찾을 확률이 높아짐 (오타 보정 효과)
  // 하지만 너무 느슨하면 엉뚱한 게 나오므로, 이번엔 '공백 무시' 정도만 적용
  
  const cleanQuery = escapeRegex(query.trim()); 
  
  try {
    // 1. 영어 제목 검색 (중간 포함)
    // 2. 한글 제목 검색 (중간 포함)
    // "soul" -> "Dark Souls" (O)
    // "포탈" -> "Portal 2" (O - title_ko에 '포탈 2'로 저장되어 있다면)
    
    const regex = new RegExp(cleanQuery, 'i'); 
    
    const suggestions = await Game.find({
        $or: [
            { title: { $regex: regex } },    // 영어 제목
            { title_ko: { $regex: regex } }  // 한글 제목
        ]
    })
    .select('title title_ko slug')
    .limit(10); 
    
    res.json(suggestions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "서버 오류" });
  }
});

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

// 투표 API
app.post('/api/games/:id/vote', async (req, res) => {
    const { id } = req.params; 
    const { type } = req.body; 
    const userIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const weight = 1; 

    try {
        const game = await Game.findOne({ slug: id });
        if (!game) return res.status(404).json({ error: "게임 없음" });

        const existingVoteIndex = game.votes.findIndex(v => v.identifier === userIp);

        if (existingVoteIndex !== -1) {
            const existingVote = game.votes[existingVoteIndex];
            if (existingVote.type === type) {
                game.votes.splice(existingVoteIndex, 1);
                if(type === 'like') game.likes_count = Math.max(0, game.likes_count - weight);
                else game.dislikes_count = Math.max(0, game.dislikes_count - weight);
                await game.save();
                return res.json({ message: "투표 취소됨", likes: game.likes_count, dislikes: game.dislikes_count, userVote: null });
            } else {
                game.votes.splice(existingVoteIndex, 1); 
                if(type === 'like') {
                    game.likes_count += weight;
                    game.dislikes_count = Math.max(0, game.dislikes_count - weight);
                } else {
                    game.dislikes_count += weight;
                    game.likes_count = Math.max(0, game.likes_count - weight);
                }
                game.votes.push({ identifier: userIp, type, weight });
                await game.save();
                return res.json({ message: "투표 변경됨", likes: game.likes_count, dislikes: game.dislikes_count, userVote: type });
            }
        }
        game.votes.push({ identifier: userIp, type, weight });
        if(type === 'like') game.likes_count += weight;
        else game.dislikes_count += weight;
        await game.save();
        res.json({ message: "투표 성공", likes: game.likes_count, dislikes: game.dislikes_count, userVote: type });
    } catch (error) {
        res.status(500).json({ error: "투표 처리 중 오류" });
    }
});

app.listen(PORT, () => {
  console.log(`🚀 API 서버 실행 중: http://localhost:${PORT}`);
});