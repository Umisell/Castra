import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { useEffect, useState } from 'react';
import { AppProvider, useAppContext } from './AppContext';
import { IconBox, IconHome, IconSearch } from './components/Icons';
import { LandingPage } from './components/LandingPage';
import { MainFeed } from './components/MainFeed';
import { Modals } from './components/Modals';
import { RightSidebar } from './components/RightSidebar';
import { Sidebar } from './components/Sidebar';
import { ThemeToggle } from './components/ThemeToggle';
import { Toast } from './components/Toast';

type ConnectedShellProps = {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
};

const ConnectedShell = ({ theme, onToggleTheme }: ConnectedShellProps) => {
  const { account } = useWallet();
  const { activeNavTab, setActiveNavTab, myProfile, showToast } = useAppContext();
  const shortAddress = account?.address?.toString();
  const displayName = myProfile.name === 'user' && shortAddress
    ? `${shortAddress.slice(0, 6)} / ${shortAddress.slice(-4)}`
    : myProfile.name;

  const go = (tab: string) => {
    setActiveNavTab(tab);
    showToast(`${tab === 'home' ? 'Home' : tab === 'storage' ? 'Storage' : 'Explore'} tab`);
  };

  return (
    <div className="app-frame">
      <header className="fb-appbar">
        <div className="fb-appbar-left">
          <button className="fb-brand" onClick={() => go('home')} aria-label="Castra home">C</button>
          <div className="fb-search">
            <span aria-hidden="true"><IconSearch /></span>
            <input placeholder="Search Castra" />
          </div>
        </div>
        <nav className="fb-appbar-nav" aria-label="Primary">
          <button className={activeNavTab === 'home' ? 'active' : ''} onClick={() => go('home')} title="Home">
            <IconHome /><span>Home</span>
          </button>
          <button className={activeNavTab === 'explore' ? 'active' : ''} onClick={() => go('explore')} title="Explore">
            <IconSearch /><span>Explore</span>
          </button>
          <button className={activeNavTab === 'storage' ? 'active' : ''} onClick={() => go('storage')} title="Storage">
            <IconBox /><span>Storage</span>
          </button>
        </nav>
        <div className="fb-appbar-right">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <div className="fb-profile-pill">
            <span>{displayName?.slice(0, 1).toUpperCase() || 'C'}</span>
            <b>{displayName}</b>
          </div>
        </div>
      </header>
      <div className="app" id="app">
        <Sidebar theme={theme} onToggleTheme={onToggleTheme} />
        <MainFeed />
        <RightSidebar />
      </div>
    </div>
  );
};

function App() {
  const { connected } = useWallet();
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('castra_theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('castra_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  return (
    <AppProvider>
      {connected ? (
        <ConnectedShell theme={theme} onToggleTheme={toggleTheme} />
      ) : (
        <LandingPage theme={theme} onToggleTheme={toggleTheme} />
      )}
      <Modals />
      <Toast />
    </AppProvider>
  );
}

export default App;
