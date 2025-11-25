// backend/index.js

require('dotenv').config(); 
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const SteamStrategy = require('passport-steam').Strategy;
const jwt = require('jsonwebtoken'); // JWT 토큰 생성을 위해 필요

// 모델 로드
const User = require('./models/User'); // ★ User 모델 로드 추가
const Game = require('./models/Game'); 

// 라우터 로드
const authRoutes = require('./routes/auth');
const recommendRoutes = require('./routes/recommend');
const userRoutes = require('./routes/user'); // ★ 유저 라우터 추가

const app = express();
const PORT = 8000;

// 환경 변수 설정
const STEAM_WEB_API_KEY = process.env.STEAM_WEB_API_KEY || process.env.STEAM_API_KEY; // 환경 변수 이름 통일
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

// CORS 설정 (프론트엔드와 통신 허용)
app.use(cors({ origin: FRONTEND_URL, credentials: true })); 
app.use(express.json());
app.set('trust proxy', true);

// 세션 설정 (스팀 로그인용)
app.use(session({
    secret: 'your_secret_key',
    resave: true,
    saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

// 스팀 전략 등록 및 DB 연동
try {
    passport.use(new SteamStrategy({
        // ★ returnURL과 realm을 환경 변수 기반으로 설정하여 배포 환경에 대응
        returnURL: `${BACKEND_URL}/api/auth/steam/return`, 
        realm: BACKEND_URL,
        apiKey: STEAM_WEB_API_KEY
      },
      async function(identifier, profile, done) { // ★ 비동기 함수로 변경
        const steamId = identifier.split('/').pop();
        
        try {
            // 1. SteamID를 가진 사용자를 DB에서 찾습니다.
            let user = await User.findOne({ steamId: steamId });

            if (!user) {
                // SteamID가 DB에 없을 경우, 연동되지 않은 계정은 로그인 실패로 처리하거나
                // 이미 JWT 로그인된 상태에서 연동 요청을 했다면 그 유저를 업데이트할 수 있습니다.
                // 여기서는 연동된 유저만 Steam 로그인을 허용합니다.
                return done(null, false, { message: 'Steam account not linked to any user.' });
            }

            // 2. 사용자 발견
            return done(null, user);

        } catch (err) {
            console.error("Steam Passport DB Error:", err);
            return done(err);
        }
      }
    ));
} catch (e) {
    console.error("⚠️ 스팀 로그인 설정 오류 (API Key 확인 필요):", e.message);
}

// Passport Serialize/Deserialize (세션 기반이지만, JWT 사용 시에도 토큰 발급을 위해 필요)
passport.serializeUser((user, done) => done(null, user._id)); // DB ID 저장
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});


// DB 연결
const dbUri = process.env.MONGODB_URI;
if (!dbUri) {
  console.error("❌ 오류: MONGODB_URI 환경 변수 없음");
} else {
  mongoose.connect(dbUri)
    .then((conn) => console.log(`✅ 몽고DB 연결 성공: ${conn.connection.name}`))
    .catch(err => console.error("❌ 몽고DB 연결 실패:", err));
}

// 라우터 등록
app.use('/api/auth', authRoutes);
app.use('/api/ai-recommend', recommendRoutes);
app.use('/api/user', userRoutes); // ★ 유저 라우터 등록

// 1. 상세 페이지 API (기존 로직 유지)
app.get('/api/games/:id', async (req, res) => {
  try {
    const gameInfo = await Game.findOne({ slug: req.params.id }).lean();
    if (!gameInfo) return res.status(404).json({ error: "게임을 찾을 수 없습니다." });
    res.status(200).json(gameInfo);
  } catch (error) {
    res.status(500).json({ error: "서버 내부 오류" });
  }
});

// 2. 메인/검색 페이지 API (기존 로직 유지)
app.post('/api/recommend', async (req, res) => {
  const { tags, sortBy, page = 1, searchQuery } = req.body; 
  const limit = 15; 
  const skip = (page - 1) * limit; 
  
  console.log(`🔍 [API 요청] Page: ${page}, Query: "${searchQuery || ''}"`);

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
    // price_info 필드가 Game 모델에서 제거되었으므로, 정렬 로직은 조정이 필요합니다.
    // 임시로 인기도 기반 정렬로 대체합니다. (실제 운영 시 PriceHistory를 JOIN하여 사용해야 함)
    
    if (sortBy === 'discount') {
        sortRule = { popularity: -1 }; 
        filter["price_info.discount_percent"] = { $gt: 0 }; // 이 필드는 Game 모델에 없어 에러 유발 가능성 있음
    } else if (sortBy === 'new') {
        sortRule = { releaseDate: -1 }; 
    } else if (sortBy === 'price') {
        sortRule = { popularity: 1 }; 
        filter["price_info.current_price"] = { $gte: 0 }; // 이 필드는 Game 모델에 없어 에러 유발 가능성 있음
    }

    // 1차 검색
    const totalGames = await Game.countDocuments(filter);
    let games = await Game.find(filter)
      .sort(sortRule)
      .skip(skip)  
      .limit(limit)
      .lean();
      
    console.log(`👉 검색 결과: ${totalGames}개`);

    // ★ [안전장치] 결과가 0개이면, 필터 다 무시하고 인기 게임 20개 강제 반환
    if (totalGames === 0 && !searchQuery && (!tags || tags.length === 0)) {
        console.log("⚠️ 데이터 없음 -> 인기 게임 강제 로딩");
        games = await Game.find({})
            .sort({ popularity: -1 })
            .limit(20)
            .lean();
    }
    
    res.status(200).json({
      games: games,
      totalPages: Math.ceil(totalGames / limit) || 1
    });

  } catch (error) {
    console.error("❌ API 에러:", error);
    res.status(500).json({ error: "데이터 로딩 중 오류 발생" });
  }
});

// 3. 검색 자동완성 API (기존 로직 유지)
app.get('/api/search/autocomplete', async (req, res) => {
  const query = req.query.q; 
  if (typeof query !== 'string' || !query) return res.json([]);
  const escapedQuery = query.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  try {
    const suggestions = await Game.find({
        $or: [ { title: { $regex: escapedQuery, $options: 'i' } }, { title_ko: { $regex: escapedQuery, $options: 'i' } } ]
    }).select('title title_ko slug').limit(10).lean(); 
    res.json(suggestions);
  } catch (error) { res.status(500).json({ error: "검색 오류" }); }
});

// 4. 찜 목록 (기존 로직 유지)
app.post('/api/wishlist', async (req, res) => {
  if (!req.body.slugs) return res.status(400).json({ error: "Bad Request" });
  try {
    const games = await Game.find({ slug: { $in: req.body.slugs } }).lean();
    res.json(games);
  } catch (error) { res.status(500).json({ error: "DB Error" }); }
});

// 5. 유저 IP (기존 로직 유지)
app.get('/api/user/ip', (req, res) => {
    const userIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    res.json({ ip: userIp });
});

// 6. 투표 (기존 로직 유지)
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

// 7. 디버그용 (기존 로직 유지)
app.get('/api/debug', async (req, res) => {
    try {
        const count = await Game.countDocuments();
        res.json({ 
            status: "OK",
            totalGames: count, 
            dbName: mongoose.connection.name,
            collectionName: Game.collection.name
        });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
  console.log(`🚀 API Server Running on port ${PORT}`);
});