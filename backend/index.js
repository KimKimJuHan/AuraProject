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

const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const recoRoutes = require('./routes/recoRoutes');
const advancedRecoRoutes = require('./routes/recommend');

const app = express();
const PORT = process.env.PORT || 8000;

// 환경 변수 기반 URL 설정. 기본값은 로컬(localhost)
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(session({
    secret: process.env.SESSION_SECRET || 'secret_key_aura',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, maxAge: 1000 * 60 * 60 * 24 }
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
    callbackURL: "/api/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ googleId: profile.id });
        const googleName = profile.displayName || `구글유저_${profile.id.substring(0, 4)}`;
        const googleEmail = (profile.emails && profile.emails.length > 0) ? profile.emails[0].value : 'no-email@google.com';
        const googleAvatar = (profile.photos && profile.photos.length > 0) ? profile.photos[0].value : '';

        if (!user) {
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
    callbackURL: "/api/auth/naver/callback"
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ naverId: profile.id });
        const naverName = profile.displayName || (profile._json && profile._json.nickname) || (profile._json && profile._json.name) || `네이버유저_${profile.id.substring(0, 4)}`;
        const naverEmail = (profile.emails && profile.emails.length > 0 && profile.emails[0].value) || (profile._json && profile._json.email) || 'no-email@naver.com';
        const naverAvatar = profile.profileImage || (profile._json && profile._json.profile_image) || '';

        if (!user) {
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

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api', recoRoutes);
app.use('/api/steam', advancedRecoRoutes); 
app.use('/api/advanced', advancedRecoRoutes); 

const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});