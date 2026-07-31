import { useEffect, useState } from 'react';
import { useAppContext } from '../AppContext';
import { useAptBalance } from '@aptos-labs/react';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { ShelbyBlobClient } from '@shelby-protocol/sdk/browser';
import { shelbyClient } from '../shelbyClient';
import { aptos, CASTRA_CONTRACT_ADDRESS } from '../aptosClient';
import { createShelbyWalletSigner } from '../utils/shelbyWalletSigner';

export const RightSidebar = () => {
  const {
    channels,
    users,
    channelState,
    toggleChannel,
    followState,
    toggleFollow,
    showToast,
    socialBalance,
  } = useAppContext();

  const { data: aptBalance } = useAptBalance();
  const wallet = useWallet();
  const { connected, account } = wallet;

  const [stats, setStats] = useState({
    ledgerVersion: '-',
    blockHeight: '-',
    epoch: '-',
    rpcLatency: '-',
    blobCount: '-',
  });

  useEffect(() => {
    let active = true;

    const fetchRealStats = async () => {
      const started = performance.now();
      try {
        const [ledgerInfo, blobCount] = await Promise.all([
          aptos.getLedgerInfo(),
          shelbyClient.coordination.getBlobsCount({ where: {} }),
        ]);
        if (!active) return;
        setStats({
          ledgerVersion: Number(ledgerInfo.ledger_version).toLocaleString(),
          blockHeight: Number(ledgerInfo.block_height).toLocaleString(),
          epoch: Number(ledgerInfo.epoch).toLocaleString(),
          rpcLatency: `${Math.round(performance.now() - started)}ms`,
          blobCount: Number(blobCount).toLocaleString(),
        });
      } catch (e) {
        console.warn('Failed to fetch live network stats:', e);
      }
    };

    fetchRealStats();
    const id = setInterval(fetchRealStats, 15000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const handleClearAllBlobs = async () => {
    if (!connected || !account) {
      showToast('Wallet not connected');
      return;
    }

    try {
      showToast('Fetching your Shelby blobs to delete');
      const userBlobs = await shelbyClient.coordination.getBlobs({
        where: { owner: { _eq: account.address.toString() } },
        pagination: { limit: 100 },
      });

      if (!userBlobs || userBlobs.length === 0) {
        showToast('No blobs found for your account');
        return;
      }

      const blobSuffixes = userBlobs.map((b: any) => b.blobNameSuffix || b.name);
      const chunkToProcess = blobSuffixes.slice(0, 15);

      showToast(`Deleting ${chunkToProcess.length} of ${blobSuffixes.length} blobs`);

      const signer = createShelbyWalletSigner(wallet);
      const response = await signer.signAndSubmitTransaction({
        data: ShelbyBlobClient.createDeleteMultipleBlobsPayload({
          deployer: shelbyClient.coordination.deployer,
          blobNames: chunkToProcess,
        }),
      });

      showToast(`Deleted ${chunkToProcess.length} blobs, Tx: ${response.hash.substring(0, 8)}`);
      localStorage.removeItem('castra_casts');
      setTimeout(() => window.location.reload(), 1500);
    } catch (e: any) {
      console.error(e);
      showToast(`Error deleting blobs: ${e.message || 'Unknown error'}`);
    }
  };

  return (
    <aside className="right-sidebar">
      <div className="r-search">
        <span className="r-search-icon" aria-hidden="true">Search</span>
        <input className="r-search-input" placeholder="Search Castra" />
      </div>

      <div className="r-box">
        <div className="r-box-title">
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            Network
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 9px', borderRadius: '999px', background: 'rgba(0,212,180,.08)', border: '1px solid rgba(0,212,180,.2)', color: 'var(--teal)', fontSize: '11px', fontFamily: 'var(--mono)' }}>
              <span className="bd-live"></span>testnet
            </span>
          </span>
        </div>
        <div className="net-row"><span className="nr-key">ledger version</span><span className="nr-val">{stats.ledgerVersion}</span></div>
        <div className="net-row"><span className="nr-key">block height</span><span className="nr-val">{stats.blockHeight}</span></div>
        <div className="net-row"><span className="nr-key">epoch</span><span className="nr-val">{stats.epoch}</span></div>
        <div className="net-row"><span className="nr-key">RPC latency</span><span className="nr-val">{stats.rpcLatency}</span></div>
        <div className="net-row"><span className="nr-key">Shelby blobs</span><span className="nr-val blue">{stats.blobCount}</span></div>
        <div className="net-row"><span className="nr-key">contract</span><span className="nr-val dim" style={{ fontSize: '10px' }}>{CASTRA_CONTRACT_ADDRESS.substring(0, 8)} / {CASTRA_CONTRACT_ADDRESS.substring(CASTRA_CONTRACT_ADDRESS.length - 4)}</span></div>
        {connected && <div className="net-row" style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}><span className="nr-key" style={{ color: 'var(--text)' }}>Wallet APT</span><span className="nr-val blue" style={{ color: 'var(--gold)' }}>{aptBalance ? (Number(aptBalance) / 100000000).toFixed(4) : '0'} APT</span></div>}
        {connected && <div className="net-row"><span className="nr-key" style={{ color: 'var(--text)' }}>Social Token</span><span className="nr-val blue" style={{ color: 'var(--teal)' }}>{socialBalance} CAST</span></div>}
      </div>

      <div className="r-box">
        <div className="r-box-title">Channels</div>
        <div>
          {channels.length === 0 && (
            <div style={{ color: 'var(--text3)', fontSize: '13px', padding: '8px 0' }}>
              No on-chain channels configured yet
            </div>
          )}
          {channels.slice(0, 4).map(ch => (
            <div className="channel-item" key={ch.id}>
              <div className="ch-icon">{ch.icon}</div>
              <div className="ch-info">
                <div className="ch-name">{ch.name}</div>
                <div className="ch-members">{ch.members} members</div>
              </div>
              <button
                className={`ch-follow ${channelState[ch.id] ? 'following' : ''}`}
                onClick={() => toggleChannel(ch.id)}
              >
                {channelState[ch.id] ? 'Following' : 'Follow'}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="r-box">
        <div className="r-box-title">People</div>
        <div>
          {users.length === 0 && (
            <div style={{ color: 'var(--text3)', fontSize: '13px', padding: '8px 0' }}>
              Connect and sync casts to discover real users
            </div>
          )}
          {users.slice(0, 4).map(u => (
            <div className="follow-item" key={u.id}>
              <div className="fo-avatar" style={{ background: u.avatarBg }}>{u.avatar}</div>
              <div className="fo-info">
                <div className="fo-name" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  {u.name} {u.premium && <span style={{ color: 'var(--gold)', fontSize: '13px' }}>P</span>}
                </div>
                <div className="fo-handle">@{u.handle}</div>
              </div>
              <button
                className={`fo-btn ${followState[u.id] ? 'following' : 'follow'}`}
                onClick={() => toggleFollow(u.id)}
              >
                {followState[u.id] ? 'Following' : 'Follow'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {import.meta.env.DEV && (
        <div className="r-box" style={{ borderColor: 'rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.05)' }}>
          <div className="r-box-title" style={{ color: 'var(--red)' }}>Dev Tools</div>
          <button
            className="pb-btn"
            style={{ background: 'var(--red)', color: 'white', marginTop: '10px', opacity: 0.9 }}
            onClick={handleClearAllBlobs}
          >
            Trash All My Blobs
          </button>
        </div>
      )}

      <div style={{ padding: '8px 4px', fontSize: '12px', color: 'var(--text3)', lineHeight: 2 }}>
        <a href="https://docs.shelby.xyz" target="_blank" rel="noreferrer" style={{ color: 'var(--text3)', textDecoration: 'none', marginRight: '10px' }}>Shelby Docs</a>
        <a href="https://aptos.dev/en/build/sdks/ts-sdk" target="_blank" rel="noreferrer" style={{ color: 'var(--text3)', textDecoration: 'none', marginRight: '10px' }}>Aptos SDK</a>
        <a href="https://explorer.shelby.xyz" target="_blank" rel="noreferrer" style={{ color: 'var(--text3)', textDecoration: 'none' }}>Explorer</a>
        <br />© 2026 Castra Protocol
      </div>
    </aside>
  );
};
