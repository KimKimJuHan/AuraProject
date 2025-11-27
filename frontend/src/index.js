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

const User = require('./models/User'); 
const Game = require('./models/Game'); 

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user'); 
const recoRoutes = require('./routes/recoRoutes'); // ★ 추가됨

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

// Steam Strategy 설정 (기존 코드 유지)
try {
    passport.use(new SteamStrategy({
        returnURL: `${BACKEND_URL}/api/auth/steam/return`, 
        realm: BACKEND_URL,
        apiKey: STEAM_WEB_API_KEY,
        passReqToCallback: true 
      },
      async function(req, identifier, profile, done) { 
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
            let user = await User.findOne({ steamId: steamId });
            if (!user) return done(null, false);
            return done(null, user);
        } catch (err) { return done(err); }
      }
    ));
} catch (e) {}

passport.serializeUser((user, done) => done(null, user._id)); 
passport.deserializeUser(async (id, done) => {
    try { const user = await User.findById(id); done(null, user); } catch (err) { done(err, null); }
});

// DB 연결
mongoose.connect(MONGODB_URI)
    .then(() => console.log(`✅ 몽고DB 연결 성공`))
    .catch(err => console.error("❌ 몽고DB 연결 실패:", err));

// 라우터 등록
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/steam', recoRoutes); // ★ 핵심 연결

// 관리자 수집 API
app.get('/api/admin/collect', (req, res) => {
    exec('node collector.js', { cwd: __dirname }, (error, stdout, stderr) => {
        if (error) console.error(error);
        console.log(stdout);
    });
    res.json({ message: "수집기 시작됨" });
});

// 기존 상세 API 유지
app.get('/api/games/:id', async (req, res) => {
    try {
        const game = await Game.findOne({ slug: req.params.id }).lean();
        res.json(game || {});
    } catch (e) { res.status(500).json({}); }
});

app.listen(PORT, () => {
  console.log(`🚀 API Server Running on port ${PORT}`);
});