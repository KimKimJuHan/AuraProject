const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const SteamStrategy = require('passport-steam').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const NaverStrategy = require('passport-naver-v2').Strategy;
const User = require('./models/User');
const supportRoutes = require('./routes/support');

const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

const authRoutes = require('./routes/auth');
console.log('AUTH ROUTE LOADED FROM:', require.resolve('./routes/auth'));
const userRoutes = require('./routes/user');
const recoRoutes = require('./routes/recoRoutes');
const advancedRecoRoutes = require('./routes/recommend');

const app = express();
const PORT = process.env.PORT || 8000;

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://playforyou.net';
const BACKEND_URL = process.env.BACKEND_URL || 'https://playforyou.net';

app.set('trust proxy', 1);

app.use(cors({ 
    origin: FRONTEND_URL, 
    credentials: true 
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

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

app.use(passport.initialize());
app.use(passport.session());

// 1. Steam Strategy
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

// 2. Google Strategy
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

            user = await User.create({
                googleId: profile.id, username: `google_${profile.id}`, displayName: googleName, email: googleEmail, avatar: googleAvatar
            });
        } else {
            let isUpdated = false;
            if (!user.displayName || user.displayName === user.username) { user.displayName = googleName; isUpdated = true; }
            if (!user.avatar && googleAvatar) { user.avatar = googleAvatar; isUpdated = true; }
            if (isUpdated) await user.save();
        }
        return done(null, user);
    } catch (err) { return done(err); }
}));

// 3. Naver Strategy
passport.use(new NaverStrategy({
    clientID: process.env.NAVER_CLIENT_ID,
    clientSecret: process.env.NAVER_CLIENT_SECRET,
    callbackURL: `${BACKEND_URL}/api/auth/naver/callback`
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ naverId: profile.id });
        
        // ★ 팩트: 네이버 API 이중 JSON 구조 정밀 파싱 적용 (이름 누락 방어)
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

            user = await User.create({
                naverId: profile.id, username: `naver_${profile.id}`, displayName: naverName, email: naverEmail, avatar: naverAvatar
            });
        } else {
            let isUpdated = false;
            if (!user.displayName || user.displayName === user.username) { user.displayName = naverName; isUpdated = true; }
            if (!user.avatar && naverAvatar) { user.avatar = naverAvatar; isUpdated = true; }
            if (isUpdated) await user.save();
        }
        return done(null, user);
    } catch (err) { return done(err); }
}));

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
console.log('typeof authRoutes:', typeof authRoutes);
console.log('typeof userRoutes:', typeof userRoutes);
console.log('typeof recoRoutes:', typeof recoRoutes);
console.log('typeof advancedRecoRoutes:', typeof advancedRecoRoutes);
console.log('typeof supportRoutes:', typeof supportRoutes);

console.log('advancedRecoRoutes keys:', advancedRecoRoutes && Object.keys(advancedRecoRoutes));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api', recoRoutes);
app.use('/api/steam', advancedRecoRoutes); 
app.use('/api/advanced', advancedRecoRoutes); 
app.use('/api/support', supportRoutes);

const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});