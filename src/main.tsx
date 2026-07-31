import React from 'react';
import ReactDOM from 'react-dom/client';
import { Buffer } from 'buffer';

if (typeof window !== 'undefined') {
  (window as any).Buffer = (window as any).Buffer || Buffer;
  
  if (!import.meta.env.DEV) {
    console.log = () => {};
    console.error = () => {};
    console.warn = () => {};
    console.debug = () => {};
    console.info = () => {};
  }
}
import App from './App.tsx';
import '@shelby-protocol/player/styles/shadcn.css';
import './index.css';
import './facebook-final.css';
import { AptosWalletAdapterProvider } from '@aptos-labs/wallet-adapter-react';
import { Network } from '@aptos-labs/ts-sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AptosCoreProvider from './AptosCoreProvider';
import { ErrorBoundary } from './components/ErrorBoundary';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AptosWalletAdapterProvider autoConnect={true} dappConfig={{ network: Network.TESTNET }}>
          <AptosCoreProvider>
            <App />
          </AptosCoreProvider>
        </AptosWalletAdapterProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
