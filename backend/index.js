const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo').default ?? require('connect-mongo');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const SteamStrategy = require('passport-steam').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const NaverStrategy = require('passport-naver-v2').Strategy;
const User = require('./models/User');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');

const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const recoRoutes = require('./routes/recoRoutes');
const advancedRecoRoutes = require('./routes/recommend');
const supportRoutes = require('./routes/support');
const notificationsRoutes = require('./routes/notifications');

const cron = require('node-cron');
const updateExchangeRates = require('./scripts/exchange_updater');

const app = express();
const PORT = process.env.PORT || 8000;

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://playforyou.net';
const BACKEND_URL = process.env.BACKEND_URL || 'https://playforyou.net';

const VALID_PLAYER_TYPES = ['casual', 'beginner', 'intermediate', 'hardcore', 'streamer'];

app.set('trust proxy', 1);

app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
}));

app.use(compression());

const allowedOrigins = process.env.NODE_ENV === 'production'
    ? [FRONTEND_URL]
    : [FRONTEND_URL, 'http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
    skip: (req) => req.path.startsWith('/api/auth'),
});

const recommendLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: '추천 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: '로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요.' },
});

app.use('/api/', generalLimiter);
app.use('/api/recommend', recommendLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.use(session({
    secret: process.env.SESSION_SECRET || 'secret_key_aura',
    resave: false,
    saveUninitialized: false,
    proxy: true,
    store: process.env.MONGODB_URI
        ? MongoStore.create({
            mongoUrl: process.env.MONGODB_URI,
            ttl: 60 * 60 * 24,
            touchAfter: 60 * 60,
          })
        : undefined,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24
    }
}));

app.use(passport.initialize());
app.use(passport.session());

// ── Steam Strategy ────────────────────────────────────────────────────────────
if (process.env.STEAM_WEB_API_KEY || process.env.STEAM_API_KEY) {
    try {
        passport.use(new SteamStrategy({
            returnURL: `${BACKEND_URL}/api/auth/steam/return`,
            realm: `${BACKEND_URL}/`,
            apiKey: process.env.STEAM_WEB_API_KEY || process.env.STEAM_API_KEY,
            passReqToCallback: true
        }, async (req, identifier, profile, done) => {
            try {
                const linkingUserId = req.session?.steamLinkingUserId;
                if (linkingUserId) {
                    const user = await User.findById(linkingUserId);
                    if (user) {
                        user.steamId = profile.id;
                        await user.save();
                        delete req.session.steamLinkingUserId;
                        return done(null, user);
                    }
                }
                let user = await User.findOne({ steamId: profile.id });
                if (!user) {
                    user = await User.create({
                        steamId: profile.id,
                        username: `steam_${profile.id}`,
                        displayName: profile.displayName || `스팀유저_${profile.id.substring(0, 4)}`,
                        email: `no-email-${profile.id}@steam.com`,
                        avatar: profile.photos?.length > 0 ? (profile.photos[2]?.value || profile.photos[0]?.value) : ''
                    });
                }
                return done(null, user);
            } catch (err) { return done(err); }
        }));
    } catch (e) {
        console.error("Steam Strategy Setup Failed:", e);
    }
} else {
    console.warn("⚠️ STEAM_API_KEY 누락 — 스팀 연동 비활성화");
}

