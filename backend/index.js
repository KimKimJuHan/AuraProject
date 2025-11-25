// backend/index.js

require('dotenv').config(); 
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const SteamStrategy = require('passport-steam').Strategy;
const jwt = require('jsonwebtoken'); 
const cookieParser = require('cookie-parser');

// ★★★ 모델 로드 (모든 History 모델 포함) ★★★
const User = require('./models/User'); 
const Game = require('./models/Game'); 
const PriceHistory = require('./models/PriceHistory'); 
const TrendHistory = require('./models/TrendHistory');
const SaleHistory = require('./models/SaleHistory');

// 라우터 로드
const authRoutes = require('./routes/auth');
const recommendRoutes = require('./routes/recommend');
const userRoutes = require('./routes/user'); 

const app = express();
const PORT = 8000;

// 환경 변수 설정
const STEAM_WEB_API_KEY = process.env.STEAM_WEB_API_KEY || process.env.STEAM_API_KEY; 
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';
const MONGODB_URI = process.env.MONGODB_URI;

// CORS 설정 (프론트엔드와 통신 허용)
app.use(cors({ origin: FRONTEND_URL, credentials: true })); 
app.use(express.json());
app.use(cookieParser()); // cookieParser 미들웨어 등록
app.set('trust proxy', true);

