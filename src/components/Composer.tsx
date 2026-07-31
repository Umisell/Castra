import { useState, useRef } from 'react';
import { useAppContext } from '../AppContext';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { useUploadBlobs } from '@shelby-protocol/react';
import { shelbyClient } from '../shelbyClient';

import { IconImage, IconGif, IconLink, IconZap, IconAt, IconSparkles } from './Icons';
import { encryptData } from '../utils/encryption';
import { createShelbyWalletSigner } from '../utils/shelbyWalletSigner';
import { generateCastDraft } from '../utils/aiCast';
import { DEFAULT_BLOB_RETENTION_HOURS, getShelbyExpirationMicros } from '../utils/shelbyExpiration';

const getUploadErrorMessage = (error: any) => {
  if (!error) return 'Upload rejected';
  if (typeof error === 'string') return error;
  const nestedMessage =
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.data?.message ||
    error?.error?.message ||
    error?.message;
  if (nestedMessage) return nestedMessage;
  try {
    return JSON.stringify(error).slice(0, 220);
  } catch {
    return 'Upload rejected';
  }
};

const SHELBY_UPLOAD_TIMEOUT_MS = 12_000;
const CONTRACT_CHECK_TIMEOUT_MS = 6_000;
const PERMISSION_TX_TIMEOUT_MS = 25_000;

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> => {
  let timer: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = window.setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) window.clearTimeout(timer);
  }
};

