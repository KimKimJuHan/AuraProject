const axios = require('axios');
async function test() {
  try {
    const res = await axios.post('http://localhost:5000/api/recommend/reco', {
      userId: '6a297fecb200370dad90a4d3', // admin user id from previous checks? Wait, let's just use guest first
    });
    console.log('Success:', Object.keys(res.data));
  } catch (err) {
    console.error('Error:', err.message);
    if(err.response) console.error('Response:', err.response.data);
  }
}
test();
