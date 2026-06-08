const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'backend/routes/user.js');
let content = fs.readFileSync(filePath, 'utf8');

// Find all user = await User.findById(...) and insert null check
content = content.replace(/(const user = await User\.findById\([^)]+\).*?;)/g, `$1\n    if (!user) return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });`);

fs.writeFileSync(filePath, content);
console.log('Fixed user.js');
