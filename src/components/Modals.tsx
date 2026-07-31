import { useEffect, useState } from 'react';
import { useAppContext } from '../AppContext';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { ME } from '../data';
import { IconImage, IconZap, IconAt } from './Icons';
import { formatRelativeTime } from '../utils/time';
import { aptos, getUpgradePremiumPayload, isCastraContractDeployed } from '../aptosClient';
import { useUploadBlobs } from '@shelby-protocol/react';
import { shelbyClient } from '../shelbyClient';
import { encryptData } from '../utils/encryption';
import { createShelbyWalletSigner } from '../utils/shelbyWalletSigner';
import { DEFAULT_BLOB_RETENTION_HOURS, getShelbyExpirationMicros } from '../utils/shelbyExpiration';

export const Modals = () => {
  const { 
    premiumModalOpen, profileModalUid, closeModals, users, casts, 
    followState, toggleFollow, showToast, isPremium, setIsPremium,
    replyingToCast, setReplyingToCast, addCast, incrementReplies,
    myProfile, updateMyProfile, incrementNodeTx, encryptionKey
  } = useAppContext();
  const wallet = useWallet();
  const { signAndSubmitTransaction, connected, account } = wallet;
  const { mutateAsync: uploadBlobs } = useUploadBlobs({ client: shelbyClient });

  const [replyText, setReplyText] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  const [premiumStatus, setPremiumStatus] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState(false);
  const [upgraded, setUpgraded] = useState(false);
  const [contractReady, setContractReady] = useState<boolean | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');

  useEffect(() => {
    let mounted = true;
    if (!premiumModalOpen) return;

    isCastraContractDeployed().then((ready) => {
      if (mounted) setContractReady(ready);
    });

    return () => {
      mounted = false;
    };
  }, [premiumModalOpen]);

  const handlePremiumUpgrade = async () => {
    if (!connected || !account) {
      showToast("Please connect your Aptos wallet first");
      return;
    }

    if (contractReady === false) {
      setPremiumStatus('Castra contract belum deploy di Aptos Testnet');
      showToast('Contract belum tersedia di Aptos Testnet');
      return;
    }
    
    setUpgrading(true);
    setPremiumStatus('⏳ Requesting approval for 0.1 APT Upgrade');
    
    try {
      const response = await signAndSubmitTransaction(getUpgradePremiumPayload());
      incrementNodeTx();
      
      setPremiumStatus('Waiting for Aptos Testnet confirmation');
      await aptos.waitForTransaction({ transactionHash: response.hash });
      
      const steps = [
        'Verified payment: 0.1 APT',
        'Updated UserProfile.is_premium on-chain',
        'Synced premium status in Castra',
        'Upgrade complete'
      ];
      
      let i = 0;
      const iv = setInterval(() => {
        setPremiumStatus(steps[i]);
        if (i === steps.length - 1) {
          clearInterval(iv);
          setUpgrading(false);
          setUpgraded(true);
          setIsPremium(true);
          showToast('♛ Castra Premium activated on-chain!');
        }
        i++;
      }, 1000);

    } catch (e: any) {
      console.error(e);
      setPremiumStatus(`❌ Transaction failed: ${e.message || "Rejected"}`);
      setUpgrading(false);
    }
  };


  const fmt = (n?: number) => {
    const value = Number.isFinite(Number(n)) ? Number(n) : 0;
    return value >= 1000 ? (value / 1000).toFixed(1) + 'k' : value.toString();
  };

  const renderProfile = () => {
    if (!profileModalUid) return null;
    let u = profileModalUid === 'me' ? ME : users.find(x => x.id === profileModalUid);
    if (!u) return null;

    // Overwrite 'me' with real wallet data if connected
    if (profileModalUid === 'me' && connected && account) {
      const addr = account.address.toString();
      u = {
        ...u,
        id: addr,
        name: `${addr.substring(0, 6)} / ${addr.substring(addr.length - 4)}`,
        handle: addr.substring(0, 8),
        premium: isPremium
      };
    }
    const following = followState[u.id];

    return (
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span style={{fontWeight: 700, fontSize: '17px'}}>{u.name}</span>
          <button className="modal-close" onClick={closeModals}>✕</button>
        </div>
        <div>
          <div className="prof-banner" style={{background: u.avatarBg || 'linear-gradient(135deg,#8b5cf6,#00d4b4)'}}>
            <div className="prof-avatar-lg" style={{background: u.avatarBg || 'linear-gradient(135deg,#8b5cf6,#00d4b4)'}}>{u.avatar}</div>
          </div>
          <div className="prof-actions">
            {profileModalUid !== 'me' ? (
              <button className="prof-follow-btn" onClick={() => toggleFollow(u.id)}>{following ? 'Following' : 'Follow'}</button>
            ) : (
              isEditing ? (
                <button 
                  className="prof-follow-btn" 
                  style={{background:'var(--accent)', color:'black'}}
                  onClick={() => {
                    updateMyProfile({ name: editName, bio: editBio });
                    setIsEditing(false);
                    showToast("Profile Updated! ✨");
                  }}
                >Save Profile</button>
              ) : (
                <button className="prof-follow-btn" onClick={() => {
                  setEditName(myProfile.name === 'user' ? (account?.address?.toString().substring(0,8) || '') : myProfile.name);
                  setEditBio(myProfile.bio);
                  setIsEditing(true);
                }}>Edit profile</button>
              )
            )}
          </div>
          <div className="prof-info">
            {isEditing ? (
              <div style={{padding: '10px 0'}}>
                <input 
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="Your Name"
                  style={{width:'100%', padding:'10px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text)', marginBottom:'10px', fontSize:'16px', fontWeight:700}}
                />
                <textarea 
                  value={editBio}
                  onChange={e => setEditBio(e.target.value)}
                  placeholder="Bio (What's your story?)"
                  style={{width:'100%', padding:'10px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text)', minHeight:'80px', fontSize:'14px'}}
                />
              </div>
            ) : (
              <>
                <div className="prof-name">
                  {u.name}
                  {(u.premium || isPremium) && <><span style={{color:'var(--gold)', fontSize:'18px', marginLeft: '4px'}}>♛</span><span style={{display:'inline-flex', alignItems:'center', justifyContent: 'center', gap:'4px', padding:'3px 10px', borderRadius:'999px', background:'rgba(240,192,64,.12)', border:'1px solid rgba(240,192,64,.3)', color:'var(--gold)', fontSize:'11px', fontFamily:'var(--mono)', fontWeight:600, marginLeft: '6px', lineHeight: 1}}>verified</span></>}
                </div>
                <div className="prof-handle">@{u.handle}</div>
                <div className="prof-bio">{u.bio}</div>
              </>
            )}
            <div className="prof-stats">
              <div className="prof-stat" onClick={() => showToast('Following list')}><strong>{(u.following||0).toLocaleString()}</strong> <span>following</span></div>
              <div className="prof-stat" onClick={() => showToast('Followers list')}><strong>{(u.followers||0).toLocaleString()}</strong> <span>followers</span></div>
            </div>
          </div>
          <div style={{padding: '8px 0'}}>
            {casts.filter(c => c.userId === u.id || (profileModalUid === 'me' && c.userId === 'me')).slice(0, 3).map(c => {
               const badgesHTML = (c.badges||[]).map(b => `<span class="cast-badge ${b.t}" style="font-size:9px">${b.d}</span>`).join(' ');
               return (
                 <div className="cast" style={{borderBottom: '1px solid var(--border)'}} key={c.id}>
                   <div className="cast-avatar" style={{background: u.avatarBg}}>{u.avatar}</div>
                   <div className="cast-right">
                     {badgesHTML && <div style={{marginBottom:'6px', display:'flex', gap:'4px', flexWrap:'wrap'}} dangerouslySetInnerHTML={{__html: badgesHTML}} />}
                     <div className="cast-body" style={{fontSize:'14px'}}>{String(c.body || '').replace(/<br\/>/g,' ').replace(/<[^>]+>/g,'').substring(0,140)}</div>
                     <div className="cast-actions" style={{marginTop:'6px'}}>
                       <span className="ca"><span className="ca-icon">💬</span> {fmt(c.replies)}</span>
                       <span className="ca"><span className="ca-icon">🔁</span> {fmt(c.recasts)}</span>
                       <span className="ca"><span className="ca-icon">{c.liked?'❤️':'🤍'}</span> {fmt(c.likes)}</span>
                     </div>
                   </div>
                 </div>
               );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderReplyModal = () => {
    if (!replyingToCast) return null;
    const parentUser = users.find(u => u.id === replyingToCast.userId) || {
      id: replyingToCast.userId,
      name: replyingToCast.userId.substring(0, 8),
      handle: replyingToCast.userId.substring(0, 8),
      avatar: '?',
      avatarBg: 'var(--bg3)'
    };

    const handleReply = async () => {
      if (!replyText.trim()) return;
      setIsSubmittingReply(true);

      if (!connected || !account) {
        showToast('Connect wallet to reply');
        setIsSubmittingReply(false);
        return;
      }

      if (!encryptionKey) {
        showToast('Encryption key not initialized');
        setIsSubmittingReply(false);
        return;
      }

      const addressStr = account.address.toString();
      const folderName = addressStr.slice(-6);
      const replyId = 'new-' + Date.now();
      const newCast = {
        id: replyId,
        userId: addressStr,
        author: {
          name: myProfile.name,
          handle: myProfile.handle,
          avatar: myProfile.avatar,
          avatarBg: myProfile.avatarBg,
          premium: myProfile.premium,
        },
        time: Date.now(),
        channel: replyingToCast.channel,
        visibility: replyingToCast.visibility || 'public',
        body: replyText.replace(/\n/g, '<br/>'),
        likes: 0, replies: 0, recasts: 0, quotes: 0, liked: false, recasted: false,
        replyTo: replyingToCast.id,
        encrypted: true,
      };

      try {
        const jsonData = new TextEncoder().encode(JSON.stringify(newCast));
        const encryptedJsonData = await encryptData(jsonData, encryptionKey);
        const blobName = `${folderName}/.c_${Date.now()}`;

        showToast('Uploading reply to Shelby Storage');
        await uploadBlobs({
          signer: createShelbyWalletSigner(wallet),
          blobs: [{ blobName, blobData: encryptedJsonData }],
          expirationMicros: getShelbyExpirationMicros(DEFAULT_BLOB_RETENTION_HOURS),
          maxConcurrentUploads: 1,
        });

        const { getPublishCastPermissionPayload, isCastraContractDeployed } = await import('../aptosClient');
        if (await isCastraContractDeployed()) {
          showToast('Publishing reply permission on-chain');
          const permissionTx = await signAndSubmitTransaction(getPublishCastPermissionPayload({
            castId: replyId,
            blobName,
            visibility: (replyingToCast.visibility || 'public') as any,
            allowlist: replyingToCast.allowlist || [],
            unlockAt: replyingToCast.unlockAt || 0,
            priceOctas: replyingToCast.priceOctas || 0,
          }));
          await aptos.waitForTransaction({ transactionHash: permissionTx.hash });
          incrementNodeTx();
        } else {
          showToast('Reply uploaded. Testnet contract belum deploy, permission on-chain dilewati.');
        }

        addCast(newCast as any);
        incrementReplies(replyingToCast.id);
        showToast('Reply posted to Shelby');
        setReplyText('');
        setReplyingToCast(null);
      } catch (e: any) {
        console.error('REPLY UPLOAD ERROR:', e);
        showToast(`Reply upload failed: ${e?.message || 'Unknown error'}`);
      } finally {
        setIsSubmittingReply(false);
      }
    };

    return (
      <div className="reply-modal" onClick={e => e.stopPropagation()}>
        <div className="rm-header">
          <div className="rm-tabs">
            <div className="rm-tab active">Compose</div>
            <div className="rm-tab">Drafts</div>
          </div>
          <button className="modal-close" onClick={() => setReplyingToCast(null)}>✕</button>
        </div>
        <div className="rm-body">
          <div className="rm-parent">
            <div className="rm-line"></div>
            <div className="rm-parent-avatar" style={{background: parentUser.avatarBg}}>{parentUser.avatar}</div>
            <div className="rm-parent-right">
              <div className="rm-parent-header">
                <span className="rm-parent-name">{parentUser.name}</span>
                <span className="rm-parent-handle">@{parentUser.handle} · {formatRelativeTime(replyingToCast.time)}</span>
              </div>
              <div className="rm-parent-body" dangerouslySetInnerHTML={{__html: replyingToCast.body.substring(0, 120) + (replyingToCast.body.length > 120 ? '' : '')}} />
              <div className="rm-replying-to">Replying to <strong>@{parentUser.handle}</strong></div>
            </div>
          </div>

          <div className="rm-composer">
            <div className="rm-user-avatar" style={{background: ME.avatarBg}}>{ME.avatar}</div>
            <div className="rm-composer-right">
              <textarea 
                className="rm-input" 
                placeholder="Start typing a new cast here"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                autoFocus
              />
            </div>
          </div>
        </div>
        <div className="rm-footer">
          <div className="rm-tools">
            <div className="rm-tool"><IconImage /></div>
            <div className="rm-tool"><IconZap /></div>
            <div className="rm-tool"><IconAt /></div>
          </div>
          <div className="rm-actions">
             <div style={{color: 'var(--text3)', fontSize: '13px'}}>{320 - replyText.length}</div>
             <button 
               className="rm-submit" 
               disabled={!replyText.trim() || isSubmittingReply}
               onClick={handleReply}
             >
               {isSubmittingReply ? 'Sending' : 'Reply'}
             </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className={`modal-overlay ${profileModalUid ? 'open' : ''}`} onClick={closeModals}>
        {renderProfile()}
      </div>

      <div className={`modal-overlay ${premiumModalOpen ? 'open' : ''}`} onClick={closeModals}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <span className="premium-logo premium-logo-header" aria-label="Castra Premium">
              <span className="premium-mark premium-mark-sm">
                <span className="premium-mark-crown"></span>
                <span className="premium-mark-u">U</span>
                <span className="premium-mark-node node-a"></span>
                <span className="premium-mark-node node-b"></span>
              </span>
              <span className="premium-wordmark">
                <span>Castra</span>
                <span>Premium</span>
              </span>
            </span>
            <button className="modal-close" onClick={closeModals}>✕</button>
          </div>
          <div style={{padding: '24px'}}>
            <div style={{textAlign:'center', marginBottom:'24px'}}>
              <div className="premium-logo-hero" aria-hidden="true">
                <span className="premium-mark premium-mark-lg">
                  <span className="premium-mark-crown"></span>
                  <span className="premium-mark-u">U</span>
                  <span className="premium-mark-node node-a"></span>
                  <span className="premium-mark-node node-b"></span>
                </span>
              </div>
              <div style={{fontSize:'22px', fontWeight:700, letterSpacing:'-.5px', marginBottom:'6px'}}>Upgrade to Premium</div>
              <div style={{color:'var(--text2)', fontSize:'15px'}}>Pay with APT on Aptos Testnet</div>
            </div>
            
            <div style={{background:'var(--bg2)', border:'1px solid rgba(240,192,64,.2)', borderRadius:'16px', padding:'20px', marginBottom:'20px'}}>
              <div style={{display:'flex', alignItems:'baseline', gap:'6px', marginBottom:'16px'}}>
                <span style={{fontSize:'38px', fontWeight:800, letterSpacing:'-2px', background:'linear-gradient(135deg,var(--gold),var(--gold3))', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>0.1</span>
                <span style={{color:'var(--text2)', fontSize:'15px', fontFamily:'var(--mono)'}}>APT one-time testnet upgrade</span>
              </div>
              <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
                <div style={{display:'flex', alignItems:'center', gap:'10px', fontSize:'14px'}}><span>♛</span><span>Sets premium status in the Castra Move resource</span></div>
                <div style={{display:'flex', alignItems:'center', gap:'10px', fontSize:'14px'}}><span>🗄️</span><span>Keeps using Shelby Storage through the official React upload mutation</span></div>
                <div style={{display:'flex', alignItems:'center', gap:'10px', fontSize:'14px'}}><span>⚡</span><span>Waits for Aptos Testnet transaction confirmation</span></div>
              </div>
            </div>

            {contractReady === false && (
              <div style={{marginBottom:'12px', padding:'10px 12px', borderRadius:'10px', background:'rgba(240,192,64,.08)', border:'1px solid rgba(240,192,64,.2)', color:'var(--gold)', fontSize:'12px', textAlign:'center'}}>
                Castra contract belum deploy di Aptos Testnet. Upgrade on-chain dinonaktifkan dulu.
              </div>
            )}
            
            <button 
              style={{width:'100%', padding:'14px', background:'linear-gradient(135deg,var(--gold),var(--gold2))', color:'#1a0f00', border:'none', borderRadius:'12px', fontFamily:'var(--font)', fontSize:'16px', fontWeight:700, cursor: contractReady === false ? 'not-allowed' : 'pointer', boxShadow:'0 4px 20px rgba(240,192,64,.3)', transition:'all .2s', position:'relative', overflow:'hidden', opacity: upgrading || contractReady === false ? 0.7 : 1, pointerEvents: upgrading ? 'none' : 'auto'}} 
              onClick={handlePremiumUpgrade}
              disabled={contractReady === false}
            >
              <span style={{position:'relative', zIndex:1}}>{(upgraded || isPremium) ? "♛ You're Premium!" : (connected ? "♛ Upgrade with APT" : "Connect Wallet to Upgrade")}</span>
            </button>
            
            <div style={{marginTop:'10px', textAlign:'center', fontSize:'13px', color:'var(--gold)', fontFamily:'var(--mono)', minHeight:'20px'}}>
              {premiumStatus}
            </div>
            <div style={{textAlign:'center', marginTop:'8px', fontSize:'12px', color:'var(--text3)', fontFamily:'var(--mono)'}}>Powered by useSignAndSubmitTransaction() · Aptos</div>
          </div>
        </div>
      </div>

      <div className={`modal-overlay ${replyingToCast ? 'open' : ''}`} onClick={() => setReplyingToCast(null)}>
        {renderReplyModal()}
      </div>
    </>
  );
};
