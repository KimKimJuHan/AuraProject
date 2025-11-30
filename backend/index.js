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

// 모델
const User = require('./models/User');
const Game = require('./models/Game');
const TrendHistory = require('./models/TrendHistory'); // ★ [추가] 히스토리 모델 연결

// 라우터
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const recoRoutes = require('./routes/recoRoutes');
const advancedRecoRoutes = require('./routes/recommend');

const app = express();

// ===== 환경 변수 =====
const PORT = process.env.PORT || 8000;
const STEAM_WEB_API_KEY = process.env.STEAM_WEB_API_KEY || process.env.STEAM_API_KEY;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ 오류: MONGODB_URI 환경 변수 없음');
}

// ===== 미들웨어 =====
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.set('trust proxy', true);

app.use(session({
    secret: process.env.SESSION_SECRET || 'your_secret_key',
    resave: true,
    saveUninitialized: true,
}));

app.use(passport.initialize());
app.use(passport.session());

// ===== Passport 설정 (기존 유지) =====
try {
  passport.use(new SteamStrategy({
        returnURL: `${BACKEND_URL}/api/auth/steam/return`,
        realm: BACKEND_URL,
        apiKey: STEAM_WEB_API_KEY,
        passReqToCallback: true,
      },
      async function (req, identifier, profile, done) {
        const steamId = identifier.split('/').pop();
        try {
          if (req.session.linkUserId) {
            const currentUser = await User.findById(req.session.linkUserId);
            if (currentUser) {
              currentUser.steamId = steamId;
              await currentUser.save();
              return done(null, currentUser);
            }
          }
          const user = await User.findOne({ steamId });
          if (!user) return done(null, false);
          return done(null, user);
        } catch (err) { return done(err); }
      }
    )
  );
} catch (e) {}

passport.serializeUser((user, done) => done(null, user._id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) { done(err, null); }
});

if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI).then(() => console.log('✅ 몽고DB 연결 성공')).catch((e) => console.error(e));
}

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/steam', recoRoutes);
app.use('/api/advanced', advancedRecoRoutes);

app.get('/api/admin/collect', (req, res) => {
  exec('node collector.js', { cwd: __dirname }, (err, stdout, stderr) => {
    if (err) console.error(err);
    if (stdout) console.log(stdout);
  });
  res.json({ message: '수집기 시작됨' });
});

// ===== 게임 상세 정보 =====
app.get('/api/games/:id', async (req, res) => {
  try {
    const game = await Game.findOne({ slug: req.params.id }).lean();
    if (!game) return res.status(404).json({ error: 'Game not found' });
    res.json(game);
  } catch (e) {
    res.status(500).json({ error: 'DB Error' });
  }
});

// ★ [추가] 트렌드 히스토리 조회 API
app.get('/api/games/:id/history', async (req, res) => {
  try {
    // 슬러그로 게임을 먼저 찾아서 steam_appid를 알아냄
    const game = await Game.findOne({ slug: req.params.id }).select('steam_appid');
    if (!game) return res.status(404).json({ error: 'Game not found' });

    // 해당 AppID의 히스토리 조회 (최신 100개 제한)
    const history = await TrendHistory.find({ steam_appid: game.steam_appid })
      .sort({ recordedAt: 1 }) // 과거 -> 최신 순 정렬
      .limit(100)
      .lean();

    res.json(history);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server Error' });
  }
});

app.post('/api/recommend', async (req, res) => {
  const { tags, sortBy, page = 1, searchQuery } = req.body;
  const limit = 15;
  const skip = (page - 1) * limit;

  try {
    const filter = {};
    if (tags && tags.length > 0) filter.smart_tags = { $in: tags };
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

    if (totalGames === 0 && !searchQuery && (!tags || tags.length === 0)) {
        games = await Game.find({}).sort({ popularity: -1 }).limit(20).lean();
    }

    res.status(200).json({ games, totalPages: Math.ceil(totalGames / limit) || 1 });
  } catch (error) { res.status(500).json({ error: '데이터 로딩 중 오류 발생' }); }
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