// ── Google Strategy ───────────────────────────────────────────────────────────
if (process.env.GOOGLE_CLIENT_ID) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${BACKEND_URL}/api/auth/google/callback`
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            let user = await User.findOne({ googleId: profile.id });
            const googleName = profile.displayName || `구글유저_${profile.id.substring(0, 4)}`;
            const googleEmail = profile.emails?.[0]?.value || 'no-email@google.com';
            const googleAvatar = profile.photos?.[0]?.value || '';
            if (!user) {
                let existing = await User.findOne({ email: googleEmail });
                if (existing && googleEmail !== 'no-email@google.com') {
                    existing.googleId = profile.id;
                    if (!existing.avatar && googleAvatar) existing.avatar = googleAvatar;
                    if (!VALID_PLAYER_TYPES.includes(existing.playerType)) existing.playerType = 'beginner';
                    await existing.save();
                    return done(null, existing);
                }
                user = await User.create({ googleId: profile.id, username: `google_${profile.id}`, displayName: googleName, email: googleEmail, avatar: googleAvatar });
            } else {
                let updated = false;
                if (!user.displayName || user.displayName === user.username) { user.displayName = googleName; updated = true; }
                if (!user.avatar && googleAvatar) { user.avatar = googleAvatar; updated = true; }
                if (!VALID_PLAYER_TYPES.includes(user.playerType)) { user.playerType = 'beginner'; updated = true; }
                if (updated) await user.save();
            }
            return done(null, user);
        } catch (err) { return done(err); }
    }));
}

// ── Naver Strategy ────────────────────────────────────────────────────────────
if (process.env.NAVER_CLIENT_ID) {
    passport.use(new NaverStrategy({
        clientID: process.env.NAVER_CLIENT_ID,
        clientSecret: process.env.NAVER_CLIENT_SECRET,
        callbackURL: `${BACKEND_URL}/api/auth/naver/callback`
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            let user = await User.findOne({ naverId: profile.id });
            const res = profile._json?.response || profile._json || {};
            const naverName = profile.displayName || res.nickname || res.name || `네이버유저_${profile.id.substring(0, 4)}`;
            const naverEmail = profile.emails?.[0]?.value || profile.email || res.email || `naver_${profile.id}@no-email.com`;
            const naverAvatar = profile.profileImage || res.profile_image || '';
            if (!user) {
                let existing = await User.findOne({ email: naverEmail });
                if (existing && !naverEmail.includes('@no-email.com')) {
                    existing.naverId = profile.id;
                    if (!existing.avatar && naverAvatar) existing.avatar = naverAvatar;
                    if (!VALID_PLAYER_TYPES.includes(existing.playerType)) existing.playerType = 'beginner';
                    await existing.save();
                    return done(null, existing);
                }
                user = await User.create({ naverId: profile.id, username: `naver_${profile.id}`, displayName: naverName, email: naverEmail, avatar: naverAvatar });
            } else {
                let updated = false;
                if (!user.displayName || user.displayName === user.username) { user.displayName = naverName; updated = true; }
                if (!user.avatar && naverAvatar) { user.avatar = naverAvatar; updated = true; }
                if (!VALID_PLAYER_TYPES.includes(user.playerType)) { user.playerType = 'beginner'; updated = true; }
                if (updated) await user.save();
            }
            return done(null, user);
        } catch (err) { return done(err); }
    }));
}

passport.serializeUser((user, done) => done(null, user._id ? user._id : user));
passport.deserializeUser(async (id, done) => {
    try {
        if (mongoose.Types.ObjectId.isValid(id)) {
            const user = await User.findById(id);
            return done(null, user);
        }
        done(null, id);
    } catch (err) { done(err); }
});

if (process.env.MONGODB_URI) {
    mongoose.connect(process.env.MONGODB_URI, {
        maxPoolSize: 20,
        minPoolSize: 5,
        socketTimeoutMS: 45000,
        serverSelectionTimeoutMS: 10000,
    })
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => { console.error('❌ DB Error:', err); process.exit(1); });
}

// ── Health check (EC2 로드밸런서 / Docker healthcheck 용) ────────────────────
app.get('/health', (req, res) => {
    const dbState = mongoose.connection.readyState;
    res.status(200).json({
        status: 'ok',
        db: dbState === 1 ? 'connected' : 'connecting'
    });
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api', recoRoutes);
app.use('/api/recommend', advancedRecoRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/notifications', notificationsRoutes);

const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

cron.schedule('0 0 * * *', () => {
    console.log('[Cron] 자정 환율 업데이트');
    updateExchangeRates();
});

const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

// ── 요청 타임아웃 (30초) ──────────────────────────────────────────────────────
server.setTimeout(30000);

// ── Graceful shutdown (EC2 배포 시 기존 요청 안전하게 처리) ──────────────────
const shutdown = () => {
    console.log('🛑 Shutdown signal received, closing server...');
    server.close(async () => {
        await mongoose.connection.close();
        console.log('✅ Server and DB connection closed.');
        process.exit(0);
    });
    setTimeout(() => { process.exit(1); }, 10000);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);