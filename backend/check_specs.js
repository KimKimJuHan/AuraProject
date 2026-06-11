require('dotenv').config();
const mongoose = require('mongoose');

async function checkSpecs() {
  await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const Game = require('./models/Game');

  const total = await Game.countDocuments();
  const withSpecs = await Game.countDocuments({ 'pc_requirements.minimum': { $exists: true, $ne: null, $ne: "" } });
  
  console.log(`Total Games: ${total}`);
  console.log(`Games with PC Specs: ${withSpecs}`);
  
  const sampleMissing = await Game.findOne({ $or: [
    { 'pc_requirements': { $exists: false } },
    { 'pc_requirements.minimum': { $exists: false } },
    { 'pc_requirements.minimum': null },
    { 'pc_requirements.minimum': "" }
  ]}).select('title title_ko');
  
  console.log('Sample game without specs:', sampleMissing);
  
  process.exit(0);
}

checkSpecs().catch(console.error);
