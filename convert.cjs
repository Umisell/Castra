const fs = require('fs');

const html = fs.readFileSync('castra.html', 'utf8');

// Extract CSS
const cssMatch = html.match(/<style>([\s\S]*?)<\/style>/);
if (cssMatch) {
  fs.writeFileSync('src/components/LandingPage.css', cssMatch[1]);
}

// Extract Body content
let bodyMatch = html.match(/<body>([\s\S]*?)<script>/);
if (bodyMatch) {
  let bodyHtml = bodyMatch[1];
  
  // Convert class= to className=
  bodyHtml = bodyHtml.replace(/class=/g, 'className=');
  // Convert onclick= to onClick=
  bodyHtml = bodyHtml.replace(/onclick=/g, 'onClick=');
  // Self close some tags
  bodyHtml = bodyHtml.replace(/<br>/g, '<br/>');
  bodyHtml = bodyHtml.replace(/<input([^>]*?)>/g, (m, p1) => {
    if (p1.endsWith('/')) return m;
    return `<input${p1} />`;
  });

  // Convert inline styles. This is hard with regex, let's do a basic conversion or remove them if possible.
  // Actually, there are many inline styles: style="width:10px;height:10px"
  bodyHtml = bodyHtml.replace(/style="([^"]*)"/g, (match, styles) => {
    const styleObj = {};
    styles.split(';').forEach(s => {
      if (!s.trim()) return;
      let [key, value] = s.split(':');
      if (key && value) {
        key = key.trim().replace(/-([a-z])/g, (g) => g[1].toUpperCase());
        styleObj[key] = value.trim();
      }
    });
    return `style={${JSON.stringify(styleObj)}}`;
  });

  // Also fix attributes like viewBox, stroke-width -> strokeWidth, etc.
  bodyHtml = bodyHtml.replace(/stroke-width/g, 'strokeWidth');
  bodyHtml = bodyHtml.replace(/stroke-linecap/g, 'strokeLinecap');
  bodyHtml = bodyHtml.replace(/stroke-linejoin/g, 'strokeLinejoin');

  // Wrap in a component
  const componentStr = `import React, { useEffect, useState } from 'react';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import './LandingPage.css';

export const LandingPage: React.FC = () => {
  const { connect, wallets } = useWallet();

  const handleConnect = (e?: React.MouseEvent) => {
    e?.preventDefault();
    if (wallets && wallets.length > 0) {
      connect(wallets[0].name);
    } else {
      alert('No wallet detected. Please install a compatible wallet.');
    }
  };

  useEffect(() => {
    // Basic port of the cursor and other vanilla JS
    const cur = document.getElementById('cur');
    const ring = document.getElementById('curRing');
    const sp = document.getElementById('scrollProg');
    const nav = document.getElementById('nav');
    
    let mx = 0, my = 0, rx = 0, ry = 0;
    const moveCur = (e: MouseEvent) => {
      mx = e.clientX; my = e.clientY;
      if(cur) { cur.style.left = mx + 'px'; cur.style.top = my + 'px'; }
    };
    document.addEventListener('mousemove', moveCur);
    
    let reqId: number;
    const aR = () => {
      rx += (mx - rx) * 0.1; ry += (my - ry) * 0.1;
      if(ring) { ring.style.left = rx + 'px'; ring.style.top = ry + 'px'; }
      reqId = requestAnimationFrame(aR);
    };
    aR();

    const hoverElems = document.querySelectorAll('a, button, .wl-item, .sf, .tc, .nc, .badge, .chip');
    const onEnter = () => {
      if(cur) { cur.style.width = '16px'; cur.style.height = '16px'; }
      if(ring) { ring.style.width = '50px'; ring.style.height = '50px'; }
    };
    const onLeave = () => {
      if(cur) { cur.style.width = '10px'; cur.style.height = '10px'; }
      if(ring) { ring.style.width = '36px'; ring.style.height = '36px'; }
    };
    hoverElems.forEach(el => {
      el.addEventListener('mouseenter', onEnter);
      el.addEventListener('mouseleave', onLeave);
    });

    const onScroll = () => {
      if(nav) nav.classList.toggle('scrolled', window.scrollY > 40);
      if(sp) sp.style.width = (window.scrollY / (document.body.scrollHeight - innerHeight) * 100) + '%';
    };
    window.addEventListener('scroll', onScroll);

    const rvObs = new IntersectionObserver(entries => entries.forEach((e, i) => {
      if(e.isIntersecting) setTimeout(() => e.target.classList.add('visible'), i * 85);
    }), { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => rvObs.observe(el));

    // Cleanup
    return () => {
      document.removeEventListener('mousemove', moveCur);
      cancelAnimationFrame(reqId);
      hoverElems.forEach(el => {
        el.removeEventListener('mouseenter', onEnter);
        el.removeEventListener('mouseleave', onLeave);
      });
      window.removeEventListener('scroll', onScroll);
      rvObs.disconnect();
    };
  }, []);

  return (
    <>
      ${bodyHtml}
    </>
  );
};
`;

  fs.writeFileSync('src/components/LandingPage.tsx', componentStr);
}

console.log("Done");
