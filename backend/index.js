require('dotenv').config(); 
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

// 모델
const Game = require('./models/Game'); 
// 라우터
const authRoutes = require('./routes/auth');
const recommendRoutes = require('./routes/recommend');

const app = express();
const PORT = 8000;

app.use(cors({ origin: 'http://localhost:3000', credentials: true })); 
app.use(express.json());
app.set('trust proxy', true);

const dbUri = process.env.MONGODB_URI;
if (!dbUri) {
  console.error("❌ 오류: MONGODB_URI 환경 변수 없음");
  process.exit(1); 
}

mongoose.connect(dbUri)
  .then((conn) => console.log(`✅ 몽고DB 연결 성공: ${conn.connection.name}`))
  .catch(err => console.error("❌ 몽고DB 연결 실패:", err));

app.use('/api/auth', authRoutes);
app.use('/api/ai-recommend', recommendRoutes);

// 1. 상세 페이지 API
app.get('/api/games/:id', async (req, res) => {
  try {
    // .lean()을 붙여서 순수 JSON 객체로 반환
    const gameInfo = await Game.findOne({ slug: req.params.id }).lean();
    if (!gameInfo) return res.status(404).json({ error: "게임을 찾을 수 없습니다." });
    res.status(200).json(gameInfo);
  } catch (error) {
    res.status(500).json({ error: "서버 내부 오류" });
  }
});

// 2. 메인/검색 페이지 API (★ 핵심 수정)
app.post('/api/recommend', async (req, res) => {
  const { tags, sortBy, page = 1, searchQuery } = req.body; 
  const limit = 15; 
  const skip = (page - 1) * limit; 
  
  console.log(`🔍 [API 요청] Page:${page} | Query:"${searchQuery||''}" | Tags:${tags?.length||0}`);

  try {
    let filter = {};
    
    // 태그 필터
    if (tags && tags.length > 0) {
      filter.smart_tags = { $in: tags }; 
    }
    
    // 검색어 필터
    if (searchQuery && searchQuery.trim() !== "") {
        const query = searchQuery.trim();
        const escapedQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        filter.$or = [
            { title: { $regex: escapedQuery, $options: 'i' } },
            { title_ko: { $regex: escapedQuery, $options: 'i' } }
        ];
    }

    // 정렬 로직
    let sortRule = { popularity: -1, _id: -1 }; 
    if (sortBy === 'discount') {
        sortRule = { "price_info.discount_percent": -1, popularity: -1 };
        filter["price_info.discount_percent"] = { $gt: 0 };
    } else if (sortBy === 'new') {
        sortRule = { releaseDate: -1 }; 
    } else if (sortBy === 'price') {
        sortRule = { "price_info.current_price": 1 }; 
        filter["price_info.current_price"] = { $gte: 0 };
    }

    // ★ 1차 시도 (.lean() 추가)
    const totalGames = await Game.countDocuments(filter);
    let games = await Game.find(filter)
      .sort(sortRule)
      .skip(skip)   
      .limit(limit)
      .lean(); // Mongoose 객체를 일반 객체로 변환 (전송 문제 해결)
      
    console.log(`👉 결과: ${totalGames}개 중 ${games.length}개 반환`);

    // ★ [안전장치] 검색결과 0개이고 초기화면이면 인기 게임 강제 로딩
    if (totalGames === 0 && !searchQuery && (!tags || tags.length === 0)) {
        console.log("⚠️ 초기 데이터 없음 -> 인기 게임 강제 로딩");
        games = await Game.find({})
            .sort({ popularity: -1 })
            .limit(limit)
            .lean();
    }
    
    res.status(200).json({
      games: games, // 이제 무조건 데이터가 들어갑니다
      totalPages: Math.ceil(totalGames / limit) || 1
    });

  } catch (error) {
    console.error("❌ API 에러:", error);
    res.status(500).json({ error: "데이터 로딩 중 오류 발생" });
  }
});

// (나머지 API 생략 없이 전체 포함)
app.get('/api/search/autocomplete', async (req, res) => {
  const query = req.query.q; 
  if (!query) return res.json([]);
  const escapedQuery = query.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  try {
    const suggestions = await Game.find({
        $or: [ { title: { $regex: escapedQuery, $options: 'i' } }, { title_ko: { $regex: escapedQuery, $options: 'i' } } ]
    }).select('title title_ko slug').limit(10).lean(); 
    res.json(suggestions);
  } catch (error) { res.status(500).json({ error: "검색 오류" }); }
});

app.get('/api/user/library/:steamId', async (req, res) => {
  const apiKey = process.env.STEAM_API_KEY; 
  try {
    const response = await axios.get(`http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${apiKey}&steamid=${req.params.steamId}&include_appinfo=true&format=json`);
    res.json(response.data.response.games || []);
  } catch (error) { res.status(500).json({ error: "Steam Error" }); }
});

app.post('/api/wishlist', async (req, res) => {
  try {
    const games = await Game.find({ slug: { $in: req.body.slugs } }).lean();
    res.json(games);
  } catch (error) { res.status(500).json({ error: "DB Error" }); }
});

app.get('/api/user/ip', (req, res) => {
    const userIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    res.json({ ip: userIp });
});

app.post('/api/games/:id/vote', async (req, res) => {
    const userIp = req.headers['x-forwarded-for']?.split(',').shift().trim() || req.connection.remoteAddress;
    const { type } = req.body;
    try {
        const game = await Game.findOne({ slug: req.params.id });
        if (!game) return res.status(404).json({ error: "Game not found" });
        const existingVoteIndex = game.votes.findIndex(v => v.identifier === userIp);
        if (existingVoteIndex !== -1) {
            const existingVote = game.votes[existingVoteIndex];
            game.votes.splice(existingVoteIndex, 1); 
            if(existingVote.type === type) {
                if(type === 'like') game.likes_count = Math.max(0, game.likes_count - 1);
                else game.dislikes_count = Math.max(0, game.dislikes_count - 1);
                await game.save();
                return res.json({ message: "Canceled", likes: game.likes_count, dislikes: game.dislikes_count, userVote: null });
            }
            if(existingVote.type === 'like') game.likes_count = Math.max(0, game.likes_count - 1);
            else game.dislikes_count = Math.max(0, game.dislikes_count - 1);
        }
        game.votes.push({ identifier: userIp, type, weight: 1 });
        if(type === 'like') game.likes_count++; else game.dislikes_count++;
        await game.save();
        res.json({ message: "Voted", likes: game.likes_count, dislikes: game.dislikes_count, userVote: type });
    } catch (error) { res.status(500).json({ error: "Vote Error" }); }
});

app.listen(PORT, () => {
  console.log(`🚀 API Server Running on port ${PORT}`);
});