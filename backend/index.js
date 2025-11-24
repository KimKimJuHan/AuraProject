require('dotenv').config(); 
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const axios = require('axios');
const Game = require('./models/Game'); 
const authRoutes = require('./routes/auth');
const recommendRoutes = require('./routes/recommend');

const app = express();
app.use(cors()); 
app.use(express.json());
app.set('trust proxy', true);

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("DB Error:", err));

app.use('/api/auth', authRoutes);
app.use('/api/ai-recommend', recommendRoutes);

app.get('/api/games/:id', async (req, res) => {
  try {
    const game = await Game.findOne({ slug: req.params.id });
    if (!game) return res.status(404).json({ error: "Not found" });
    res.json(game);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/recommend', async (req, res) => {
  const { tags, sortBy, page = 1, searchQuery } = req.body; 
  const limit = 15; const skip = (page - 1) * limit; 
  try {
    let filter = {};
    if (tags && tags.length > 0) filter.smart_tags = { $all: tags };
    if (searchQuery) {
        const q = searchQuery.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        filter.$or = [{ title: { $regex: q, $options: 'i' } }, { title_ko: { $regex: q, $options: 'i' } }];
    }
    let sort = { popularity: -1 }; 
    if (sortBy === 'discount') { sort = { "price_info.discount_percent": -1 }; filter["price_info.discount_percent"] = { $gt: 0 }; filter["price_info.current_price"] = { $ne: null }; } 
    else if (sortBy === 'new') { sort = { releaseDate: -1 }; filter["releaseDate"] = { $ne: null }; } 
    else if (sortBy === 'price') { sort = { "price_info.current_price": 1 }; filter["price_info.current_price"] = { $ne: null }; }

    const games = await Game.find(filter).sort(sort).skip(skip).limit(limit);
    const total = await Game.countDocuments(filter);
    res.json({ games, totalPages: Math.ceil(total / limit) });
  } catch (error) { res.status(500).json({ error: "Server Error" }); }
});

app.get('/api/search/autocomplete', async (req, res) => {
  const query = req.query.q; 
  if (!query) return res.json([]);
  const escapedQuery = query.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  try {
    const suggestions = await Game.find({
        $or: [ { title: { $regex: escapedQuery, $options: 'i' } }, { title_ko: { $regex: escapedQuery, $options: 'i' } } ]
    }).select('title title_ko slug').limit(10); 
    res.json(suggestions);
  } catch (error) { res.status(500).json({ error: "Search Error" }); }
});

app.get('/api/user/library/:steamId', async (req, res) => {
  const apiKey = process.env.STEAM_API_KEY; 
  if (!apiKey) return res.status(500).json({ error: "API Key Error" });
  try {
    const response = await axios.get(`http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${apiKey}&steamid=${req.params.steamId}&include_appinfo=true&format=json`);
    res.json(response.data.response.games || []);
  } catch (error) { res.status(500).json({ error: "Steam Error" }); }
});

app.post('/api/wishlist', async (req, res) => {
  if (!req.body.slugs) return res.status(400).json({ error: "Bad Request" });
  try {
    const games = await Game.find({ slug: { $in: req.body.slugs } });
    res.json(games);
  } catch (error) { res.status(500).json({ error: "DB Error" }); }
});

app.get('/api/user/ip', (req, res) => {
    const userIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    res.json({ ip: userIp });
});

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

app.listen(8000, () => console.log("Server started on port 8000"));