import { useState } from 'react';
import type { CastItem } from '../types';
import { useAppContext } from '../AppContext';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { CastImage } from './CastImage';
import { IconZap } from './Icons';
import { formatRelativeTime } from '../utils/time';
import { shelbyClient } from '../shelbyClient';
import { createShelbyWalletSigner } from '../utils/shelbyWalletSigner';
import { DEFAULT_BLOB_RETENTION_HOURS, getRetentionLabel, getShelbyRenewExpirationMicros } from '../utils/shelbyExpiration';

// Local SVG icons for actions to keep CastCard clean
const IconChat = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
const IconRecast = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>;
const IconHeart = ({ filled }: { filled: boolean }) => <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>;


export const CastCard = ({ cast, compact = false }: { cast: CastItem; compact?: boolean }) => {
  const [showMenu, setShowMenu] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const { users, likeCast, recastCast, openProfile, showToast, removeCast, hideCast, setReplyingToCast } = useAppContext();
  const wallet = useWallet();
  const { account } = wallet;

  const handleCopyLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(`https://castra.app/cast/${cast.id}`);
      showToast('Link copied to clipboard! 📋');
    } else {
      showToast('Clipboard not supported ❌');
    }
    setShowMenu(false);
  };

  const getRenewableBlobs = () => {
    const blobs = [
      ...(cast.shelbyBlobs || []),
      cast.image && !cast.image.startsWith('blob:') && !cast.image.startsWith('data:') ? cast.image : '',
    ].filter(Boolean).map(blobName => String(blobName).replace(/^\/?0x[a-fA-F0-9]{64}\//, ''));
    return Array.from(new Set(blobs));
  };

  const handleRenewBlobs = async () => {
    if (!account) {
      showToast('Connect wallet to renew blobs');
      return;
    }

    const blobNames = getRenewableBlobs();
    if (!blobNames.length) {
      showToast('No Shelby blob metadata found for this cast');
      return;
    }

    setRenewing(true);
    setShowMenu(false);
    try {
      const signer = createShelbyWalletSigner(wallet);
      const newExpirationMicros = getShelbyRenewExpirationMicros(cast.expirationMicros, DEFAULT_BLOB_RETENTION_HOURS);
      showToast(`Extending ${blobNames.length} blob(s) +${getRetentionLabel(DEFAULT_BLOB_RETENTION_HOURS)}`);

      for (const blobName of blobNames) {
        const response = await signer.signAndSubmitTransaction({
          data: {
            function: `${shelbyClient.coordination.deployer.toString()}::blob_metadata::increase_expiration_time`,
            functionArguments: [blobName, newExpirationMicros],
          },
        });
        await shelbyClient.coordination.aptos.waitForTransaction({ transactionHash: response.hash });
      }

      showToast(`Blob expiration extended +${getRetentionLabel(DEFAULT_BLOB_RETENTION_HOURS)}`);
    } catch (e: any) {
      console.error('CAST RENEW ERROR:', e);
      showToast(`Renew failed: ${e?.message || 'Unknown error'}`);
    } finally {
      setRenewing(false);
    }
  };

  const isOwner = account?.address?.toString() === cast.userId;
  const castUserId = String(cast.userId || 'unknown');
  
  const user = users.find(u => u.id === cast.userId) || (cast.author ? {
    id: castUserId,
    bio: '',
    followers: 0,
    following: 0,
    ...cast.author,
  } : {
    id: castUserId,
    name: castUserId.length > 20 ? `${castUserId.substring(0, 6)} / ${castUserId.substring(castUserId.length - 4)}` : castUserId,
    handle: castUserId.length > 20 ? castUserId.substring(0, 8) : castUserId,
    avatar: castUserId.charAt(0).toUpperCase(),
    avatarBg: 'var(--bg3)',
    premium: false
  });

  const handleBadgeClick = async (badgeRawHtml: string) => {
    const badgeText = String(badgeRawHtml || '').replace(/<[^>]+>/g, '').trim() || 'Badge';
    showToast(`${badgeText} badge verification is not backed by an on-chain resource yet`);
  };

  const fmt = (n?: number) => {
    const value = Number.isFinite(Number(n)) ? Number(n) : 0;
    return value >= 1000 ? (value / 1000).toFixed(1) + 'k' : value.toString();
  };

  const bodyFormatted = String(cast.body || '')
    .replace(/```tsx?([\s\S]*?)```/g, '<pre style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px;font-family:var(--mono);font-size:12px;margin:8px 0;overflow-x:auto;white-space:pre">$1</pre>')
    .replace(/\n/g, '<br/>');
  const hasBody = bodyFormatted
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, '')
    .trim().length > 0;
  const visibility = cast.visibility || 'public';
  const visibilityLabel = ({
    premium: 'Premium',
    private: 'Only me',
    allowlist: 'Allowlist',
    timelock: cast.unlockAt ? `Unlocks ${new Date(cast.unlockAt).toLocaleString()}` : 'Time Lock',
    purchasable: 'Purchasable',
    public: ''
  } as Record<string, string>)[visibility] || null;

  return (
    <div className={`cast ${compact ? 'cast-compact' : ''}`}>
      <div className="cast-avatar" style={{background: user.avatarBg}} onClick={() => openProfile(user.id)}>{user.avatar}</div>
      <div className="cast-right">
        <div className="cast-header">
          <span className="cast-name" onClick={() => openProfile(user.id)} style={{cursor: 'pointer'}}>{user.name}</span>
          {user.premium && <span className="cast-badge cb-premium" style={{cursor: 'pointer'}} onClick={(e) => { e.stopPropagation(); handleBadgeClick('Premium ♛'); }}><span>♛</span></span>}
          <span className="cast-handle">@{user.handle}</span>
          <span className="cast-dot">·</span>
          <span className="cast-time">{formatRelativeTime(cast.time)}</span>
          {cast.channel && !compact && <span className="cast-channel">/{cast.channel}</span>}
        </div>
        
        {cast.badges && cast.badges.length > 0 && (
          <div style={{marginBottom: '8px', display: 'flex', gap: '5px', flexWrap: 'wrap'}}>
            {cast.badges.map((b, i) => <span key={i} className={`cast-badge ${b.t}`} style={{cursor: 'pointer'}} onClick={(e) => { e.stopPropagation(); handleBadgeClick(b.d); }} dangerouslySetInnerHTML={{__html: b.d}} />)}
          </div>
        )}

        {visibilityLabel && !compact && (
          <div style={{ marginBottom: '8px' }}>
            <span className="cast-badge cb-net b-net">{visibilityLabel}</span>
          </div>
        )}
        
        {cast.replyTo && !compact && (
          <div style={{fontSize: '12px', color: 'var(--text2)', marginBottom: '6px'}}>
            Replying to cast
          </div>
        )}
        
        {hasBody && <div className="cast-body" dangerouslySetInnerHTML={{__html: bodyFormatted}} />}
        
        {(cast.localPreview || cast.image) && (
          <CastImage
            image={cast.localPreview || cast.image || ''}
            owner={cast.userId}
            mimeType={cast.mimeType}
            encrypted={cast.mediaEncrypted !== false}
            mediaKind={cast.mediaKind}
            mediaFormat={cast.mediaFormat}
          />
        )}
        
        {cast.embed && (
          <div className="cast-media">
            <div className="cast-media-embed">
              <div className="cme-icon">{cast.embed.icon}</div>
              <div>
                <div className="cme-title">{cast.embed.title}</div>
                <div className="cme-url">{cast.embed.url}</div>
              </div>
            </div>
          </div>
        )}

        {cast.miniapp && (
          <div className="cast-mini-app">
            <div className="cma-header">
              <div className="cma-icon">{cast.miniapp.icon}</div>
              <span className="cma-name">{cast.miniapp.name}</span>
              <span className="cma-badge">mini app</span>
            </div>
            <div className="cma-body">
              <div className="cma-body-inner">
                <div className="cma-title">{cast.miniapp.title}</div>
                <div className="cma-desc">{cast.miniapp.desc}</div>
                <button className="cma-btn" onClick={() => showToast(`Opening ${cast.miniapp!.name}`)}>
                  {cast.miniapp.btn}
                </button>
              </div>
            </div>
          </div>
        )}
        
        <div className="cast-actions">
          <button className="ca" onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setReplyingToCast(cast);
          }}>
            <span className="ca-icon"><IconChat /></span><span className="ca-num">{fmt(cast.replies)}</span>
          </button>
          <button className={`ca ${cast.recasted ? 'recasted' : ''}`} onClick={() => recastCast(cast.id)}>
            <span className="ca-icon"><IconRecast /></span><span className="ca-num">{fmt(cast.recasts)}</span>
          </button>
          <button className={`ca ${cast.liked ? 'liked' : ''}`} onClick={() => likeCast(cast.id)}>
            <span className="ca-icon"><IconHeart filled={cast.liked} /></span><span className="ca-num">{fmt(cast.likes)}</span>
          </button>
          <button className="ca" onClick={() => showToast('Zap payments are not implemented on-chain yet')}><span className="ca-icon"><IconZap /></span></button>
          
          <div style={{position: 'relative', marginLeft: 'auto'}}>
            <button className="ca-more" onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}>···</button>
            {showMenu && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, width: '160px', 
                background: 'var(--bg2)', border: '1px solid var(--border)', 
                borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', 
                zIndex: 100, overflow: 'hidden'
              }}>
                <div className="menu-item" onClick={handleCopyLink} style={{padding: '10px 14px', fontSize: '13px', cursor: 'pointer'}}>Copy Link</div>
                <div className="menu-item" onClick={() => { hideCast(cast.id); setShowMenu(false); }} style={{padding: '10px 14px', fontSize: '13px', cursor: 'pointer'}}>Hide from Feed</div>
                {isOwner && (
                  <>
                    <div className="menu-item" onClick={handleRenewBlobs} style={{padding: '10px 14px', fontSize: '13px', cursor: renewing ? 'default' : 'pointer'}}>
                      {renewing ? 'Renewing...' : 'Renew +48h'}
                    </div>
                    <div className="menu-item" onClick={() => { removeCast(cast.id); setShowMenu(false); }} style={{padding: '10px 14px', fontSize: '13px', cursor: 'pointer', color: 'var(--red)'}}>Delete Cast</div>
                  </>
                )}
                <div className="menu-item" onClick={() => { window.open(`https://explorer.shelby.xyz/testnet/blob/${cast.id}`, '_blank'); setShowMenu(false); }} style={{padding: '10px 14px', fontSize: '13px', cursor: 'pointer', borderTop: '1px solid var(--border)'}}>View on Shelby</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