// 세션 설정 (스팀 로그인용)
app.use(session({
    secret: 'your_secret_key',
    resave: true,
    saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

// 스팀 전략 등록 및 DB 연동
try {
    passport.use(new SteamStrategy({
        returnURL: `${BACKEND_URL}/api/auth/steam/return`, 
        realm: BACKEND_URL,
        apiKey: STEAM_WEB_API_KEY
      },
      async function(identifier, profile, done) { 
        const steamId = identifier.split('/').pop();
        
        try {
            let user = await User.findOne({ steamId: steamId });

            if (!user) {
                return done(null, false, { message: 'Steam account not linked to any user.' });
            }

            return done(null, user);

        } catch (err) {
            console.error("Steam Passport DB Error:", err);
            return done(err);
        }
      }
    ));
} catch (e) {
    console.error("⚠️ 스팀 로그인 설정 오류 (API Key 확인 필요):", e.message);
}

// Passport Serialize/Deserialize 
passport.serializeUser((user, done) => done(null, user._id)); 
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});


// DB 연결
if (!MONGODB_URI) {
  console.error("❌ 오류: MONGODB_URI 환경 변수 없음");
} else {
  mongoose.connect(MONGODB_URI)
    .then((conn) => console.log(`✅ 몽고DB 연결 성공: ${conn.connection.name}`))
    .catch(err => console.error("❌ 몽고DB 연결 실패:", err));
}

// 라우터 등록
app.use('/api/auth', authRoutes);
app.use('/api/ai-recommend', recommendRoutes);
app.use('/api/user', userRoutes); // 유저 라우터 등록

// 1. 상세 페이지 API (가격, 트렌드, 딜 정보 통합)
app.get('/api/games/:id', async (req, res) => {
  try {
    const game = await Game.findOne({ slug: req.params.id }).lean();
    if (!game) return res.status(404).json({ error: "게임을 찾을 수 없습니다." });
    
    // ★★★ Aggregation Pipeline을 사용하여 모든 History 정보 조인 ★★★
    const aggregatedData = await Game.aggregate([
        { $match: { steam_appid: game.steam_appid } },
        
        // 1. PriceHistory (가격, 최저가) 조인
        {
            $lookup: {
                from: 'pricehistories', // 컬렉션 이름 확인 필요 (price_history 또는 pricehistories)
                localField: 'steam_appid',
                foreignField: 'steam_appid',
                as: 'price_records',
                pipeline: [{ $sort: { recordedAt: -1 } }, { $limit: 1 }]
            }
        },
        // 2. TrendHistory (트위치, 치지직) 조인
        {
            $lookup: {
                from: 'trendhistories', // 컬렉션 이름 확인 필요
                localField: 'steam_appid',
                foreignField: 'steam_appid',
                as: 'trend_records',
                pipeline: [{ $sort: { recordedAt: -1 } }, { $limit: 1 }]
            }
        },
        // 3. SaleHistory (딜 목록, 최저가 URL) 조인
        {
            $lookup: {
                from: 'salehistories', // 컬렉션 이름 확인 필요
                localField: 'steam_appid',
                foreignField: 'steam_appid',
                as: 'sale_records',
                pipeline: [{ $sort: { startDate: -1 } }, { $limit: 1 }]
            }
        },
        // 4. 필드 병합
        {
            $addFields: {
                price_info: { $arrayElemAt: ["$price_records", 0] },
                trend_info: { $arrayElemAt: ["$trend_records", 0] },
                sale_info: { $arrayElemAt: ["$sale_records", 0] }
            }
        },
        { $project: { price_records: 0, trend_records: 0, sale_records: 0 } }
    ]);
    
    const finalData = aggregatedData[0] || game; 
    
    // 5. 프론트엔드가 사용하기 쉽도록 최종 응답 데이터 구조화
    const responseData = {
        ...finalData, 
        price_info: finalData.price_info || { current_price: 0, regular_price: 0, discount_percent: 0, isFree: true },
        
        // 트위치/치지직 시청자 수 (프론트엔드가 필드 이름 그대로 사용할 수 있도록 추가)
        twitch_viewers: finalData.trend_info?.twitch_viewers || 0,
        chzzk_viewers: finalData.trend_info?.chzzk_viewers || 0,
        
        // ★ 최저가 페이지 이동 URL (SaleHistory의 store_url 우선)
        lowest_price_url: finalData.sale_info?.store_url || finalData.price_info?.store_url || `https://store.steampowered.com/app/${game.steam_appid}`,
        
        // ★ 가격 비교 목록 (SaleHistory의 itad_deals)
        all_deals: finalData.sale_info?.itad_deals || []
    };
    
    res.status(200).json(responseData);
  } catch (error) {
    console.error("❌ 상세 페이지 API 오류:", error);
    res.status(500).json({ error: "서버 내부 오류" });
  }
});

// 2. 메인/검색 페이지 API (★ 가격 통합 로직 적용)
app.post('/api/recommend', async (req, res) => {
  const { tags, sortBy, page = 1, searchQuery } = req.body; 
  const limit = 15; 
  const skip = (page - 1) * limit; 
  
  console.log(`🔍 [API 요청] Page: ${page}, Query: "${searchQuery || ''}"`);

  try {
    let filter = {};
    
    // 태그 필터
    if (tags && tags.length > 0) {
      filter.smart_tags = { $in: tags }; 
    }
    
    // 검색어 필터
    if (searchQuery && searchQuery.trim() !== "") {
        const query = searchQuery.trim();
        const escapedQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        filter.$or = [
            { title: { $regex: escapedQuery, $options: 'i' } },
            { title_ko: { $regex: escapedQuery, $options: 'i' } }
        ];
    }

    // 정렬 규칙은 기본적으로 인기도를 사용하고, Aggregation Pipeline 내에서 가격 기반 정렬을 시도합니다.
    let sortRule = { popularity: -1, _id: -1 }; 
    if (sortBy === 'new') {
        sortRule = { releaseDate: -1 }; 
    } 

    // 1차 검색 (총 개수)
    const totalGames = await Game.countDocuments(filter);

    // ★ Aggregation Pipeline을 사용하여 PriceHistory와 조인 (메인 페이지 가격 표시)
    let gamesWithPrice = await Game.aggregate([
        { $match: filter }, 
        
        // PriceHistory 컬렉션과 조인하여 최신 가격 정보를 가져옵니다.
        {
            $lookup: {
                from: 'pricehistories', // 컬렉션 이름 확인 필요
                localField: 'steam_appid',
                foreignField: 'steam_appid',
                as: 'latest_price_records',
                pipeline: [
                    { $sort: { recordedAt: -1 } }, 
                    { $limit: 1 }
                ]
            }
        },
        // 배열 형태의 latest_price_records를 단일 객체로 변환
        {
            $addFields: {
                price_info: { $arrayElemAt: ["$latest_price_records", 0] }
            }
        },
        // 정렬: 조인된 price_info를 사용하여 정렬
        {
            $sort: sortBy === 'discount' ? { 'price_info.discount_percent': -1, popularity: -1 } :
                   sortBy === 'price' ? { 'price_info.current_price': 1, popularity: -1 } :
                   sortRule // 기본 정렬
        },
        
        { $skip: skip },
        { $limit: limit },
        
        { $project: { latest_price_records: 0 } }
    ]);
      
    console.log(`👉 검색 결과: ${totalGames}개`);

    // ★ [안전장치] 결과가 0개이면, 필터 다 무시하고 인기 게임 20개 강제 반환 (Aggregation으로 재구현 필요)
    if (totalGames === 0 && !searchQuery && (!tags || tags.length === 0)) {
        console.log("⚠️ 데이터 없음 -> 인기 게임 강제 로딩");
        gamesWithPrice = await Game.aggregate([
            { $sort: { popularity: -1 } },
            { $limit: 20 },
             {
                $lookup: {
                    from: 'pricehistories', 
                    localField: 'steam_appid',
                    foreignField: 'steam_appid',
                    as: 'latest_price_records',
                    pipeline: [
                        { $sort: { recordedAt: -1 } }, 
                        { $limit: 1 }
                    ]
                }
            },
            { $addFields: { price_info: { $arrayElemAt: ["$latest_price_records", 0] } } },
            { $project: { latest_price_records: 0 } }
        ]);
    }
    
    res.status(200).json({
      games: gamesWithPrice,
      totalPages: Math.ceil(totalGames / limit) || 1
    });

  } catch (error) {
    console.error("❌ API 에러:", error);
    res.status(500).json({ error: "데이터 로딩 중 오류 발생" });
  }
});

// 3. 검색 자동완성 API (기존 로직 유지)
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

// 4. 찜 목록 (기존 로직 유지)
app.post('/api/wishlist', async (req, res) => {
  if (!req.body.slugs) return res.status(400).json({ error: "Bad Request" });
  try {
    const games = await Game.find({ slug: { $in: req.body.slugs } }).lean();
    
    const steamAppIds = games.map(g => g.steam_appid);
    
    const latestPrices = await PriceHistory.aggregate([
        { $match: { steam_appid: { $in: steamAppIds } } },
        { $sort: { recordedAt: -1 } },
        {
            $group: {
                _id: '$steam_appid',
                price_info: { $first: '$$ROOT' }
            }
        }
    ]);
    
    const finalGames = games.map(game => {
        const priceRecord = latestPrices.find(p => p._id === game.steam_appid);
        return {
            ...game,
            price_info: priceRecord?.price_info || { current_price: 0, regular_price: 0, discount_percent: 0, isFree: true }
        };
    });

    res.json(finalGames);
  } catch (error) { res.status(500).json({ error: "DB Error" }); }
});

// 5. 유저 IP (기존 로직 유지)
app.get('/api/user/ip', (req, res) => {
    const userIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    res.json({ ip: userIp });
});

// 6. 투표 (기존 로직 유지)
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

// 7. 디버그용 (기존 로직 유지)
app.get('/api/debug', async (req, res) => {
    try {
        const count = await Game.countDocuments();
        const priceCount = await PriceHistory.countDocuments();
        res.json({ 
            status: "OK",
            totalGames: count, 
            totalPriceHistory: priceCount, 
            dbName: mongoose.connection.name,
            collectionName: Game.collection.name
        });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
  console.log(`🚀 API Server Running on port ${PORT}`);
});