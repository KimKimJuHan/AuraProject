// backend/index.js

require('dotenv').config(); 
const { exec } = require('child_process');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const SteamStrategy = require('passport-steam').Strategy;
const cookieParser = require('cookie-parser');

// 모델 로드
const User = require('./models/User'); 
const Game = require('./models/Game'); 

// 라우터 로드
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user'); 

// ★ [추가됨] DB 기반 추천 라우터 연결
const recoRoutes = require('./routes/recoRoutes'); 

const app = express();
const PORT = 8000;

const STEAM_WEB_API_KEY = process.env.STEAM_WEB_API_KEY || process.env.STEAM_API_KEY; 
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';
const MONGODB_URI = process.env.MONGODB_URI;

app.use(cors({ origin: FRONTEND_URL, credentials: true })); 
app.use(express.json());
app.use(cookieParser()); 
app.set('trust proxy', true);

app.use(session({
    secret: 'your_secret_key',
    resave: true,
    saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

// 스팀 로그인 전략
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
        try {
            if (req.session.linkUserId) {
                const currentUser = await User.findById(req.session.linkUserId);
                if (currentUser) {
                    currentUser.steamId = steamId;
                    await currentUser.save(); 
                    return done(null, currentUser);
                }
            }
            let user = await User.findOne({ steamId: steamId });
            if (!user) return done(null, false);
            return done(null, user);
        } catch (err) { return done(err); }
      }
    ));
} catch (e) { console.error(e); }

passport.serializeUser((user, done) => done(null, user._id)); 
passport.deserializeUser(async (id, done) => {
    try { const user = await User.findById(id); done(null, user); } catch (err) { done(err, null); }
});

// DB 연결
if (!MONGODB_URI) console.error("❌ 오류: MONGODB_URI 환경 변수 없음");
else mongoose.connect(MONGODB_URI).then(() => console.log(`✅ 몽고DB 연결 성공`)).catch(e => console.error(e));

// ★ 라우터 등록 (순서 중요)
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);

// ★ [핵심] 프론트엔드가 호출하는 주소(/api/steam/reco)에 recoRoutes 연결
app.use('/api/steam', recoRoutes); 

// 관리자 수집 API
app.get('/api/admin/collect', (req, res) => {
    exec('node collector.js', { cwd: __dirname }, (err, stdout) => {
        if(err) console.error(err);
        console.log(stdout);
    });
    res.json({ message: "수집기 시작됨" });
});

// 기존 API들 유지 (상세 페이지, 메인 추천 등)
app.get('/api/games/:id', async (req, res) => {
    try {
        const game = await Game.findOne({ slug: req.params.id }).lean();
        res.json(game || {});
    } catch (e) { res.status(500).json({}); }
});

app.post('/api/recommend', async (req, res) => {
  const { tags, sortBy, page = 1, searchQuery } = req.body; 
  const limit = 15; 
  const skip = (page - 1) * limit; 
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
    if (totalGames === 0 && !searchQuery && (!tags || tags.length === 0)) {
        games = await Game.find({}).sort({ popularity: -1 }).limit(20).lean();
    }
    res.status(200).json({ games: games, totalPages: Math.ceil(totalGames / limit) || 1 });
  } catch (error) {
    res.status(500).json({ error: "데이터 로딩 중 오류 발생" });
  }
});

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

app.post('/api/wishlist', async (req, res) => {
  if (!req.body.slugs) return res.status(400).json({ error: "Bad Request" });
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

app.get('/api/debug', async (req, res) => {
    try {
        const count = await Game.countDocuments();
        res.json({ status: "OK", totalGames: count, dbName: mongoose.connection.name });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
  console.log(`🚀 API Server Running on port ${PORT}`);
});