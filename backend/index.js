require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const SteamStrategy = require('passport-steam').Strategy;

// Swagger
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

// Routes (라우터 분리 완료)
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const recoRoutes = require('./routes/recoRoutes');
const advancedRecoRoutes = require('./routes/recommend');

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Session & Passport (보안 옵션 적용)
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret_key_aura',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // HTTP 환경 로컬 개발용 (운영 배포 시 HTTPS에서 true로 변경)
        httpOnly: true, // XSS 방어
        maxAge: 1000 * 60 * 60 * 24 // 24시간
    }
}));
app.use(passport.initialize());
app.use(passport.session());

// Steam Strategy Setup
try {
    passport.use(new SteamStrategy({
        returnURL: `${process.env.BACKEND_URL || 'http://localhost:8000'}/api/auth/steam/return`,
        realm: `${process.env.BACKEND_URL || 'http://localhost:8000'}/`,
        apiKey: process.env.STEAM_WEB_API_KEY || process.env.STEAM_API_KEY
    }, (req, identifier, profile, done) => {
        process.nextTick(() => {
            profile.identifier = identifier;
            return done(null, profile);
        });
    }));
} catch (e) {
    console.error("Steam Strategy Setup Failed:", e);
}

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// Database Connection
if (process.env.MONGODB_URI) {
    mongoose.connect(process.env.MONGODB_URI)
        .then(() => console.log('✅ MongoDB Connected'))
        .catch(err => console.error('❌ DB Error:', err));
}

// Swagger Route
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// API Routes 연동
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api', recoRoutes);
app.use('/api/advanced', advancedRecoRoutes);

// Global Error Handler (반드시 라우터 마운트 하단, listen 상단에 위치)
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

// Server Start
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📄 Swagger docs at http://localhost:${PORT}/api-docs`);
});