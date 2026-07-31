const fs = require('fs');

// 1. Fix LandingPage.css to use .castra-theme instead of :root and body
let css = fs.readFileSync('src/components/LandingPage.css', 'utf8');

css = css.replace(/:root\s*\{/, '.castra-theme {\n  --bg:#060810;--bg2:#0b0f1e;--bg3:#111727;--surface:#141b2e;\n  --border:rgba(99,140,255,.12);--border2:rgba(99,140,255,.25);\n  --accent:#638cff;--accent2:#a47fff;--accent3:#00d4b4;\n  --gold:#f0c040;--gold2:#ffaa00;--gold3:#ffe066;\n  --text:#e8ecf8;--text2:#8b97c4;--text3:#4e5a7a;\n  --font-d:\'Syne\',sans-serif;--font-m:\'DM Mono\',monospace;--font-s:\'Instrument Serif\',serif;\n}\n/* Old root was replaced */\n.castra-ignore-root {');

css = css.replace(/body\s*\{([^}]+)\}/, '.castra-theme { $1; height: 100vh; overflow-y: auto; overflow-x: hidden; position: relative; }');
css = css.replace(/body::before\s*\{([^}]+)\}/, '.castra-theme::before { $1 }');

// Update nav position from fixed to absolute or sticky? If .castra-theme scrolls, nav should be sticky within it
css = css.replace(/nav\s*\{position:fixed;/, 'nav{position:sticky;top:0;');
// The background mesh
css = css.replace(/\.bg-mesh\s*\{position:fixed;/, '.bg-mesh{position:absolute;');
// Cursors and scroll-prog should be fixed to the viewport
// Actually, if we just make document.body.style.overflow = 'auto' in the component, we don't need to change nav to sticky!
// Let's just do that instead, it's MUCH safer and perfectly preserves the original HTML layout.

let originalCss = fs.readFileSync('src/components/LandingPage.css', 'utf8');
// But we still need to fix the :root variables colliding with the main app!
// The main app uses --bg, --accent, etc. 
// So Castra LandingPage MUST scope its variables.

// We will prepend .castra-theme to every CSS rule in LandingPage.css ? No, that's hard.
// Instead, let's prefix the variables in LandingPage.css: --c-bg, --c-accent, etc.
let prefixedCss = originalCss.replace(/--([a-z0-9-]+)/g, '--c-$1');
// Wait, `var(--bg)` becomes `var(--c-bg)`.
// Let's replace the body selector with .castra-theme
prefixedCss = prefixedCss.replace(/body\s*\{/g, '.castra-theme {');
prefixedCss = prefixedCss.replace(/body::before\s*\{/g, '.castra-theme::before {');
// :root becomes .castra-theme
prefixedCss = prefixedCss.replace(/:root\s*\{/g, '.castra-theme {');

// The fixed elements like .cur, .cur-ring need to be relative to the window, so leave them.
// But we should reset the body overflow in LandingPage.tsx instead of CSS.

fs.writeFileSync('src/components/LandingPage.css', prefixedCss);

// 2. Fix LandingPage.tsx to wrap in .castra-theme and manage body overflow
let tsx = fs.readFileSync('src/components/LandingPage.tsx', 'utf8');

tsx = tsx.replace('return (', `return (
    <div className="castra-theme">`);
tsx = tsx.replace(/<\/>\s*\);\s*};/m, '</div>\n    </>\n  );\n};');

// Also add useEffect to reset body overflow
tsx = tsx.replace('useEffect(() => {', `useEffect(() => {
    // Reset body overflow so Castra can scroll normally
    const originalOverflow = document.body.style.overflow;
    const originalHeight = document.body.style.height;
    document.body.style.overflow = 'auto';
    document.body.style.height = 'auto';
`);
tsx = tsx.replace('return () => {', `return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.height = originalHeight;`);

fs.writeFileSync('src/components/LandingPage.tsx', tsx);
console.log('Fixed CSS and TSX');
