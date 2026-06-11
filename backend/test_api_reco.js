require('dotenv').config();
const mongoose = require('mongoose');
const recommendController = require('./controllers/recommendController');

async function test() {
  await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const User = require('./models/User');

  const users = await User.find({ steamId: { $ne: null } }).select('_id');
  const userId = users[users.length - 1]._id;

  const req = {
    body: {
      userId: userId,
      tags: [],
      term: ""
    }
  };
  
  const res = {
    status: (code) => res,
    json: (data) => {
      console.log('--- API Response ---');
      console.log(`comprehensive count: ${data.data.comprehensive.length}`);
      
      const compSpecs = data.data.comprehensive.map(g => !!g.pc_requirements);
      console.log('comprehensive has pc_requirements array:', compSpecs);
      
      const csGame = data.data.comprehensive.find(g => g.steam_appid === 730 || g.slug === 'steam-730');
      console.log('Is CS in comprehensive?', csGame ? 'Yes' : 'No');
      
      process.exit(0);
    }
  };

  await recommendController.getPersonalRecommendations(req, res);
}

test().catch(console.error);
