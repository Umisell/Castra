import { useAppContext } from '../AppContext';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { 
  IconHome, IconSearch, IconBell, IconMail, IconRadio, 
  IconZap, IconBox, IconUser, IconCrown, IconBook, IconSparkles 
} from './Icons';
import { useState, useEffect } from 'react';
import { getAccountBalance, fundAccount } from '../aptosClient';
import { ThemeToggle } from './ThemeToggle';

type SidebarProps = {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
};

export const Sidebar = ({ theme, onToggleTheme }: SidebarProps) => {
  const { 
    activeNavTab, setActiveNavTab, setPremiumModalOpen, openProfile, showToast, 
    myProfile, isPremium, nodeTxCount
  } = useAppContext();
  const { connected, account, disconnect, connect, wallets } = useWallet();

  const displayUser = connected && account ? {
    name: myProfile.name === 'user' ? `${account.address.toString().substring(0, 6)} / ${account.address.toString().substring(account.address.toString().length - 4)}` : myProfile.name,
    handle: myProfile.handle === 'user' ? account.address.toString().substring(0, 8) : myProfile.handle,
    avatar: myProfile.name === 'user' ? account.address.toString().substring(0, 1).toUpperCase() : myProfile.name.substring(0, 1).toUpperCase(),
    avatarBg: isPremium ? 'var(--gold-gradient)' : 'var(--accent-gradient)'
  } : null;

  const [balance, setBalance] = useState<number | null>(null);
  const [funding, setFunding] = useState(false);

  useEffect(() => {
    if (connected && account) {
      const fetchBalance = async () => {
        const bal = await getAccountBalance(account.address.toString());
        setBalance(bal);
      };
      fetchBalance();
      const interval = setInterval(fetchBalance, 10000); // Update every 10s
      return () => clearInterval(interval);
    } else {
      setBalance(null);
    }
  }, [connected, account]);

  const handleFaucet = async () => {
    if (!connected || !account) return;
    setFunding(true);
    showToast("⏳ Requesting APT from Faucet");
    try {
      await fundAccount(account.address.toString());
      showToast("✅ 1 APT received! Pumping stats");
      const bal = await getAccountBalance(account.address.toString());
      setBalance(bal);
    } catch {
      showToast("❌ Faucet busy or failed");
    } finally {
      setFunding(false);
    }
  };

  const fmtBal = (octas: number | null) => {
    if (octas === null) return '0.00';
    return (octas / 100_000_000).toFixed(2);
  };

  const navs = [
    { id: 'home', icon: <IconHome />, label: 'Home' },
    { id: 'explore', icon: <IconSearch />, label: 'Explore' },
    { id: 'notifs', icon: <IconBell />, label: 'Notifications' },
    { id: 'messages', icon: <IconMail />, label: 'Messages' },
    { id: 'channels', icon: <IconRadio />, label: 'Channels' },
    { id: 'miniapps', icon: <IconZap />, label: 'Mini Apps' },
    { id: 'storage', icon: <IconBox />, label: 'Storage' }
  ];

  return (
    <aside className="sidebar">


      <a href="#" className="s-logo" onClick={e => e.preventDefault()}>
        <div className="s-logo-mark">
          C
        </div>
        <span className="s-logo-text">Castra</span>
      </a>
      <div className="s-theme-wrap">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
      <nav className="s-nav">
        {navs.map(n => (
          <button 
            key={n.id} 
            className={`s-nav-item ${activeNavTab === n.id ? 'active' : ''}`}
            onClick={() => { setActiveNavTab(n.id); showToast(`${n.label} tab`); }}
          >
            <span className="nav-icon">{n.icon}</span>
            <span>{n.label}</span>
          </button>
        ))}
        <div className="s-divider" />
        
        <div style={{padding: '12px 16px', background: 'rgba(0,212,180,0.05)', borderRadius: '12px', border: '1px solid rgba(0,212,180,0.1)', marginTop: '10px'}}>
          <div style={{fontSize: '11px', color: 'var(--teal)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px'}}>
            <span className="bd-live"></span> Node Contribution
          </div>
          <div style={{fontSize: '20px', fontWeight: 900, color: 'var(--text)', fontFamily: 'var(--mono)'}}>
            {nodeTxCount} <span style={{fontSize: '12px', fontWeight: 400, color: 'var(--text3)'}}>TXs</span>
          </div>
          <div style={{fontSize: '10px', color: 'var(--text3)', marginTop: '4px'}}>Pumping Testnet</div>
        </div>

        <button className="s-profile-btn" onClick={() => openProfile('me')}>
          <span className="nav-icon"><IconUser /></span><span>Profile</span>
        </button>
        <button className="s-nav-item" onClick={() => setPremiumModalOpen(true)}>
          <span className="nav-icon" style={{color: 'var(--accent)'}}><IconCrown /></span><span style={{color: 'var(--accent)'}}>Premium</span>
        </button>
        <a className="s-nav-item" href="https://docs.shelby.xyz" target="_blank" rel="noreferrer">
          <span className="nav-icon"><IconBook /></span><span>Docs</span>
        </a>
      </nav>

      <button className="s-cast-btn" onClick={() => { 
        if (!connected) {
          showToast("Connect wallet to cast");
          return;
        }
        // Focus the Composer textarea (the real posting flow)
        const composer = document.getElementById('compose-input');
        if (composer) {
          composer.scrollIntoView({ behavior: 'smooth', block: 'center' });
          composer.focus();
        }
      }}>
        <span style={{display:'flex', alignItems:'center', gap:'8px', justifyContent:'center'}}>
          <IconSparkles /> <span>Cast</span>
        </span>
      </button>

      {displayUser && (
        <div className="s-profile" onClick={() => openProfile('me')}>
          <div className="s-avatar" style={{background: displayUser.avatarBg}}>{displayUser.avatar}</div>
          <div style={{flex: 1, minWidth: 0}}>
            <div className="s-profile-name">{displayUser.name}</div>
            <div className="s-profile-handle">@{displayUser.handle}</div>
          </div>
          <div className="s-profile-more">···</div>
        </div>
      )}

      {connected && (
        <div style={{
          margin: '0 12px 12px', padding: '12px', background: 'var(--bg2)', 
          border: '1px solid var(--border)', borderRadius: '12px'
        }}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px'}}>
            <span style={{fontSize:'11px', color:'var(--text3)', fontFamily:'var(--mono)'}}>APT BALANCE</span>
            <span style={{fontSize:'12px', fontWeight:700, color:'var(--accent)'}}>{fmtBal(balance)} APT</span>
          </div>
          <button 
            onClick={handleFaucet}
            disabled={funding}
            style={{
              width: '100%', padding: '6px', borderRadius: '8px', 
              background: 'rgba(0,212,180,0.1)', border: '1px solid rgba(0,212,180,0.3)',
              color: 'var(--teal)', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
              opacity: funding ? 0.5 : 1
            }}
          >
            {funding ? 'Funding' : 'Request Faucet 💧'}
          </button>
        </div>
      )}
      
      {connected ? (
        <button className="s-disconnect-btn" onClick={disconnect}>
          Disconnect Wallet
        </button>
      ) : (
        <button 
          className="s-disconnect-btn" 
          style={{ background: 'var(--accent)', color: '#000', borderColor: 'var(--accent)' }} 
          onClick={() => {
            if (wallets && wallets.length > 0) {
              connect(wallets[0].name);
            } else {
              showToast('No Aptos wallet detected, please install Petra or Martian');
            }
          }}
        >
          Connect Wallet
        </button>
      )}
    </aside>
  );
};
