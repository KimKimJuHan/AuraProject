const fs = require('fs');

function extractUseEffects(filePath) {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf8');
    const regex = /useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*(\[.*?\])\);/g;
    let match;
    console.log(`\n=== ${filePath} ===`);
    while ((match = regex.exec(content)) !== null) {
        console.log(`\nDeps: ${match[2]}`);
        console.log(`Body excerpt: ${match[1].substring(0, 100).trim()}...`);
    }
}

extractUseEffects('c:/Users/wngks/auraproject/frontend/src/ShopPage.js');
extractUseEffects('c:/Users/wngks/auraproject/frontend/src/MyPage.js');
