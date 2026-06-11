require('dotenv').config();
const mongoose = require('mongoose');

async function test() {
  await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const User = require('./models/User');
  const Game = require('./models/Game');

  const users = await User.find({ steamId: { $ne: null } }).select('username steamGames');
  const user = users[users.length - 1]; 
  
  const hasCS = user.steamGames.find(g => g.appid === 730);
  console.log(`Has CS: ${hasCS ? 'Yes' : 'No'}`);
  
  const appIdsNum = user.steamGames.map(g => Number(g.appid)).filter(id => !isNaN(id));
  const ninAppIds = [...appIdsNum];
  
  console.log(`Includes 730? ${ninAppIds.includes(730)}`);
  
  const query = { steam_appid: { $nin: ninAppIds } };
  
  const csGames = await Game.find({ slug: 'steam-730' });
  console.log("Direct find by slug:", csGames.map(g => ({ slug: g.slug, steam_appid: g.steam_appid })));

  const returnedGames = await Game.find(query).select('steam_appid slug title');
  const returnedCS = returnedGames.filter(g => g.steam_appid === 730 || g.slug === 'steam-730');
  
  console.log("Returned CS via nin:", returnedCS);

  process.exit(0);
}

test().catch(console.error);
