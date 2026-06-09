const fs = require('fs');
const glob = require('glob'); // npm install glob
const path = require('path');

const files = [
    'c:/Users/wngks/auraproject/backend/routes/user.js',
    'c:/Users/wngks/auraproject/backend/routes/support.js',
    'c:/Users/wngks/auraproject/backend/routes/notifications.js',
    'c:/Users/wngks/auraproject/backend/controllers/recommendController.js',
    'c:/Users/wngks/auraproject/backend/controllers/recoController.js'
];

files.forEach(file => {
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');
    
    // catch (err) { ... }
    // catch (error) { ... }
    content = content.replace(/catch\s*\(\s*([a-zA-Z0-9_]+)\s*\)\s*\{([\s\S]*?)\}/g, (match, errVar, body) => {
        if (!body.includes('console.error')) {
            return `catch (${errVar}) {\n        console.error('API Error:', ${errVar});${body}}`;
        }
        return match;
    });

    fs.writeFileSync(file, content);
    console.log('Processed', file);
});
