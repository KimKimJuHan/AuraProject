const mongoose = require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users');
  const user = await User.findOne({ email: 'wngks37@naver.com' });
  const appids = user?.steamGames?.map(g => g.appid) || [];
  console.log('User has GTA V (271590):', appids.includes(271590));
  console.log('User has PUBG (578080):', appids.includes(578080));
  console.log('User has CS (730):', appids.includes(730));
  process.exit(0);
});