export const Composer = () => {
  const {
    addCast, showToast, encryptionKey, replyingToCast, setReplyingToCast,
    users, incrementReplies, myProfile, incrementNodeTx, isRegistered,
    setIsRegistered
  } = useAppContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const wallet = useWallet();
  const { connected, account, connect, wallets, signAndSubmitTransaction } = wallet;
  const { mutateAsync: uploadBlobs } = useUploadBlobs({ client: shelbyClient });
  const [text, setText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [channelIdx, setChannelIdx] = useState(0);
  const [visibility, setVisibility] = useState<'public' | 'premium' | 'private' | 'allowlist' | 'timelock' | 'purchasable'>('public');
  const [allowlistInput, setAllowlistInput] = useState('');
  const [unlockAtInput, setUnlockAtInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const aiDraftRef = useRef('');
  
  const channels = ['/aptos', '/shelby', '/dev', '/nft', '/defi'];
  const channel = channels[channelIdx];
  const autoChainSyncOnCast = false;

  const cycleChannel = () => {
    setChannelIdx((prev) => (prev + 1) % channels.length);
    showToast(`Channel: ${channels[(channelIdx + 1) % channels.length]}`);
  };

  const remaining = 320 - text.length;

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      const url = URL.createObjectURL(file);
      setImagePreview(url);
    }
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAIGenerate = async () => {
    if (isSubmitting || isGenerating) return;

    setIsGenerating(true);
    showToast('Generating cast with AI');
    try {
      const generated = await generateCastDraft({
        draft: text,
        channel,
        visibility,
      });
      const cleanGenerated = generated.trim();
      aiDraftRef.current = cleanGenerated;
      setText(cleanGenerated);
      showToast('Draft ready');
    } catch (error: any) {
      showToast(`AI error: ${error?.message || 'generator failed'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const submitCast = async () => {
    const bodyText = (text.trim() || aiDraftRef.current.trim()).slice(0, 320);
    if (!bodyText && !selectedImage) return;
    setIsSubmitting(true);
    if (!connected || !account) {
      showToast("Please connect your wallet first");
      // Pick Petra wallet as default since we only installed that
      if (wallets && wallets.length > 0) {
        connect(wallets[0].name);
      }
      setIsSubmitting(false);
      return;
    }

    try {
      const activeKey = encryptionKey; 
      if (!activeKey) {
        showToast('❌ Encryption not initialized');
        setIsSubmitting(false);
        return;
      }

      const blobsToUpload: any[] = [];
      let imageBlobName = '';
      
      // 1. Prepare Image Blob
      const addressStr = account.address.toString();
      const folderName = addressStr.slice(-6);
      if (selectedImage) {
        showToast('⏳ Processing image');
        const imageBytes = new Uint8Array(await selectedImage.arrayBuffer());
        // ENCRYPTION RE-ENABLED (to make it "broken" for others)
        const imagePayload = visibility === 'public'
          ? imageBytes
          : await encryptData(imageBytes, activeKey);
        
        const originalExt = selectedImage.name.split('.').pop() || 'png';
        imageBlobName = `${folderName}/.i_${Date.now()}.${originalExt}`;
        
        const imageFile = new File([imagePayload as any], imageBlobName, { type: selectedImage.type });
        blobsToUpload.push({ 
          name: imageBlobName, 
          data: imageFile, 
          contentType: selectedImage.type, 
          indexed: true 
        });
      }

      const castId = 'new-' + Date.now();
      const jsonFileName = `${folderName}/.c_${Date.now()}`;
      const castExpirationMicros = getShelbyExpirationMicros(DEFAULT_BLOB_RETENTION_HOURS);

      // 2. Prepare Cast Payload
      const castPayload = {
        id: castId,
        userId: account.address.toString(),
        author: {
          name: myProfile.name,
          handle: myProfile.handle,
          avatar: myProfile.avatar,
          avatarBg: myProfile.avatarBg,
          premium: myProfile.premium,
        },
        time: Date.now(),
        channel: channel.replace('/', ''),
        visibility,
        allowlist: visibility === 'allowlist'
          ? allowlistInput.split(',').map(x => x.trim()).filter(Boolean)
          : undefined,
        unlockAt: visibility === 'timelock' && unlockAtInput
          ? new Date(unlockAtInput).getTime()
          : undefined,
        body: bodyText.replace(/\n/g, '<br/>'),
        image: imageBlobName || undefined,
        badges: [{ t: 'cb-net b-net', d: '<span class="bd-live"></span> live' }],
        likes: 0, replies: 0, recasts: 0, quotes: 0, liked: false, recasted: false,
        encrypted: true,
        mediaEncrypted: selectedImage ? visibility !== 'public' : undefined,
        mimeType: selectedImage?.type,
        mediaKind: selectedImage
          ? selectedImage.type.startsWith('video/')
            ? 'video'
            : 'image'
          : undefined as 'image' | 'video' | undefined,
        mediaFormat: selectedImage?.type.includes('mpegurl') || selectedImage?.name.endsWith('.m3u8')
          ? 'hls'
          : 'shelby-blob' as 'hls' | 'shelby-blob',
        shelbyBlobs: [jsonFileName, imageBlobName].filter(Boolean),
        expirationMicros: castExpirationMicros,
        replyTo: replyingToCast?.id
      };
      
      console.log("🚀 PREPARING CAST PAYLOAD:", castPayload);
      
      const jsonBlobData = new TextEncoder().encode(JSON.stringify(castPayload));
      // ENCRYPTION RE-ENABLED
      const encryptedJsonData = await encryptData(jsonBlobData, activeKey);
      
      const jsonFile = new File([encryptedJsonData as any], jsonFileName, { type: 'application/json' });
      
      blobsToUpload.push({ 
        name: jsonFile.name, 
        data: jsonFile, 
        indexed: true, 
        contentType: 'application/json' 
      });

      if (autoChainSyncOnCast) {
      // 3. Optional on-chain activity sync.
      showToast('⏳ Syncing with Aptos Protocol');
      const { getRegisterUserPayload, getProtocolHeartbeatPayload } = await import('../aptosClient');

      // Auto-register if not on-chain yet
      if (!isRegistered) {
        showToast('⛏️ Registering identity on-chain');
        try {
          await signAndSubmitTransaction(getRegisterUserPayload());
          setIsRegistered(true);
          incrementNodeTx();
        } catch (e) {
          console.error("Registration failed:", e);
          // Continue anyway, maybe it's just a lag
        }
      }

      // Record activity sync for stats.
      try {
        await signAndSubmitTransaction(getProtocolHeartbeatPayload());
        incrementNodeTx();
      } catch (e) {
        console.warn("Activity sync failed:", e);
      }

      }

      // 3. Single Batch Upload to Shelby
      showToast('⏳ Sign transaction for Shelby Storage');
      
      if (!wallet.account) {
        throw new Error("Wallet not connected correctly");
      }

      const formattedBlobs = await Promise.all(blobsToUpload.map(async (b) => ({
        blobName: b.name,
        blobData: new Uint8Array(await b.data.arrayBuffer())
      })));

      const { getAccountBalance, fundAccount } = await import('../aptosClient');
      let gasBalance = await getAccountBalance(account.address.toString());
      if (gasBalance <= 0) {
        showToast('⛽ Balance is 0, requesting Aptos Testnet faucet');
        await fundAccount(account.address.toString());
        await new Promise(resolve => setTimeout(resolve, 2500));
        gasBalance = await getAccountBalance(account.address.toString());
      }

      if (gasBalance <= 0) {
        throw new Error('Aptos Testnet faucet belum masuk. Klik Request Faucet di sidebar lalu coba Cast lagi.');
      }

      showToast('Uploading blobs to Shelby RPC');
      const uploadPromise = uploadBlobs({
        signer: createShelbyWalletSigner(wallet),
        blobs: formattedBlobs,
        expirationMicros: castExpirationMicros
      });
      uploadPromise.catch((error) => console.warn('Shelby upload finished after UI timeout or failed:', error));

      const uploadCompleted = await withTimeout(uploadPromise.then(() => true), SHELBY_UPLOAD_TIMEOUT_MS, false);

      if (!uploadCompleted) {
        showToast('Shelby masih finalizing di background. Cast ditambahkan lokal dulu.');
      }

      showToast('⛓️ Publishing permission on-chain');
      const { aptos, getPublishCastPermissionsPayload, isCastraContractDeployed } = await import('../aptosClient');
      const contractReady = await withTimeout(isCastraContractDeployed(), CONTRACT_CHECK_TIMEOUT_MS, false);
      const permissionAllowlist = visibility === 'allowlist'
        ? allowlistInput.split(',').map(x => x.trim()).filter(Boolean)
        : [];
      const permissionUnlockAt = visibility === 'timelock' && unlockAtInput
        ? new Date(unlockAtInput).getTime()
        : 0;

      const permissionBlobs = [jsonFileName, imageBlobName].filter(Boolean);
      if (contractReady && uploadCompleted) {
        const permissionTx = await signAndSubmitTransaction(getPublishCastPermissionsPayload({
          castId,
          blobNames: permissionBlobs,
          visibility,
          allowlist: permissionAllowlist,
          unlockAt: permissionUnlockAt,
        }));
        await withTimeout(
          aptos.waitForTransaction({ transactionHash: permissionTx.hash }),
          PERMISSION_TX_TIMEOUT_MS,
          undefined as any,
        );
        incrementNodeTx();
      } else if (!contractReady) {
        showToast('Cast uploaded. Testnet contract belum deploy, permission on-chain dilewati.');
      } else {
        showToast('Permission on-chain dilewati sampai Shelby upload selesai.');
      }
      
      incrementNodeTx();
      
      addCast({
        ...castPayload,
        localPreview: imagePreview || undefined
      });
      if (replyingToCast) {
        incrementReplies(replyingToCast.id);
      }
      setText('');
      aiDraftRef.current = '';
      setVisibility('public');
      setAllowlistInput('');
      setUnlockAtInput('');
      removeImage();
      setReplyingToCast(null);
      showToast('🚀 Cast Posted Successfully!');
    } catch(e: any) {
      console.error("SHELBY UPLOAD ERROR:", e);
      showToast(`❌ Error: ${getUploadErrorMessage(e)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="composer">
      <div className="composer-avatar" style={{background: myProfile.avatarBg}}>{myProfile.name.substring(0,1).toUpperCase()}</div>
      <div className="composer-right">
        {replyingToCast && (() => {
          const u = users.find(x => x.id === replyingToCast.userId);
          const handle = u ? u.handle : replyingToCast.userId.substring(0,6);
          return (
            <div style={{fontSize: '12px', color: 'var(--text2)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px'}}>
              <span>Replying to <strong style={{color: 'var(--accent3)'}}>@{handle}</strong></span>
              <button onClick={() => setReplyingToCast(null)} style={{background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '14px', lineHeight: 1}}>✕</button>
            </div>
          );
        })()}
        <textarea 
          className="composer-input" 
          id="compose-input" 
          placeholder={connected ? "What's casting?" : "Connect wallet to cast"} 
          rows={2} 
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        {imagePreview && (
          <div className="composer-preview">
            {selectedImage?.type.startsWith('video/') ? (
              <video src={imagePreview} controls />
            ) : (
              <img src={imagePreview} alt="Preview" />
            )}
            <button 
              onClick={removeImage}
              className="composer-preview-remove"
            >
              ✕
            </button>
          </div>
        )}

        {(visibility === 'allowlist' || visibility === 'timelock' || visibility === 'purchasable') && (
          <div style={{ marginTop: '8px', display: 'grid', gap: '8px' }}>
            {visibility === 'allowlist' && (
              <input
                value={allowlistInput}
                onChange={(e) => setAllowlistInput(e.target.value)}
                placeholder="Allowed wallet addresses, separated by commas"
                style={{
                  width: '100%',
                  padding: '9px 10px',
                  background: 'var(--bg2)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--text)',
                  fontSize: '13px'
                }}
              />
            )}
            {visibility === 'timelock' && (
              <input
                type="datetime-local"
                value={unlockAtInput}
                onChange={(e) => setUnlockAtInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 10px',
                  background: 'var(--bg2)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--text)',
                  fontSize: '13px'
                }}
              />
            )}
            {visibility === 'purchasable' && (
              <div style={{ padding: '9px 10px', background: 'rgba(240,192,64,.08)', border: '1px solid rgba(240,192,64,.22)', borderRadius: '8px', color: 'var(--gold)', fontSize: '12px' }}>
                Purchasable requires Shelby micropayment channel integration and is not enabled yet
              </div>
            )}
          </div>
        )}

        <div className="composer-bottom">
          <div className="composer-tools">
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{display:'none'}} 
              accept="image/*,video/*" 
              onChange={handleImageSelect}
            />
            <button className="c-tool" title="Add image" onClick={() => fileInputRef.current?.click()}><IconImage /></button>
            <button className="c-tool" title="Add GIF"><IconGif /></button>
            <button className="c-tool" title="Add link"><IconLink /></button>
            <button className="c-tool" title="Add mini app"><IconZap /></button>
            <button className="c-tool" title="Mention"><IconAt /></button>
            <button
              className="c-tool"
              title="Generate cast with AI"
              onClick={handleAIGenerate}
              disabled={isGenerating || isSubmitting}
              style={{ color: 'var(--accent)', marginLeft: 'auto', opacity: isGenerating ? 0.6 : 1 }}
            >
              <IconSparkles />
            </button>
          </div>
          <div className="composer-actions">
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as 'public' | 'premium' | 'private' | 'allowlist' | 'timelock' | 'purchasable')}
              title="Cast permission"
              style={{
                background: 'var(--bg2)',
                color: 'var(--text2)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '6px 8px',
                fontSize: '12px',
                fontFamily: 'var(--font)'
              }}
            >
              <option value="public">Public</option>
              <option value="premium">Premium</option>
              <option value="allowlist">Allowlist</option>
              <option value="timelock">Time Lock</option>
              <option value="purchasable" disabled>Purchasable</option>
              <option value="private">Only me</option>
            </select>
            <div className="c-channel" onClick={cycleChannel}>{channel}</div>
            <span className="c-char" style={{color: remaining < 20 ? '#ef4444' : remaining < 50 ? '#febc2e' : 'var(--text3)'}}>
              {remaining}
            </span>
            {!connected ? (
              <button className="cast-submit" onClick={() => wallets && connect(wallets[0].name)}>Connect</button>
            ) : (
              <button 
                className="cast-submit" 
                id="cast-btn" 
                onClick={submitCast} 
                disabled={isSubmitting || isGenerating || (!text.trim() && !selectedImage)}
              >
                {isSubmitting ? 'Casting' : 'Cast'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
