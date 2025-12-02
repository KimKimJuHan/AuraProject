// backend/index.js

require('dotenv').config();
const { exec } = require('child_process');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const passport = require('passport'); 
const SteamStrategy = require('passport-steam').Strategy;

const { getQueryTags } = require('./utils/tagMapper'); // ★ 중요

const User = require('./models/User');
const Game = require('./models/Game');
const TrendHistory = require('./models/TrendHistory');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const recoRoutes = require('./routes/recoRoutes');
const advancedRecoRoutes = require('./routes/recommend');

const app = express();

const PORT = process.env.PORT || 8000;
const STEAM_WEB_API_KEY = process.env.STEAM_WEB_API_KEY || process.env.STEAM_API_KEY;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) console.error('❌ 오류: MONGODB_URI 환경 변수 없음');

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.set('trust proxy', true);

app.use(session({
    secret: process.env.SESSION_SECRET || 'your_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 1000 * 60 * 30 }
}));

app.use(passport.initialize());
app.use(passport.session());

try {
  passport.use(new SteamStrategy({
        returnURL: `${BACKEND_URL}/api/auth/steam/return`,
        realm: `${BACKEND_URL}/`,
        apiKey: STEAM_WEB_API_KEY,
        passReqToCallback: true,
      },
      function (req, identifier, profile, done) {
        profile.identifier = identifier;
        return done(null, profile);
      }
    )
  );
} catch (e) { console.error("Steam Strategy Error:", e); }

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI).then(() => console.log('✅ 몽고DB 연결 성공')).catch((e) => console.error(e));
}

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/steam', recoRoutes);
app.use('/api/advanced', advancedRecoRoutes);

// 기타 API
app.get('/api/admin/collect', (req, res) => {
  exec('node collector.js', { cwd: __dirname }, (err, stdout, stderr) => {
    if (err) console.error(err);
    if (stdout) console.log(stdout);
  });
  res.json({ message: '수집기 시작됨' });
});

app.get('/api/games/:id', async (req, res) => {
  try {
    const game = await Game.findOne({ slug: req.params.id }).lean();
    if (!game) return res.status(404).json({ error: 'Game not found' });
    res.json(game);
  } catch (e) { res.status(500).json({ error: 'DB Error' }); }
});

app.get('/api/games/:id/history', async (req, res) => {
  try {
    const game = await Game.findOne({ slug: req.params.id }).select('steam_appid');
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const history = await TrendHistory.find({ steam_appid: game.steam_appid })
      .sort({ recordedAt: 1 }).limit(100).lean();
    res.json(history);
  } catch (e) { res.status(500).json({ error: 'Server Error' }); }
});

// ★ [수정됨] 메인 페이지 추천/검색 API (태그 검색 강화)
app.post('/api/recommend', async (req, res) => {
  const { tags, sortBy, page = 1, searchQuery } = req.body;
  const limit = 15;
  const skip = (page - 1) * limit;

  try {
    const filter = {};
    
    // 1. 태그 필터 (정규식 확장 적용)
    if (tags && tags.length > 0) {
        // [ 'Action' ] -> [ /^Action$/i, /^액션$/i, ... ]
        const expandedTags = tags.flatMap(t => getQueryTags(t));
        filter.smart_tags = { $in: expandedTags };
        console.log(`[메인 필터] 태그: ${tags} -> 확장 검색 조건:`, expandedTags);
    }

    // 2. 검색어 필터
    if (searchQuery && searchQuery.trim() !== '') {
      const q = searchQuery.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      filter.$or = [{ title: { $regex: q, $options: 'i' } }, { title_ko: { $regex: q, $options: 'i' } }];
    }

    let sortRule = { popularity: -1, _id: -1 };
    if (sortBy === 'discount') {
      sortRule = { 'price_info.discount_percent': -1, popularity: -1 };
      filter['price_info.discount_percent'] = { $gt: 0 };
    } else if (sortBy === 'new') sortRule = { releaseDate: -1 };
    else if (sortBy === 'price') {
      sortRule = { 'price_info.current_price': 1, popularity: -1 };
      filter['price_info.current_price'] = { $gte: 0 };
    }

    const totalGames = await Game.countDocuments(filter);
    let games = await Game.find(filter).sort(sortRule).skip(skip).limit(limit).lean();

    // 결과가 0개면 인기 게임 반환 (태그/검색 없을 때만)
    if (totalGames === 0 && !searchQuery && (!tags || tags.length === 0)) {
        games = await Game.find({}).sort({ popularity: -1 }).limit(20).lean();
    }

    console.log(`[API] 검색 결과: ${totalGames}개 발견`);
    res.status(200).json({ games, totalPages: Math.ceil(totalGames / limit) || 1 });
  } catch (error) { 
      console.error("[API Error]", error);
      res.status(500).json({ error: '데이터 로딩 중 오류 발생' }); 
  }
});

app.get('/api/search/autocomplete', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.json([]);
  const q = query.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  try {
    const suggestions = await Game.find({
      $or: [{ title: { $regex: q, $options: 'i' } }, { title_ko: { $regex: q, $options: 'i' } }],
    }).select('title title_ko slug').limit(10).lean();
    res.json(suggestions);
  } catch (error) { res.status(500).json({ error: '검색 오류' }); }
});

app.post('/api/wishlist', async (req, res) => {
  const { slugs } = req.body;
  if (!slugs) return res.status(400).json({ error: 'slugs needed' });
  try {
    const games = await Game.find({ slug: { $in: slugs } }).lean();
    res.json(games);
  } catch (error) { res.status(500).json({ error: 'DB Error' }); }
});

app.get('/api/user/ip', (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',').shift().trim() || req.ip || req.connection.remoteAddress;
  res.json({ ip });
});

app.post('/api/games/:id/vote', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',').shift().trim() || req.ip || req.connection.remoteAddress;
  const { type } = req.body;
  try {
    const game = await Game.findOne({ slug: req.params.id });
    if (!game) return res.status(404).json({ error: 'Game not found' });
    
    if (!game.votes) game.votes = [];
    const idx = game.votes.findIndex(v => v.identifier === ip);
    if (idx !== -1) {
        const oldType = game.votes[idx].type;
        game.votes.splice(idx, 1);
        if(oldType === 'like') game.likes_count--; else game.dislikes_count--;
        if (oldType !== type) {
            game.votes.push({ identifier: ip, type, weight: 1 });
            if(type === 'like') game.likes_count++; else game.dislikes_count++;
        }
    } else {
        game.votes.push({ identifier: ip, type, weight: 1 });
        if(type === 'like') game.likes_count++; else game.dislikes_count++;
    }
    await game.save();
    res.json({ likes: game.likes_count, dislikes: game.dislikes_count, userVote: idx !== -1 && game.votes[idx]?.type === type ? null : type });
  } catch (error) { res.status(500).json({ error: 'Vote Error' }); }
});

app.listen(PORT, () => console.log(`🚀 API Server Running on port ${PORT}`));