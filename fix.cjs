const fs = require('fs');
let content = fs.readFileSync('src/components/LandingPage.tsx', 'utf8');

// Fix HTML comments
content = content.replace(/<!--(.*?)-->/g, '{/* $1 */}');

// Fix string onClick handlers to functions
content = content.replace(/onClick="([^"]+)"/g, 'onClick={() => { $1 }}');

// Replace any class= with className= just in case
content = content.replace(/ class="/g, ' className="');

fs.writeFileSync('src/components/LandingPage.tsx', content);
console.log('Fixed JSX');
