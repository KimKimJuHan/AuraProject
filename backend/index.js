// backend/index.js

require('dotenv').config(); 
const { exec } = require('child_process'); // 스크립트 실행용
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const SteamStrategy = require('passport-steam').Strategy;
const jwt = require('jsonwebtoken'); 
const cookieParser = require('cookie-parser');

// ★★★ 모델 로드 ★★★
const User = require('./models/User'); 
const Game = require('./models/Game'); 
const PriceHistory = require('./models/PriceHistory'); 
const TrendHistory = require('./models/TrendHistory');
const SaleHistory = require('./models/SaleHistory');

// ★★★ 라우터 로드 ★★★
const authRoutes = require('./routes/auth');
const recommendRoutes = require('./routes/recommend');
const userRoutes = require('./routes/user'); 
const steamRecoRouter = require('./routes/steamReco.route'); // 사용자님 기존 코드 유지

// ★ [추가] 새로 만든 DB 기반 추천 라우터 (recoRoutes.js) 불러오기
const recoRoutes = require('./routes/recoRoutes'); 

const app = express();
const PORT = 8000;

// 환경 변수 설정
const STEAM_WEB_API_KEY = process.env.STEAM_WEB_API_KEY || process.env.STEAM_API_KEY; 
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';
const MONGODB_URI = process.env.MONGODB_URI;

// CORS 설정
app.use(cors({ origin: FRONTEND_URL, credentials: true })); 
app.use(express.json());
app.use(cookieParser()); 
app.set('trust proxy', true);

// 세션 설정 (스팀 인증 과정에서 필수)
app.use(session({
    secret: 'your_secret_key',
    resave: true,
    saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

// ★★★ 스팀 전략 설정 ★★★
try {
    passport.use(new SteamStrategy({
        returnURL: `${BACKEND_URL}/api/auth/steam/return`, 
        realm: BACKEND_URL,
        apiKey: STEAM_WEB_API_KEY,
        passReqToCallback: true 
      },
      async function(req, identifier, profile, done) { 
        const steamId = identifier.split('/').pop();
        
        console.log(`🔍 [Steam Strategy] 스팀 응답 수신! ID: ${steamId}`);
        console.log(`🔍 [Steam Strategy] 연동 요청 여부(세션):`, req.session.linkUserId ? `YES (User ID: ${req.session.linkUserId})` : "NO (Login Mode)");

        try {
            // 1. 연동 모드: 세션에 linkUserId가 있다면 (기존 계정에 스팀 연결)
            if (req.session.linkUserId) {
                const currentUser = await User.findById(req.session.linkUserId);
                if (currentUser) {
                    currentUser.steamId = steamId;
                    await currentUser.save(); 
                    
                    console.log(`✅ [DB 저장 성공] 유저(${currentUser.username}) DB에 SteamID(${steamId})가 저장되었습니다.`);
                    return done(null, currentUser);
                }
            }

            // 2. 로그인 모드: 스팀 ID로 바로 로그인
            let user = await User.findOne({ steamId: steamId });
            if (!user) {
                console.log(`⚠️ [Steam Strategy] DB에 등록되지 않은 스팀 계정입니다.`);
                return done(null, false, { message: '등록되지 않은 스팀 계정입니다. 먼저 회원가입 후 연동해주세요.' });
            }
            return done(null, user);

        } catch (err) {
            console.error("Steam Passport Error:", err);
            return done(err);
        }
      }
    ));
} catch (e) {
    console.error("⚠️ 스팀 로그인 설정 오류 (API Key 확인 필요):", e.message);
}

// Passport Serialize/Deserialize 
passport.serializeUser((user, done) => done(null, user._id)); 
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

// DB 연결
if (!MONGODB_URI) {
  console.error("❌ 오류: MONGODB_URI 환경 변수 없음");
} else {
  mongoose.connect(MONGODB_URI)
    .then((conn) => console.log(`✅ 몽고DB 연결 성공: ${conn.connection.name}`))
    .catch(err => console.error("❌ 몽고DB 연결 실패:", err));
}

// ★★★ 라우터 등록 ★★★
app.use('/api/auth', authRoutes);
app.use('/api/ai-recommend', recommendRoutes);
app.use('/api/user', userRoutes);
// app.use('/api/steam', steamRecoRouter); // 기존 스팀 라우터 (잠시 주석 처리하거나 경로 변경)

// ★ [핵심] 프론트엔드가 호출하는 '/api/steam' 경로에 recoRoutes(DB 연동 버전) 연결
app.use('/api/steam', recoRoutes); 


// =================================================================
// ★ 관리자용 스크립트 실행 API
// =================================================================

// 1. 게임 데이터 수집기 실행
app.get('/api/admin/collect', (req, res) => {
    console.log("🚀 [Admin] 게임 데이터 수집기(Collector) 실행 요청됨...");
    exec('node collector.js', { cwd: __dirname }, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ Collector 실행 중 오류 발생: ${error.message}`);
            return;
        }
        if (stderr) console.error(`⚠️ Collector 경고: ${stderr}`);
        console.log(`✅ Collector 결과:\n${stdout}`);
    });
    res.json({ message: "수집기가 백그라운드에서 시작되었습니다." });
});

// 2. 트렌드(카테고리) 족보 업데이트 실행
app.get('/api/admin/seed/category', (req, res) => {
    console.log("🚀 [Admin] 트렌드 카테고리 시더(Category Seeder) 실행 요청됨...");
    exec('node category_seeder.js', { cwd: __dirname }, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ Category Seeder 오류: ${error.message}`);
            return;
        }
        console.log(`✅ Category Seeder 결과:\n${stdout}`);
    });
    res.json({ message: "트렌드 카테고리 매핑 작업이 시작되었습니다." });
});

