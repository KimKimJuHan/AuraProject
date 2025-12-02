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

const { getQueryTags } = require('./utils/tagMapper');
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

if (!MONGODB_URI) console.error('❌ MONGODB_URI 없음');

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.set('trust proxy', 1);

// ★ 세션 설정 수정 (리다이렉트 시 유지력 강화)
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret_key_aura',
    resave: false, // 불필요한 저장 방지
    saveUninitialized: false, // 빈 세션 저장 방지
    cookie: { 
        secure: false, // http(로컬) 환경에서는 반드시 false
        httpOnly: true,
        sameSite: 'lax', // 리다이렉트 후에도 쿠키 전송 허용
        maxAge: 1000 * 60 * 30 // 30분
    }
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
      (req, identifier, profile, done) => {
        process.nextTick(() => {
            profile.identifier = identifier;
            return done(null, profile);
        });
      }
    )
  );
} catch (e) {}

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI).then(() => console.log('✅ DB 연결됨')).catch((e) => console.error(e));
}

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/steam', recoRoutes);
app.use('/api/advanced', advancedRecoRoutes);

app.get('/api/admin/collect', (req, res) => {
  exec('node scripts/collector.js', { cwd: __dirname }, (err, stdout) => {
    if (err) console.error(err);
    if (stdout) console.log(stdout);
  });
  res.json({ message: '수집기 시작' });
});

app.get('/api/games/:id', async (req, res) => {
  try {
    const game = await Game.findOne({ slug: req.params.id }).lean();
    if (!game) return res.status(404).json({ error: 'Not found' });
    res.json(game);
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

app.get('/api/games/:id/history', async (req, res) => {
  try {
    const game = await Game.findOne({ slug: req.params.id }).select('steam_appid');
    if (!game) return res.status(404).json({ error: 'Not found' });
    const history = await TrendHistory.find({ steam_appid: game.steam_appid }).sort({ recordedAt: 1 }).limit(100).lean();
    res.json(history);
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

app.post('/api/recommend', async (req, res) => {
  const { tags, sortBy, page = 1, searchQuery } = req.body;
  const limit = 15;
  const skip = (page - 1) * limit;

  try {
    const filter = {};
    if (tags && tags.length > 0) {
        const andConditions = tags.map(tag => ({ smart_tags: { $in: getQueryTags(tag) } }));
        filter.$and = andConditions;
    }
    if (searchQuery) {
        const q = searchQuery.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        filter.$or = [{ title: { $regex: q, $options: 'i' } }, { title_ko: { $regex: q, $options: 'i' } }];
    }

    const allMatches = await Game.find(filter).select('smart_tags').lean();
    const validTagsSet = new Set();
    allMatches.forEach(g => {
        if (g.smart_tags) g.smart_tags.forEach(t => validTagsSet.add(t));
    });

    let sortRule = { popularity: -1, _id: -1 };
    if (sortBy === 'discount') { sortRule = { 'price_info.discount_percent': -1 }; filter['price_info.discount_percent'] = { $gt: 0 }; }
    else if (sortBy === 'new') sortRule = { releaseDate: -1 };
    else if (sortBy === 'price') { sortRule = { 'price_info.current_price': 1 }; filter['price_info.current_price'] = { $gte: 0 }; }

    const games = await Game.find(filter).sort(sortRule).skip(skip).limit(limit).lean();

    if (allMatches.length === 0 && !searchQuery && (!tags || tags.length === 0)) {
        const popGames = await Game.find({}).sort({ popularity: -1 }).limit(20).lean();
        return res.status(200).json({ games: popGames, totalPages: 1, validTags: [] });
    }

    res.status(200).json({ 
        games, 
        totalPages: Math.ceil(allMatches.length / limit) || 1, 
        validTags: Array.from(validTagsSet) 
    });
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

app.get('/api/search/autocomplete', async (req, res) => {
    const q = req.query.q?.trim();
    if (!q) return res.json([]);
    const suggestions = await Game.find({ $or: [{ title: { $regex: q, $options: 'i' } }, { title_ko: { $regex: q, $options: 'i' } }] }).select('title title_ko slug').limit(10).lean();
    res.json(suggestions);
});

app.post('/api/wishlist', async (req, res) => {
    const { slugs } = req.body;
    const games = await Game.find({ slug: { $in: slugs } }).lean();
    res.json(games);
});

app.get('/api/user/ip', (req, res) => { res.json({ ip: req.ip }); });
app.post('/api/games/:id/vote', async (req, res) => { res.json({ status: 'ok' }); });

app.listen(PORT, () => console.log(`🚀 API Server Running on port ${PORT}`));