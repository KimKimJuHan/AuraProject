require('dotenv').config(); 
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const axios = require('axios');

// Models & Routes
const Game = require('./models/Game'); 
const authRoutes = require('./routes/auth');
const recommendRoutes = require('./routes/recommend');

const app = express();
const PORT = 8000;

app.use(cors()); 
app.use(express.json());
app.set('trust proxy', true);

// MongoDB Connection
const dbUri = process.env.MONGODB_URI;
if (!dbUri) {
  console.error("❌ Error: MONGODB_URI is missing in .env");
  process.exit(1); 
}
mongoose.connect(dbUri)
  .then((conn) => console.log(`✅ MongoDB Connected: ${conn.connection.name}`))
  .catch(err => console.error("❌ MongoDB Connection Error:", err));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/ai-recommend', recommendRoutes);

// 1. Game Details API
app.get('/api/games/:id', async (req, res) => {
  try {
    const gameInfo = await Game.findOne({ slug: req.params.id });
    if (!gameInfo) return res.status(404).json({ error: "Game not found" });
    res.status(200).json(gameInfo);
  } catch (error) {
    res.status(500).json({ error: "Server Error" });
  }
});

// 2. Main/Search API (Enhanced Logic)
app.post('/api/recommend', async (req, res) => {
  const { tags, sortBy, page = 1, searchQuery } = req.body; 
  const limit = 15; 
  const skip = (page - 1) * limit; 
  
  console.log(`🔍 [Request] Query: "${searchQuery || ''}", Tags: [${tags || ''}], Sort: ${sortBy}`);

  try {
    let filter = {};
    
    // Search Filter (Case-insensitive partial match)
    if (searchQuery && searchQuery.trim() !== "") {
        const query = searchQuery.trim();
        const escapedQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        filter.$or = [
            { title: { $regex: escapedQuery, $options: 'i' } },
            { title_ko: { $regex: escapedQuery, $options: 'i' } }
        ];
    }

    // Tag Filter
    if (tags && tags.length > 0) {
      filter.smart_tags = { $in: tags }; 
    }

    // Sort Logic
    let sortRule = { popularity: -1, _id: -1 }; 
    if (sortBy === 'discount') {
        sortRule = { "price_info.discount_percent": -1, popularity: -1 };
        filter["price_info.discount_percent"] = { $gt: 0 };
    } else if (sortBy === 'new') {
        sortRule = { releaseDate: -1 }; 
    } else if (sortBy === 'price') {
        sortRule = { "price_info.current_price": 1 }; 
        filter["price_info.current_price"] = { $gte: 0 };
    }

    // Execute Query
    const totalGames = await Game.countDocuments(filter);
    let games = await Game.find(filter).sort(sortRule).skip(skip).limit(limit);

    console.log(`👉 Found ${totalGames} games (Returning ${games.length})`);

    // [Safety Fallback] If nothing found and no search query, return popular games
    if (totalGames === 0 && !searchQuery && (!tags || tags.length === 0)) {
        console.log("⚠️ No results found. Returning fallback popular games.");
        games = await Game.find({}).sort({ popularity: -1 }).limit(limit);
    }

    res.status(200).json({
      games: games,
      totalPages: Math.ceil(totalGames / limit) || 1
    });

  } catch (error) {
    console.error("❌ API Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 3. Autocomplete API
app.get('/api/search/autocomplete', async (req, res) => {
  const query = req.query.q; 
  if (!query) return res.json([]);
  const escapedQuery = query.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  try {
    const suggestions = await Game.find({
        $or: [ 
            { title: { $regex: escapedQuery, $options: 'i' } }, 
            { title_ko: { $regex: escapedQuery, $options: 'i' } } 
        ]
    }).select('title title_ko slug').limit(10); 
    res.json(suggestions);
  } catch (error) { res.status(500).json({ error: "Search Error" }); }
});

// 4. Wishlist API
app.post('/api/wishlist', async (req, res) => {
  if (!req.body.slugs) return res.status(400).json({ error: "Bad Request" });
  try {
    const games = await Game.find({ slug: { $in: req.body.slugs } });
    res.json(games);
  } catch (error) { res.status(500).json({ error: "DB Error" }); }
});

// 5. User IP API
app.get('/api/user/ip', (req, res) => {
    const userIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    res.json({ ip: userIp });
});

// 6. Vote API
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

app.listen(PORT, () => {
  console.log(`🚀 API Server Running on port ${PORT}`);
});