// 3. 가격(ITAD) 족보 업데이트 실행
app.get('/api/admin/seed/metadata', (req, res) => {
    console.log("🚀 [Admin] 메타데이터 시더(Metadata Seeder) 실행 요청됨...");
    exec('node metadata_seeder.js', { cwd: __dirname }, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ Metadata Seeder 오류: ${error.message}`);
            return;
        }
        console.log(`✅ Metadata Seeder 결과:\n${stdout}`);
    });
    res.json({ message: "가격 데이터 매핑 작업이 시작되었습니다." });
});


// =================================================================
// 기존 API 유지 (상세 페이지, 검색, 찜 등)
// =================================================================

// 1. 상세 페이지 API 
app.get('/api/games/:id', async (req, res) => {
  try {
    const gameInfo = await Game.findOne({ slug: req.params.id }).lean();
    if (!gameInfo) return res.status(404).json({ error: "게임을 찾을 수 없습니다." });
    
    const finalData = {
        ...gameInfo,
        lowest_price_url: gameInfo.price_info?.store_url || `https://store.steampowered.com/app/${gameInfo.steam_appid}`,
        all_deals: gameInfo.price_info?.deals || []
    };
    
    res.status(200).json(finalData);
  } catch (error) {
    console.error("❌ 상세 페이지 API 오류:", error);
    res.status(500).json({ error: "서버 내부 오류" });
  }
});

// 2. 메인/검색 페이지 API
app.post('/api/recommend', async (req, res) => {
  const { tags, sortBy, page = 1, searchQuery } = req.body; 
  const limit = 15; 
  const skip = (page - 1) * limit; 
  
  console.log(`🔍 [API 요청] Page: ${page}, Query: "${searchQuery || ''}"`);

  try {
    let filter = {};
    if (tags && tags.length > 0) filter.smart_tags = { $in: tags }; 
    if (searchQuery && searchQuery.trim() !== "") {
        const query = searchQuery.trim();
        const escapedQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        filter.$or = [
            { title: { $regex: escapedQuery, $options: 'i' } },
            { title_ko: { $regex: escapedQuery, $options: 'i' } }
        ];
    }

    let sortRule = { popularity: -1, _id: -1 }; 
    if (sortBy === 'discount') {
        sortRule = { "price_info.discount_percent": -1, popularity: -1 };
        filter["price_info.discount_percent"] = { $gt: 0 }; 
    } else if (sortBy === 'new') {
        sortRule = { releaseDate: -1 }; 
    } else if (sortBy === 'price') {
        sortRule = { "price_info.current_price": 1, popularity: -1 };
        filter["price_info.current_price"] = { $gte: 0 };
    }

    const totalGames = await Game.countDocuments(filter);
    let games = await Game.find(filter).sort(sortRule).skip(skip).limit(limit).lean();
      
    console.log(`👉 검색 결과: ${totalGames}개`);

    if (totalGames === 0 && !searchQuery && (!tags || tags.length === 0)) {
        console.log("⚠️ 데이터 없음 -> 인기 게임 강제 로딩");
        games = await Game.find({}).sort({ popularity: -1 }).limit(20).lean();
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

// 3. 검색 자동완성 API
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

// 4. 찜 목록
app.post('/api/wishlist', async (req, res) => {
  if (!req.body.slugs) return res.status(400).json({ error: "Bad Request" });
  try {
    const games = await Game.find({ slug: { $in: req.body.slugs } }).lean();
    res.json(games);
  } catch (error) { res.status(500).json({ error: "DB Error" }); }
});

// 5. 유저 IP
app.get('/api/user/ip', (req, res) => {
    const userIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    res.json({ ip: userIp });
});

// 6. 투표
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

// 7. 디버그용
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