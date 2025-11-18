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

// 1. 상세 페이지 API
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

// 2. 메인 페이지 API
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
    if (sortBy === 'discount') sortRule = { "price_info.discount_percent": -1 };
    else if (sortBy === 'new') sortRule = { releaseDate: -1 }; 
    else if (sortBy === 'price') sortRule = { "price_info.current_price": 1 }; 

    const totalGames = await Game.countDocuments(filter);
    const games = await Game.find(filter)
      .sort(sortRule)
      .skip(skip)   
      .limit(limit); 
      
    res.status(200).json({
      games: games,
      totalPages: Math.ceil(totalGames / limit)
    });
  } catch (error) {
    res.status(500).json({ error: "서버 오류" });
  }
});

// 3. 검색 자동완성 API
app.get('/api/search/autocomplete', async (req, res) => {
  const query = req.query.q; 
  if (typeof query !== 'string' || !query) return res.json([]);

  function escapeRegex(string) {
    return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  }
  const escapedQuery = escapeRegex(query.trim());

  try {
    const regex = new RegExp(`^${escapedQuery}`, 'i'); 
    const suggestions = await Game.find({ title: regex }).select('title slug').limit(10); 
    res.json(suggestions);
  } catch (error) {
    res.status(500).json({ error: "서버 오류" });
  }
});

// 4. Steam 사용자 라이브러리 조회 API
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
    res.status(500).json({ error: "Steam 프로필 비공개 또는 오류" });
  }
});

// ★ [신규] 5. 찜 목록(비교) 데이터 일괄 조회 API
app.post('/api/wishlist', async (req, res) => {
  const { slugs } = req.body; // 프론트에서 보낸 slug 배열
  if (!slugs || !Array.isArray(slugs)) return res.status(400).json({ error: "잘못된 요청" });

  try {
    const games = await Game.find({ slug: { $in: slugs } });
    res.json(games);
  } catch (error) {
    res.status(500).json({ error: "서버 오류" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 API 서버 실행 중: http://localhost:${PORT}`);
});