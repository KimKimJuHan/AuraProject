require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const passport = require('passport'); // ★ 정상 임포트 복구
const SteamStrategy = require('passport-steam').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const NaverStrategy = require('passport-naver-v2').Strategy;
const User = require('./models/User');

const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

// 라우터 모음
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const recoRoutes = require('./routes/recoRoutes');
const advancedRecoRoutes = require('./routes/recommend');
const supportRoutes = require('./routes/support');
// ★ 새로 만든 알림 라우터 추가
const notificationsRoutes = require('./routes/notifications');

const cron = require('node-cron');
const updateExchangeRates = require('./scripts/exchange_updater');

const app = express();
const PORT = process.env.PORT || 8000;

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://playforyou.net';
const BACKEND_URL = process.env.BACKEND_URL || 'https://playforyou.net';

app.set('trust proxy', 1);

app.use(cors({ 
    origin: [FRONTEND_URL, 'http://localhost:3000', 'http://127.0.0.1:3000'], 
    credentials: true 
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ★ 안전한 세션 설정 (충돌 방지)
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret_key_aura',
    resave: false,
    saveUninitialized: false,
    proxy: true, 
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax', 
        maxAge: 1000 * 60 * 60 * 24 
    }
}));

// ★ 패스포트 초기화 위치 보정
app.use(passport.initialize());
app.use(passport.session());

// 1. Steam Strategy 
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
                        displayName: profile.displayName || `스팀유저_${profile.id.substring(0,4)}`,
                        email: `no-email-${profile.id}@steam.com`,
                        avatar: profile.photos && profile.photos.length > 0 ? (profile.photos[2]?.value || profile.photos[0]?.value) : ''
                    });
                }
                return done(null, user);
            } catch (err) {
                return done(err);
            }
        }));
    } catch (e) {
        console.error("Steam Strategy Setup Failed:", e);
    }
} else {
    console.warn("⚠️ STEAM_API_KEY가 누락되어 스팀 연동을 비활성화합니다.");
}

// 2. Google Strategy 
if (process.env.GOOGLE_CLIENT_ID) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${BACKEND_URL}/api/auth/google/callback`
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            let user = await User.findOne({ googleId: profile.id });
            const googleName = profile.displayName || `구글유저_${profile.id.substring(0, 4)}`;
            const googleEmail = (profile.emails && profile.emails.length > 0) ? profile.emails[0].value : 'no-email@google.com';
            const googleAvatar = (profile.photos && profile.photos.length > 0) ? profile.photos[0].value : '';

            if (!user) {
                let existingUserByEmail = await User.findOne({ email: googleEmail });
                if (existingUserByEmail && googleEmail !== 'no-email@google.com') {
                    existingUserByEmail.googleId = profile.id; 
                    if (!existingUserByEmail.avatar && googleAvatar) existingUserByEmail.avatar = googleAvatar;
                    await existingUserByEmail.save();
                    return done(null, existingUserByEmail);
                }
                user = await User.create({ googleId: profile.id, username: `google_${profile.id}`, displayName: googleName, email: googleEmail, avatar: googleAvatar });
            } else {
                let isUpdated = false;
                if (!user.displayName || user.displayName === user.username) { user.displayName = googleName; isUpdated = true; }
                if (!user.avatar && googleAvatar) { user.avatar = googleAvatar; isUpdated = true; }
                if (isUpdated) await user.save();
            }
            return done(null, user);
        } catch (err) { return done(err); }
    }));
}

// 3. Naver Strategy 
if (process.env.NAVER_CLIENT_ID) {
    passport.use(new NaverStrategy({
        clientID: process.env.NAVER_CLIENT_ID,
        clientSecret: process.env.NAVER_CLIENT_SECRET,
        callbackURL: `${BACKEND_URL}/api/auth/naver/callback`
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            let user = await User.findOne({ naverId: profile.id });
            const responseData = (profile._json && profile._json.response) ? profile._json.response : (profile._json || {});
            const naverName = profile.displayName || profile.name || responseData.nickname || responseData.name || `네이버유저_${profile.id.substring(0, 4)}`;
            const naverEmail = (profile.emails && profile.emails.length > 0 && profile.emails[0].value) || profile.email || responseData.email || `naver_${profile.id}@no-email.com`;
            const naverAvatar = profile.profileImage || responseData.profile_image || '';

            if (!user) {
                let existingUserByEmail = await User.findOne({ email: naverEmail });
                if (existingUserByEmail && !naverEmail.includes('@no-email.com')) {
                    existingUserByEmail.naverId = profile.id; 
                    if (!existingUserByEmail.avatar && naverAvatar) existingUserByEmail.avatar = naverAvatar;
                    await existingUserByEmail.save();
                    return done(null, existingUserByEmail);
                }
                user = await User.create({ naverId: profile.id, username: `naver_${profile.id}`, displayName: naverName, email: naverEmail, avatar: naverAvatar });
            } else {
                let isUpdated = false;
                if (!user.displayName || user.displayName === user.username) { user.displayName = naverName; isUpdated = true; }
                if (!user.avatar && naverAvatar) { user.avatar = naverAvatar; isUpdated = true; }
                if (isUpdated) await user.save();
            }
            return done(null, user);
        } catch (err) { return done(err); }
    }));
}

passport.serializeUser((user, done) => {
    const sessionUser = user._id ? user._id : user;
    done(null, sessionUser);
});

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
    mongoose.connect(process.env.MONGODB_URI)
        .then(() => console.log('✅ MongoDB Connected'))
        .catch(err => console.error('❌ DB Error:', err));
}

// 라우터 마운트
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/recommend', advancedRecoRoutes);
app.use('/api', recoRoutes);
app.use('/api/steam', advancedRecoRoutes); 
app.use('/api/advanced', advancedRecoRoutes); 
app.use('/api/support', supportRoutes);
// ★ 알림 라우터 마운트 (이 부분이 누락되어 프론트엔드에서 알림을 못 불러옵니다)
app.use('/api/notifications', notificationsRoutes);

const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

cron.schedule('0 0 * * *', () => {
    console.log('[Cron] 자정 환율 업데이트 스케줄러 작동');
    updateExchangeRates();
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});