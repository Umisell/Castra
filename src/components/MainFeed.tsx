import { useAppContext } from '../AppContext';
import { Composer } from './Composer';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { Order_By } from '@shelby-protocol/sdk/browser';
import { shelbyClient } from '../shelbyClient';
import { CastCard } from './CastCard';
import { StorageView } from './StorageView';
import type { CastItem } from '../types';
import { useEffect, useState } from 'react';
import { decryptData } from '../utils/encryption';
import { aptos, canReadBlobOnChain, getAccountSnapshot, getCastraActivityCasts } from '../aptosClient';
export const MainFeed = () => {
  const { activeNavTab, feedTab, setFeedTab, casts, realCasts, setRealCasts, showToast, encryptionKey, likedIds, recastedIds, deletedIds = [], hiddenIds = [], followState, isPremium } = useAppContext();
  const { connected, account, signAndSubmitTransaction } = useWallet();
  const [syncNonce, setSyncNonce] = useState(0);
  const [expandedThreadIds, setExpandedThreadIds] = useState<Set<string>>(() => new Set());

  const accountAddress = account?.address?.toString() ?? '0x0';

  const mergeCastsById = (...lists: CastItem[][]) => {
    const merged = new Map<string, CastItem>();
    lists.flat().forEach(c => {
      const existing = merged.get(c.id);
      merged.set(c.id, existing ? { ...existing, ...c } : c);
    });
    return Array.from(merged.values());
  };

  const normalizeShelbyBlob = (blob: any) => {
    const fullName = blob.blob_name || blob.blobName || blob.name || '';
    const suffix = blob.blobNameSuffix || (typeof fullName === 'string' ? fullName.replace(/^\/?0x[a-fA-F0-9]{64}\//, '') : fullName);
    const rawExpiration = blob.expirationMicros ?? blob.expiration_micros ?? blob.expires_at ?? blob.expiresAt;
    const expirationMicros = Number(rawExpiration);
    return {
      name: suffix,
      fullName,
      owner: (blob.owner?.toString?.() || blob.owner || '').toString(),
      size: blob.size || 0,
      createdAt: blob.created_at || blob.createdAt || blob.creationMicros || Date.now(),
      expirationMicros: Number.isFinite(expirationMicros) && expirationMicros > 0 ? expirationMicros : undefined,
    };
  };


  // Global sync for ALL casts (Real Feed)
  useEffect(() => {
    let isMounted = true;

    const syncWithShelby = async () => {
      if (!connected) return;
      
      try {
        if (isMounted) showToast('⏳ Syncing with Aptos Testnet v2.1');
        
        let userBlobs: any[] = [];
        let globalBlobs: any[] = [];

        // 1. Fetch User's Own Blobs via Coordination Indexer
        try {
          userBlobs = await shelbyClient.coordination.getBlobs({
            where: { owner: { _eq: accountAddress } },
            orderBy: { created_at: Order_By.Desc },
            pagination: { limit: 50 }
          });
          // Adapt for our loop which expects .name
          userBlobs = (userBlobs || []).map(normalizeShelbyBlob);
        } catch (err) {
          console.warn("User fetch failed:", err);
        }

        if (!isMounted) return;

        // 2. Fetch Global Blobs
        try {
          globalBlobs = await shelbyClient.coordination.getBlobs({
            where: { 
              blob_name: { _like: '%/.c_%' }
            },
            orderBy: { created_at: Order_By.Desc },
            pagination: { limit: 40 }
          }) || [];
        } catch (err) {
          console.warn("Global sync failed:", err);
        }

        if (!isMounted) return;

        // Merge and deduplicate
        const allBlobs = [...userBlobs];
        globalBlobs.forEach(gb => {
          const normalized = normalizeShelbyBlob(gb);
          if (!allBlobs.find(ub => ub.fullName === normalized.fullName || ub.name === normalized.name)) {
             allBlobs.push(normalized);
          }
        });

        if (!allBlobs.length) {
          if (isMounted) {
            showToast(`ℹ️ No new casts found, keeping cached feed, user: ${userBlobs.length}, global: ${globalBlobs.length}`);
          }
          return;
        }

        if (isMounted) showToast(`🔍 Decrypting ${allBlobs.length} blobs, user: ${userBlobs.length}, global: ${globalBlobs.length}`);

        // 3. Download & Decrypt
        const fetchedCasts: CastItem[] = [];
        for (const b of allBlobs) {
          if (!isMounted) break;
          try {
            const allowedByProtocol = await canReadBlobOnChain({
              owner: b.owner,
              viewer: accountAddress,
              blobName: b.name,
            });
            if (!allowedByProtocol) {
              console.warn("Skipping protocol-protected blob:", b.name);
              continue;
            }

            // Add 10s timeout to prevent hanging
            const downloaded = await Promise.race([
              shelbyClient.download({ account: b.owner, blobName: b.name }),
              new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Download timeout')), 10000))
            ]);
            if (!downloaded || !downloaded.readable) {
              console.warn("Skipping empty/invalid download:", b.name);
              continue;
            }
            const buffer = await new Response(downloaded.readable).arrayBuffer();
            if (!isMounted) break;
            
            try {
               const rawText = new TextDecoder().decode(buffer);
               const parsed = JSON.parse(rawText);
               console.log(`📜 Parsed Cast (Unencrypted):`, parsed.id, parsed);
               const castTime = (parsed.time === 'just now' || !parsed.time) ? (b.createdAt || Date.now()) : parsed.time;
               const blobList = Array.from(new Set([b.name, ...(parsed.shelbyBlobs || []), parsed.image].filter(Boolean)));
               fetchedCasts.push({ ...parsed, id: parsed.id || b.name, userId: b.owner, time: castTime, shelbyBlobs: blobList, expirationMicros: parsed.expirationMicros || b.expirationMicros });
            } catch {
               if (encryptionKey) {
                 try {
                   const decrypted = await decryptData(new Uint8Array(buffer), encryptionKey);
                   const parsed = JSON.parse(new TextDecoder().decode(decrypted));
                   console.log(`📜 Parsed Cast (Decrypted):`, parsed.id, parsed);
                   const castTime = (parsed.time === 'just now' || !parsed.time) ? (b.createdAt || Date.now()) : parsed.time;
                   const blobList = Array.from(new Set([b.name, ...(parsed.shelbyBlobs || []), parsed.image].filter(Boolean)));
                   fetchedCasts.push({ ...parsed, id: parsed.id || b.name, userId: b.owner, time: castTime, shelbyBlobs: blobList, expirationMicros: parsed.expirationMicros || b.expirationMicros });
                 } catch (decErr: any) {
                   console.warn(`Decrypt Error for ${b.name}: ${decErr.message}`);
                 }
               } else {
                 console.warn(`No encryption key available for ${b.name}`);
               }
            }
          } catch (err: any) { 
            console.warn(`Download Error for ${b.name}: ${err.message}`);
          }
        }

        const skippedCount = allBlobs.length - fetchedCasts.length;
        if (skippedCount > 0 && isMounted) {
          console.log(`Skipped ${skippedCount} blobs (failed download or decryption)`);
        }

        if (!isMounted) return;

        const finalizedCasts = fetchedCasts.map(c => ({
          ...c,
          liked: likedIds.includes(c.id),
          recasted: recastedIds.includes(c.id),
          likes: (c.likes || 0) + (likedIds.includes(c.id) ? 1 : 0),
          recasts: (c.recasts || 0) + (recastedIds.includes(c.id) ? 1 : 0),
        }));

        const activityCasts = await getCastraActivityCasts();

        setRealCasts(prev => mergeCastsById(finalizedCasts, activityCasts, prev, casts));
        showToast(`✅ Synced ${finalizedCasts.length} casts, ${activityCasts.length} on-chain activities`);
      } catch (e: any) {
        console.error("SYNC ERROR:", e);
        if (isMounted) showToast(`❌ Sync Error: ${e.message || 'Unknown error'}`);
      }
    };

    syncWithShelby();

    return () => {
      isMounted = false;
    };
  // Sync is intentionally scoped to wallet/key changes to avoid refetching on every local interaction.
  }, [connected, accountAddress, encryptionKey, syncNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshFeed = () => {
    if (!connected) {
      showToast('Connect wallet to refresh Shelby feed');
      return;
    }
    setSyncNonce(prev => prev + 1);
  };

  const getFilteredCasts = (baseCasts: CastItem[]) => {
    if (feedTab === 'following') return baseCasts.filter(c => followState[c.userId]);
    return baseCasts; // 'home' shows all
  };

  const hasCastContent = (cast: CastItem) => {
    const text = String(cast.body || '')
      .replace(/<br\s*\/?>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, '')
      .trim();

    return Boolean(
      text ||
      cast.image ||
      cast.localPreview ||
      cast.embed ||
      cast.miniapp
    );
  };

  const canReadCast = (cast: CastItem) => {
    const visibility = cast.visibility || 'public';
    if (visibility === 'public') return true;
    if (!connected || !account) return false;
    const viewer = account.address.toString();
    if (cast.userId === viewer) return true;
    if (visibility === 'premium') return isPremium;
    if (visibility === 'allowlist') return (cast.allowlist || []).some(addr => addr.toLowerCase() === viewer.toLowerCase());
    if (visibility === 'timelock') return typeof cast.unlockAt === 'number' && Date.now() >= cast.unlockAt;
    if (visibility === 'purchasable') return false;
    return false;
  };

  const safeRealCasts = realCasts || [];
  const mergedCasts = connected
    ? mergeCastsById(safeRealCasts, casts)
    : mergeCastsById(casts, safeRealCasts);
    
  // Filter out deleted and hidden
  const filteredCasts = mergedCasts.filter(c => (
    !deletedIds.includes(c.id) &&
    !hiddenIds.includes(c.id) &&
    canReadCast(c) &&
    hasCastContent(c)
  ));

  // Sort by ID or time (assuming ID new-TIMESTAMP)
  const unifiedCasts = filteredCasts.sort((a, b) => {
    const getTime = (c: CastItem) => {
      if (typeof c.time === 'number') return c.time;
      if (c.id.startsWith('new-')) return parseInt(c.id.split('-')[1]);
      return 0;
    };
    return getTime(b) - getTime(a);
  });

  const filtered = getFilteredCasts(unifiedCasts);
  const repliesByParent = filtered.reduce((acc, cast) => {
    if (!cast.replyTo) return acc;
    const replies = acc.get(cast.replyTo) || [];
    replies.push(cast);
    acc.set(cast.replyTo, replies);
    return acc;
  }, new Map<string, CastItem[]>());

  repliesByParent.forEach((items) => {
    items.sort((a, b) => {
      const getTime = (c: CastItem) => {
        if (typeof c.time === 'number') return c.time;
        if (c.id.startsWith('new-')) return parseInt(c.id.split('-')[1]);
        return 0;
      };
      return getTime(a) - getTime(b);
    });
  });

  const parentIds = new Set(filtered.map(c => c.id));
  const threadedCasts = filtered.filter(c => !c.replyTo || !parentIds.has(c.replyTo));
  const toggleThread = (id: string) => {
    setExpandedThreadIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const renderThreadReplies = (parentId: string, depth = 1): React.ReactNode => (
    (() => {
      const replies = repliesByParent.get(parentId) || [];
      if (!replies.length) return null;

      const expanded = expandedThreadIds.has(parentId);
      return (
        <>
          <button
            className="thread-toggle"
            style={{ marginLeft: `${Math.min(54 + (depth - 1) * 22, 98)}px` }}
            onClick={() => toggleThread(parentId)}
          >
            {expanded ? 'Hide replies' : `View ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
          </button>
          {expanded && replies.map(reply => (
            <div key={reply.id} className="thread-reply" style={{ marginLeft: `${Math.min(42 + (depth - 1) * 22, 86)}px` }}>
              <CastCard cast={reply} compact />
              {renderThreadReplies(reply.id, depth + 1)}
            </div>
          ))}
        </>
      );
    })()
  );

  if (activeNavTab === 'storage') {
    return <StorageView />;
  }

  if (activeNavTab !== 'home') {
    return (
      <main className="main" style={{padding: '60px 40px', textAlign: 'center'}}>
        <div style={{fontSize: '48px', marginBottom: '20px'}}>🚧</div>
        <h2 style={{color: 'var(--text)', marginBottom: '10px'}}>{activeNavTab.toUpperCase()}</h2>
        <p style={{color: 'var(--text2)'}}>This module is currently syncing with the Aptos Testnet node</p>
        <button 
          className="cast-submit" 
          style={{marginTop: '20px', margin: '0 auto', display: 'block'}} 
          onClick={async () => {
            if (!connected || !account) {
              showToast("Wallet harus dikoneksikan dulu");
              return;
            }
            try {
              showToast(`⏳ Verifikasi status di Aptos Testnet`);
              
              // Gunakan SDK untuk query data (Safe Snapshot)
              const addressStr = account.address.toString();
              const accountData = await getAccountSnapshot(addressStr);
              console.log("Aptos Identity Sync:", accountData);

              showToast(`Syncing activity to Castra contract`);
              const { getProtocolHeartbeatPayload } = await import('../aptosClient');
              const response = await signAndSubmitTransaction(getProtocolHeartbeatPayload());

              showToast(`⏳ Menunggu konfirmasi block`);
              // Wait for transaction to be committed
              await aptos.waitForTransaction({ transactionHash: response.hash });
              
              showToast(`✅ Statistik Blockchain diperbarui! Tx: ${response.hash.substring(0,8)}`);
            } catch (e: any) {
              console.error("SDK Error:", e);
              showToast(`❌ Transaksi dibatalkan atau gagal`);
            }
          }}
        >
          Update Network Stats
        </button>
      </main>
    );
  }

  return (
    <main id="main-feed" className="main">
      <div id="feed-header" className="feed-header">
        <div className="feed-header-inner">
          <div className="feed-title-block">
            <span>Castra Feed</span>
            <strong>Social storage stream</strong>
          </div>
          <div className="feed-tabs">
            <div className={`feed-tab ${feedTab === 'home' ? 'active' : ''}`} onClick={() => setFeedTab('home')}>Home</div>
            <div className={`feed-tab ${feedTab === 'following' ? 'active' : ''}`} onClick={() => setFeedTab('following')}>Following</div>
          </div>
        </div>
      </div>

      <Composer />

      <div id="feed-content">
        {threadedCasts.map(c => (
          <div key={c.id} className="thread-block">
            <CastCard cast={c} />
            {renderThreadReplies(c.id)}
          </div>
        ))}
        
        {threadedCasts.length > 0 ? (
          <div className="load-more">
            <button className="load-more-btn" onClick={refreshFeed}>Refresh Shelby feed</button>
          </div>
        ) : (
          <div style={{padding: '60px 40px', textAlign: 'center', color: 'var(--text2)'}}>
            <p style={{marginBottom: '10px'}}>No casts found</p>
            {connected ? (
               <p style={{fontSize: '13px'}}>Searching for secure casts on Aptos Testnet</p>
            ) : (
               <p style={{fontSize: '13px'}}>Connect wallet to see real-time feed</p>
            )}
          </div>
        )}
      </div>
    </main>
  );
};
