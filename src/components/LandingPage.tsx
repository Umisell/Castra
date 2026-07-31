import React from 'react';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { ThemeToggle } from './ThemeToggle';
import './LandingPage.css';

type LandingPageProps = {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
};

export const LandingPage: React.FC<LandingPageProps> = ({ theme, onToggleTheme }) => {
  const { connect, wallets } = useWallet();

  const handleConnect = () => {
    if (wallets && wallets.length > 0) {
      connect(wallets[0].name);
    } else {
      alert('No compatible wallet found, please install Petra Wallet');
    }
  };

  return (
    <div className="castra-landing">
      <div className="ul-nav">
        <div className="ul-logo">
          <div className="ul-logo-mark">C</div>
          <div>
            <span className="ul-logo-text">Castra</span>
            <span className="ul-logo-sub">Aptos social storage</span>
          </div>
        </div>
        <div className="ul-nav-actions">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button className="ul-connect-btn" onClick={handleConnect}>Connect Wallet</button>
        </div>
      </div>

      <div className="ul-hero">
        <div className="ul-copy">
          <div className="ul-badge">Aptos · Shelby · gated media</div>
          <h1>Castra</h1>
          <p className="ul-kicker">A polished social storage dApp for private casts, premium media, and on-chain identity</p>
          <p className="ul-desc">
            Publish encrypted content to Shelby, sync wallet identity on Aptos, and manage public or gated access from one refined interface
          </p>
          <div className="ul-actions">
            <button className="ul-btn-primary" onClick={handleConnect}>Launch app</button>
            <a href="https://explorer.aptoslabs.com/?network=testnet" target="_blank" rel="noreferrer" className="ul-btn-secondary">
              Testnet explorer
            </a>
          </div>
        </div>

        <div className="ul-product" aria-hidden="true">
          <div className="ul-product-shell">
            <div className="ul-product-top">
              <span></span>
              <span></span>
              <span></span>
              <strong>Castra Studio</strong>
            </div>
            <div className="ul-product-row active">
              <span>Private Cast</span>
              <b>Shelby blob</b>
            </div>
            <div className="ul-product-row">
              <span>Premium Media</span>
              <b>Aptos resource</b>
            </div>
            <div className="ul-product-row">
              <span>Allowlist / Time Lock</span>
              <b>Permission UI</b>
            </div>
          </div>
          <div className="ul-product-stats">
            <div><span>Chain</span><b>Aptos</b></div>
            <div><span>Storage</span><b>Shelby</b></div>
            <div><span>Mode</span><b>social</b></div>
          </div>
        </div>
      </div>

      <div className="ul-lower">
        <span>Shelby blob upload</span>
        <span>Aptos identity</span>
        <span>Permission-aware media</span>
        <span>SDK and RPC download</span>
      </div>

      <section className="ul-section">
        <div className="ul-section-head">
          <span>Built Now</span>
          <h2>Real dApp flows, not a static mockup</h2>
          <p>Castra is scoped around the parts that already work: wallet identity, encrypted social publishing, Shelby storage, and Aptos contract actions</p>
        </div>
        <div className="ul-feature-grid">
          <article className="ul-feature-card">
            <b>Encrypted Social Casts</b>
            <p>Posts and media are encrypted client-side, uploaded as Shelby blobs, then synced back into the feed</p>
            <span>Live</span>
          </article>
          <article className="ul-feature-card">
            <b>Aptos Identity</b>
            <p>Wallet connection, profile registration, likes, heartbeat, premium state, and APT balance all use Aptos Testnet flows</p>
            <span>Live</span>
          </article>
          <article className="ul-feature-card">
            <b>Permission-Aware Storage</b>
            <p>Files support private, premium, allowlist, and time-lock metadata inside the Castra UI</p>
            <span>App-layer</span>
          </article>
        </div>
      </section>

      <section className="ul-section ul-demo-section">
        <div className="ul-demo-copy">
          <span>Demo Path</span>
          <h2>What reviewers should try first</h2>
        </div>
        <div className="ul-demo-steps">
          <div><strong>01</strong><span>Connect Aptos wallet</span></div>
          <div><strong>02</strong><span>Publish an encrypted cast</span></div>
          <div><strong>03</strong><span>Upload a file to Shelby storage</span></div>
          <div><strong>04</strong><span>Check premium or heartbeat on-chain</span></div>
        </div>
      </section>

      <section className="ul-section ul-roadmap">
        <div className="ul-section-head">
          <span>Roadmap</span>
          <h2>Next protocol upgrades</h2>
        </div>
        <div className="ul-roadmap-list">
          <div><b>Native Shelby permissions</b><p>Replace app-layer access checks with official Shelby permission APIs when exposed in SDK</p></div>
          <div><b>Purchasable content</b><p>Use Shelby micropayment channels for paid unlocks and creator monetization</p></div>
          <div><b>Gas sponsorship</b><p>Add sponsored transactions so new users can cast and store content without manual gas setup</p></div>
        </div>
      </section>
    </div>
  );
};
