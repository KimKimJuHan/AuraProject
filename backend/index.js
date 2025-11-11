// /backend/index.js

require('dotenv').config(); 
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const Game = require('./models/Game'); 

const app = express();
const PORT = 8000;
app.use(cors());
app.use(express.json());

const dbUri = process.env.MONGODB_URI;
if (!dbUri) {
  console.error("❌ 오류: MONGODB_URI 환경 변수가 .env 파일에 설정되지 않았습니다.");
  process.exit(1); 
}

mongoose.connect(dbUri)
  .then(() => console.log("✅ 몽고DB (Atlas) 연결 성공"))
  .catch(err => console.error("❌ 몽고DB (Atlas) 연결 실패:", err));

// --- '상세 페이지' API 로직 ( '스냅샷' 방식) ---
app.get('/api/games/:id', async (req, res) => {
  const itad_id = req.params.id; 
  try {
    const gameInfo = await Game.findOne({ slug: itad_id });
    if (!gameInfo) {
      return res.status(404).json({ error: "게임을 DB에서 찾을 수 없습니다." });
    }
    res.status(200).json(gameInfo);
  } catch (error) {
    res.status(500).json({ error: "서버 내부 오류" });
  }
});

// --- '메인 페이지' API 로직 ( '스냅샷' + 페이지네이션) ---
app.post('/api/recommend', async (req, res) => {
  const { tags, sortBy, page = 1 } = req.body; 
  // ★ [수정] 페이지당 15개씩 불러오도록 수정
  const limit = 15; 
  const skip = (page - 1) * limit; 

  try {
    let filter = {};
    if (tags && tags.length > 0) {
      filter.smart_tags = { $all: tags };
    }
    
    let sortRule = { popularity: -1 }; // 기본값: 인기순
    if (sortBy === 'discount') {
      sortRule = { "price_info.discount_percent": -1 };
    } else if (sortBy === 'new') {
      sortRule = { releaseDate: -1 }; 
    } else if (sortBy === 'price') {
      sortRule = { "price_info.current_price": 1 }; 
    }

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
    console.error('[추천 API 에러]:', error.message);
    res.status(500).json({ error: "서버 내부 오류" });
  }
});

// ★ '검색 자동완성' API (보안 강화)
app.get('/api/search/autocomplete', async (req, res) => {
  const query = req.query.q; 

  if (typeof query !== 'string' || !query) {
    return res.json([]);
  }

  // (보안) 정규식 특수문자 이스케이프
  function escapeRegex(string) {
    return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  }
  const escapedQuery = escapeRegex(query.trim());

  try {
    const regex = new RegExp(`^${escapedQuery}`, 'i'); 
    
    const suggestions = await Game.find({ title: regex })
                                  .select('title slug') 
                                  .limit(10); 
    
    res.json(suggestions);

  } catch (error) {
    res.status(500).json({ error: "서버 내부 오류" });
  }
});

// --- 서버 실행 ---
app.listen(PORT, () => {
  console.log(`🚀 (스냅샷) API 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});