import { useState, useEffect, useRef, useCallback } from 'react';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { useUploadBlobs } from '@shelby-protocol/react';
import { shelbyClient } from '../shelbyClient';
import { useAppContext } from '../AppContext';
import { Order_By, ShelbyBlobClient } from '@shelby-protocol/sdk/browser';
import { encryptData, decryptData } from '../utils/encryption';
import { CASTRA_CONTRACT_ADDRESS } from '../aptosClient';
import { createShelbyWalletSigner } from '../utils/shelbyWalletSigner';
import {
  DEFAULT_BLOB_RETENTION_HOURS,
  getRetentionLabel,
  getShelbyExpirationMicros,
  getShelbyRenewExpirationMicros,
  getTimeUntilExpirationLabel,
  getVaultStatus,
  type ShelbyRetentionHours,
  type ShelbyVaultMode,
} from '../utils/shelbyExpiration';

interface BlobEntry {
  name: string;
  owner: string;
  size?: number;
  createdAt?: string | number;
  visibility?: 'public' | 'premium' | 'private' | 'allowlist' | 'timelock' | 'purchasable';
  allowlist?: string[];
  unlockAt?: number;
  expirationMicros?: number;
  isWritten?: boolean;
}

const getFileIcon = (name?: string) => {
  const ext = (name || '').split('.').pop()?.toLowerCase() ?? '';
  if (['mp4', 'webm', 'mov'].includes(ext)) return '🎬';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'].includes(ext)) return '🖼️';
  if (['mp3', 'ogg', 'wav'].includes(ext)) return '🎵';
  if (['pdf'].includes(ext)) return '📄';
  if (['json', 'txt', 'md'].includes(ext)) return '📝';
  return '📦';
};

const formatBytes = (bytes?: number) => {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const formatTime = (ts?: string | number) => {
  if (!ts) return '—';
  const d = new Date(typeof ts === 'number' ? ts : ts);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

const getBlobDisplayName = (name: string) => {
  const fileName = name.split('/').pop() || name;
  if (fileName.startsWith('.c_')) return `Cast payload ${fileName.replace('.c_', '#')}`;
  if (fileName.startsWith('.i_')) return `Cast media ${fileName.replace('.i_', '#')}`;
  if (fileName.startsWith('.f_')) return fileName.replace(/^\.f_(public|premium|private|allowlist|timelock|purchasable)_\d+_/, '').replace(/^\.f_\d+_/, '');
  return fileName;
};

const getBlobKind = (name: string) => {
  const fileName = name.split('/').pop() || name;
  if (fileName.startsWith('.c_')) return 'cast';
  if (fileName.startsWith('.i_')) return 'media';
  if (fileName.endsWith('.permission.json')) return 'permission';
  if (fileName.startsWith('.f_')) return 'file';
  return 'blob';
};

const getBlobVisibility = (name: string): BlobEntry['visibility'] => {
  const fileName = name.split('/').pop() || name;
  if (fileName.startsWith('.f_premium_')) return 'premium';
  if (fileName.startsWith('.f_private_')) return 'private';
  if (fileName.startsWith('.f_allowlist_')) return 'allowlist';
  if (fileName.startsWith('.f_timelock_')) return 'timelock';
  if (fileName.startsWith('.f_purchasable_')) return 'purchasable';
  return 'public';
};

const normalizeAddress = (address?: unknown) => {
  if (!address) return '';
  if (typeof address === 'string') return address.toLowerCase();
  if (typeof address === 'object' && address !== null && 'toString' in address) {
    return String((address as { toString: () => string }).toString()).toLowerCase();
  }
  return String(address).toLowerCase();
};

const normalizeBlobName = (blob: any) => {
  const fullName = blob.blob_name || blob.blobName || blob.name || '';
  return blob.blobNameSuffix || (typeof fullName === 'string' ? fullName.replace(/^\/?0x[a-fA-F0-9]{64}\//, '') : String(fullName));
};

const canAccessBlob = (blob: BlobEntry, viewerAddress?: string, isPremiumViewer = false) => {
  const viewer = normalizeAddress(viewerAddress);
  const owner = normalizeAddress(blob.owner);
  if (viewer && owner === viewer) return true;
  if (getBlobKind(blob.name) === 'permission') return false;

  const visibility = blob.visibility || 'public';
  if (visibility === 'public') return true;
  if (visibility === 'premium') return isPremiumViewer;
  if (visibility === 'allowlist') return (blob.allowlist || []).some(addr => normalizeAddress(addr) === viewer);
  if (visibility === 'timelock') return typeof blob.unlockAt === 'number' && Date.now() >= blob.unlockAt;
  return false;
};

const getExpirationMicros = (blob: any) => {
  const raw = blob.expirationMicros ?? blob.expiration_micros ?? blob.expires_at ?? blob.expiresAt;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const getVaultTone = (status: string) => {
  if (status === 'expired') return { color: 'var(--danger)', bg: 'rgba(244,63,94,.10)', border: 'rgba(244,63,94,.25)' };
  if (status === 'renew-soon') return { color: 'var(--gold)', bg: 'rgba(245,158,11,.10)', border: 'rgba(245,158,11,.28)' };
  if (status === 'healthy') return { color: 'var(--teal)', bg: 'rgba(20,184,166,.10)', border: 'rgba(20,184,166,.25)' };
  return { color: 'var(--text3)', bg: 'var(--bg3)', border: 'var(--border)' };
};

const loadPermissionSidecars = async (entries: BlobEntry[]) => {
  const sidecars = entries.filter(blob => getBlobKind(blob.name) === 'permission');
  const permissions = new Map<string, Partial<BlobEntry>>();

  await Promise.all(sidecars.map(async sidecar => {
    try {
      const downloaded = await shelbyClient.download({ account: sidecar.owner, blobName: sidecar.name });
      if (!downloaded?.readable) return;
      const parsed = JSON.parse(await new Response(downloaded.readable).text());
      if (!parsed?.target) return;
      permissions.set(parsed.target, {
        visibility: parsed.visibility,
        allowlist: Array.isArray(parsed.allowlist) ? parsed.allowlist : undefined,
        unlockAt: typeof parsed.unlockAt === 'number' ? parsed.unlockAt : undefined,
      });
    } catch (error) {
      console.warn('Failed to read Shelby permission sidecar:', sidecar.name, error);
    }
  }));

  return permissions;
};

export const StorageView = () => {
  const wallet = useWallet();
  const { connected, account } = wallet;
  const { showToast, encryptionKey, isPremium } = useAppContext();
  const { mutateAsync: uploadBlobs } = useUploadBlobs({ client: shelbyClient });

  const [blobs, setBlobs] = useState<BlobEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingName, setUploadingName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [stats, setStats] = useState({ totalBlobs: 0, activeSPs: '-', readLatency: '-', totalSize: '-' });
  const [storageVisibility, setStorageVisibility] = useState<'public' | 'premium' | 'private' | 'allowlist' | 'timelock' | 'purchasable'>('private');
  const [storageRetentionHours, setStorageRetentionHours] = useState<ShelbyRetentionHours>(DEFAULT_BLOB_RETENTION_HOURS);
  const [vaultMode, setVaultMode] = useState<ShelbyVaultMode>('auto');
  const [storageAllowlist, setStorageAllowlist] = useState('');
  const [storageUnlockAt, setStorageUnlockAt] = useState('');
  const [renewingBlob, setRenewingBlob] = useState<string | null>(null);
  const autoRenewingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchBlobs = useCallback(async () => {
    if (!connected || !account) return;
    setLoading(true);
    const started = performance.now();
    try {
      const result = await shelbyClient.coordination.getBlobs({
        where: { owner: { _eq: account.address.toString() } },
        orderBy: { created_at: Order_By.Desc },
        pagination: { limit: 100 }
      });
      const mapped: BlobEntry[] = (result || []).map((b: any) => ({
        name: normalizeBlobName(b),
        owner: normalizeAddress(b.owner),
        size: b.size,
        createdAt: b.created_at || b.createdAt,
        visibility: getBlobVisibility(normalizeBlobName(b)),
        expirationMicros: getExpirationMicros(b),
        isWritten: b.isWritten ?? b.is_written,
      }));
      const permissionByTarget = await loadPermissionSidecars(mapped);
      const hydratedBlobs = mapped.map(blob => ({
        ...blob,
        ...(permissionByTarget.get(blob.name) || {}),
      }));
      const readableBlobs = hydratedBlobs
        .filter(blob => getBlobKind(blob.name) !== 'permission')
        .filter(blob => canAccessBlob(blob, account.address.toString(), isPremium));
      setBlobs(readableBlobs);
      const firstEncoding = (result?.[0] as any)?.encoding;
      const erasureN = firstEncoding?.erasure_n;
      const totalBytes = readableBlobs.reduce((sum, blob) => sum + (blob.size || 0), 0);
      setStats({
        totalBlobs: readableBlobs.length,
        activeSPs: erasureN ? String(erasureN) : '-',
        readLatency: `${Math.round(performance.now() - started)}ms`,
        totalSize: formatBytes(totalBytes),
      });
    } catch (e: any) {
      showToast(`❌ Failed to fetch blobs: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [connected, account, showToast, isPremium]);

  useEffect(() => { fetchBlobs(); }, [fetchBlobs]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || !files.length) return;
    if (!connected || !account) { showToast('Connect your wallet first'); return; }

    setUploading(true);
    setUploadProgress(0);

    try {
      const addressStr = account.address.toString();
      const folderName = addressStr.slice(-6);
      const formattedBlobs: { blobName: string; blobData: Uint8Array }[] = [];

      if (!encryptionKey) {
        showToast('❌ Encryption key not found, please unlock wallet');
        setUploading(false);
        return;
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadingName(file.name);
        setUploadProgress(Math.round((i / files.length) * 50));
        const buffer = await file.arrayBuffer();
        const safeName = file.name.replace(/\s+/g, '_');
        const blobName = `${folderName}/.f_${storageVisibility}_${Date.now()}_${safeName}`;
        const metaName = `${blobName}.permission.json`;
        
        // Encrypt the file data before uploading (back to secure mode)
        const encryptedData = await encryptData(new Uint8Array(buffer), encryptionKey);
        formattedBlobs.push({ blobName, blobData: new Uint8Array(encryptedData as any) });
        const permissionPayload = {
          target: blobName,
          visibility: storageVisibility,
          allowlist: storageVisibility === 'allowlist'
            ? storageAllowlist.split(',').map(x => x.trim()).filter(Boolean)
            : undefined,
          unlockAt: storageVisibility === 'timelock' && storageUnlockAt
            ? new Date(storageUnlockAt).getTime()
            : undefined,
        };
        formattedBlobs.push({
          blobName: metaName,
          blobData: new TextEncoder().encode(JSON.stringify(permissionPayload)),
        });
      }

      setUploadProgress(60);
      showToast(`⏳ Sign transaction to upload ${files.length} file(s)`);

      const signer = createShelbyWalletSigner(wallet);

      for (const blob of formattedBlobs) {
        await uploadBlobs({
          signer,
          blobs: [blob],
          expirationMicros: getShelbyExpirationMicros(storageRetentionHours),
          maxConcurrentUploads: 1,
        });
      }

      setUploadProgress(100);
      showToast(`✅ ${files.length} file(s) uploaded to Shelby!`);
      await fetchBlobs();
    } catch (e: any) {
      console.error('STORAGE UPLOAD ERROR:', e);
      showToast(`❌ Upload failed: ${e?.message || 'Unknown error'}`);
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadingName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRenew = useCallback(async (blob: BlobEntry, quiet = false) => {
    if (!connected || !account) {
      showToast('Connect your wallet first');
      return;
    }

    if (!canAccessBlob(blob, account.address.toString(), isPremium)) {
      showToast('Access denied by this blob permission');
      return;
    }

    setRenewingBlob(blob.name);
    if (!quiet) showToast(`Extending ${getBlobDisplayName(blob.name)} to ${getRetentionLabel(storageRetentionHours)}`);

    try {
      const signer = createShelbyWalletSigner(wallet);
      const newExpirationMicros = getShelbyRenewExpirationMicros(blob.expirationMicros, storageRetentionHours);
      const response = await signer.signAndSubmitTransaction({
        data: {
          function: `${shelbyClient.coordination.deployer.toString()}::blob_metadata::increase_expiration_time`,
          functionArguments: [blob.name, newExpirationMicros],
        },
      });

      await shelbyClient.coordination.aptos.waitForTransaction({ transactionHash: response.hash });
      setBlobs(current => current.map(item => (
        item.name === blob.name ? { ...item, expirationMicros: newExpirationMicros } : item
      )));

      showToast(`Extended +${getRetentionLabel(storageRetentionHours)} · ${response.hash.slice(0, 8)}`);
      await fetchBlobs();
    } catch (e: any) {
      console.error('RENEW BLOB ERROR:', e);
      showToast(`Renew failed: ${e?.message || 'Unknown error'}`);
    } finally {
      setRenewingBlob(null);
    }
  }, [connected, account, isPremium, wallet, showToast, storageRetentionHours, fetchBlobs]);

  useEffect(() => {
    if (vaultMode !== 'auto' || !connected || !account || blobs.length === 0) return;

    const runAutoRenew = async () => {
      if (autoRenewingRef.current) return;
      const dueBlob = blobs.find(blob => (
        canAccessBlob(blob, account.address.toString(), isPremium) &&
        getVaultStatus(blob.expirationMicros) === 'renew-soon' &&
        renewingBlob !== blob.name
      ));
      if (!dueBlob) return;

      autoRenewingRef.current = true;
      try {
        showToast(`Auto-Renew Vault found an expiring blob: ${getBlobDisplayName(dueBlob.name)}`);
        await handleRenew(dueBlob, true);
      } finally {
        autoRenewingRef.current = false;
      }
    };

    const timer = window.setInterval(runAutoRenew, 60_000);
    runAutoRenew();
    return () => window.clearInterval(timer);
  }, [vaultMode, connected, account, blobs, isPremium, renewingBlob, handleRenew, showToast]);

  const handleDownload = async (blob: BlobEntry) => {
    if (!encryptionKey) { showToast('Unlock wallet first'); return; }
    if (!canAccessBlob(blob, account?.address.toString(), isPremium)) {
      showToast('Access denied by this blob permission');
      return;
    }
    showToast(`⏳ Downloading ${blob.name.split('/').pop()}`);
    try {
      const downloaded = await shelbyClient.download({ account: blob.owner, blobName: blob.name });
      if (!downloaded || !downloaded.readable) throw new Error("No data");
      const buffer = await new Response(downloaded.readable).arrayBuffer();
      
      let finalData: Uint8Array;
      try {
        finalData = await decryptData(new Uint8Array(buffer), encryptionKey);
      } catch {
        finalData = new Uint8Array(buffer); // Fallback to raw if not encrypted
      }
      
      const url = URL.createObjectURL(new Blob([finalData as any]));
      const a = document.createElement('a');
      a.href = url;
      a.download = getBlobDisplayName(blob.name);
      a.click();
      showToast("✅ Download successful!");
    } catch (e: any) {
      showToast(`❌ Download failed: ${e.message}`);
    }
  };

  const handleDelete = async (blob: BlobEntry) => {
    if (!connected || !account) return;
    if (!window.confirm(`Delete ${blob.name}? This is permanent on-chain`)) return;
    
    showToast("⏳ Requesting deletion");
    try {
      const signer = createShelbyWalletSigner(wallet);
      const response = await signer.signAndSubmitTransaction({
        data: ShelbyBlobClient.createDeleteBlobPayload({
          deployer: shelbyClient.coordination.deployer,
          blobName: blob.name,
        }),
      });
      showToast(`✅ Deleted! Tx: ${response.hash.substring(0,8)}`);
      await fetchBlobs();
    } catch (e: any) {
      showToast(`❌ Delete failed: ${e.message}`);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleUpload(e.dataTransfer.files);
  };

  return (
    <main className="main storage-view" style={{ overflowY: 'auto', padding: '0' }}>

      {/* Header */}
      <div className="storage-hero" style={{
        padding: '20px 24px 16px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg2)', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px'
      }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🗄️ Shelby{' '}
            <em style={{ fontStyle: 'italic', color: 'var(--teal)', fontFamily: "'Instrument Serif', serif" }}>
              Storage
            </em>
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
            Decentralized hot storage · Shelby indexed metadata · {stats.activeSPs} erasure shards
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px',
            borderRadius: '999px', background: 'rgba(0,212,180,.08)', border: '1px solid rgba(0,212,180,.2)',
            color: 'var(--teal)', fontSize: '11px', fontFamily: 'var(--mono)'
          }}>
            <span className="bd-live"></span>testnet
          </span>
          <button onClick={fetchBlobs} disabled={loading} style={{
            padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--border2)',
            background: 'none', color: 'var(--text2)', fontSize: '12px', cursor: 'pointer',
            fontFamily: 'var(--font)', transition: 'all .2s', opacity: loading ? 0.5 : 1
          }}>
            {loading ? '⏳' : '↻'} Refresh
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="storage-stats" style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        borderBottom: '1px solid var(--border)', background: 'var(--bg3)'
      }}>
        {[
          { label: 'Your Blobs', value: stats.totalBlobs.toString(), icon: '📦' },
          { label: 'Total Size', value: stats.totalSize, icon: 'Σ' },
          { label: 'Fetch Latency', value: stats.readLatency, icon: 'ms' },
        ].map(s => (
          <div key={s.label} style={{ padding: '14px 20px', borderRight: '1px solid var(--border)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: '4px' }}>
              {s.icon} {s.label}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--accent)' }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '20px 24px' }}>

        {/* Upload Zone */}
        {connected ? (
          <>
          <div className="storage-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Upload settings</span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={vaultMode}
                onChange={(e) => setVaultMode(e.target.value as ShelbyVaultMode)}
                title="Auto-Renew Vault"
                style={{
                  background: 'var(--bg2)',
                  color: 'var(--text2)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '7px 10px',
                  fontSize: '12px',
                  fontFamily: 'var(--font)'
                }}
              >
                <option value="auto">Auto-Renew Vault</option>
                <option value="manual">Manual Renew</option>
              </select>
              <select
                value={storageRetentionHours}
                onChange={(e) => setStorageRetentionHours(Number(e.target.value) as ShelbyRetentionHours)}
                title="Extend by"
                style={{
                  background: 'var(--bg2)',
                  color: 'var(--text2)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '7px 10px',
                  fontSize: '12px',
                  fontFamily: 'var(--font)'
                }}
              >
                <option value={6}>Extend +6h</option>
                <option value={12}>Extend +12h</option>
                <option value={24}>Extend +24h</option>
                <option value={48}>Extend +48h max</option>
              </select>
              <select
                value={storageVisibility}
                onChange={(e) => setStorageVisibility(e.target.value as 'public' | 'premium' | 'private' | 'allowlist' | 'timelock' | 'purchasable')}
                title="Upload permission"
                style={{
                  background: 'var(--bg2)',
                  color: 'var(--text2)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '7px 10px',
                  fontSize: '12px',
                  fontFamily: 'var(--font)'
                }}
              >
                <option value="private">Only me</option>
                <option value="premium">Premium</option>
                <option value="allowlist">Allowlist</option>
                <option value="timelock">Time Lock</option>
                <option value="purchasable" disabled>Purchasable</option>
                <option value="public">Public</option>
              </select>
            </div>
          </div>
          {(storageVisibility === 'allowlist' || storageVisibility === 'timelock' || storageVisibility === 'purchasable') && (
            <div style={{ display: 'grid', gap: '8px', marginBottom: '10px' }}>
              {storageVisibility === 'allowlist' && (
                <input
                  value={storageAllowlist}
                  onChange={(e) => setStorageAllowlist(e.target.value)}
                  placeholder="Allowed wallet addresses, separated by commas"
                  style={{ width: '100%', padding: '9px 10px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '13px' }}
                />
              )}
              {storageVisibility === 'timelock' && (
                <input
                  type="datetime-local"
                  value={storageUnlockAt}
                  onChange={(e) => setStorageUnlockAt(e.target.value)}
                  style={{ width: '100%', padding: '9px 10px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '13px' }}
                />
              )}
              {storageVisibility === 'purchasable' && (
                <div style={{ padding: '9px 10px', background: 'rgba(240,192,64,.08)', border: '1px solid rgba(240,192,64,.22)', borderRadius: '8px', color: 'var(--gold)', fontSize: '12px' }}>
                  Purchasable requires Shelby micropayment channel integration and is not enabled yet
                </div>
              )}
            </div>
          )}
          <div
            className="storage-dropzone"
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !uploading && fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border2)'}`,
              borderRadius: '14px', padding: '32px', textAlign: 'center',
              cursor: uploading ? 'default' : 'pointer', marginBottom: '20px',
              background: dragOver ? 'rgba(236,72,153,.06)' : 'var(--bg2)',
              transition: 'all .2s',
            }}
          >
            {uploading ? (
              <div>
                <div style={{ fontSize: '28px', marginBottom: '10px' }}>⏳</div>
                <div style={{ fontSize: '14px', color: 'var(--text)', marginBottom: '6px', fontWeight: 600 }}>
                  Uploading to Shelby Protocol
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '12px', fontFamily: 'var(--mono)' }}>
                  {uploadingName}
                </div>
                <div style={{ height: '6px', background: 'var(--bg3)', borderRadius: '3px', overflow: 'hidden', maxWidth: '300px', margin: '0 auto' }}>
                  <div style={{
                    height: '100%', borderRadius: '3px',
                    background: 'linear-gradient(90deg, var(--accent), var(--teal))',
                    width: `${uploadProgress}%`, transition: 'width .3s ease'
                  }} />
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '8px', fontFamily: 'var(--mono)' }}>
                  {uploadProgress}% · Shelby registration and upload
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '36px', marginBottom: '12px' }}>☁️</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '6px' }}>
                  {dragOver ? 'Drop to upload' : 'Click or drag files to upload'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                  Shelbynet max 48h per call · {vaultMode === 'auto' ? 'auto-renew while open' : 'manual renew'} · Testnet
                </div>
              </div>
            )}
          </div>
          </>
        ) : (
          <div className="storage-empty-lock" style={{
            border: '2px dashed var(--border)', borderRadius: '14px',
            padding: '40px', textAlign: 'center', marginBottom: '20px', background: 'var(--bg2)'
          }}>
            <div style={{ fontSize: '28px', marginBottom: '12px' }}>🔒</div>
            <div style={{ fontSize: '14px', color: 'var(--text2)', fontWeight: 600 }}>Connect wallet to access storage</div>
            <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '6px' }}>
              Your blobs are tied to your Aptos on-chain identity
            </div>
          </div>
        )}

        <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }}
          onChange={e => handleUpload(e.target.files)} />

        {/* Blob List */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
              {loading ? 'Loading blobs' : `${blobs.length} blob${blobs.length !== 1 ? 's' : ''} on-chain`}
            </span>
            {account && (
              <span style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                {account.address.toString().slice(0, 10)}
              </span>
            )}
          </div>

          {loading && (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)', fontSize: '13px' }}>
              <div style={{ fontSize: '28px', marginBottom: '12px' }}>⏳</div>
              Fetching blobs from Shelby Protocol
            </div>
          )}

          {!loading && blobs.length === 0 && connected && (
            <div style={{
              padding: '40px', textAlign: 'center',
              background: 'var(--bg2)', borderRadius: '12px', border: '1px solid var(--border)'
            }}>
              <div style={{ fontSize: '28px', marginBottom: '12px' }}>📭</div>
              <div style={{ color: 'var(--text2)', fontSize: '14px', fontWeight: 600 }}>No blobs found</div>
              <div style={{ color: 'var(--text3)', fontSize: '12px', marginTop: '6px' }}>
                Upload files above to store them on Shelby Protocol
              </div>
            </div>
          )}

          {!loading && blobs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {blobs.map((blob, idx) => {
                const vaultStatus = getVaultStatus(blob.expirationMicros);
                const vaultTone = getVaultTone(vaultStatus);
                return (
                <div className="storage-row" key={blob.name + idx} style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 16px', borderRadius: '10px',
                  background: 'var(--bg2)', border: '1px solid var(--border)',
                  transition: 'border-color .2s',
                }}>
                  <div style={{
                    width: '38px', height: '38px', borderRadius: '8px', flexShrink: 0,
                    background: 'var(--bg3)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '18px', border: '1px solid var(--border)'
                  }}>
                    {getFileIcon(blob.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '13px', fontWeight: 600, color: 'var(--text)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}>
                      {getBlobDisplayName(blob.name)}
                    </div>
                    <div style={{
                      fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)',
                      marginTop: '2px', display: 'flex', gap: '10px', flexWrap: 'wrap'
                    }}>
                      <span>{formatBytes(blob.size)}</span>
                      <span>{getBlobKind(blob.name)}</span>
                      <span>{blob.visibility || 'public'}</span>
                      <span>Testnet</span>
                      <span>{getTimeUntilExpirationLabel(blob.expirationMicros)}</span>
                      <span>{formatTime(blob.createdAt)}</span>
                    </div>
                  </div>
                  <span style={{
                    flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '4px',
                    padding: '3px 9px', borderRadius: '999px',
                    background: vaultTone.bg, border: `1px solid ${vaultTone.border}`,
                    color: vaultTone.color, fontSize: '10px', fontFamily: 'var(--mono)'
                  }}>
                    <span className="bd-live" style={{ width: '5px', height: '5px' }}></span>{vaultStatus === 'renew-soon' ? 'renew soon' : vaultStatus}
                  </span>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <button
                      onClick={() => handleRenew(blob)}
                      disabled={renewingBlob === blob.name}
                      style={{ background: 'none', border: 'none', cursor: renewingBlob === blob.name ? 'default' : 'pointer', fontSize: '14px', opacity: renewingBlob === blob.name ? 0.45 : 1 }}
                      title={`Extend expiration to ${getRetentionLabel(storageRetentionHours)}`}
                    >
                      {renewingBlob === blob.name ? '...' : '↻'}
                    </button>
                    <button onClick={() => handleDownload(blob)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }} title="Download">💾</button>
                    <button onClick={() => handleDelete(blob)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }} title="Delete">🗑️</button>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Info Panel */}
        <div className="storage-info-panel" style={{
          marginTop: '24px', padding: '16px 20px',
          background: 'var(--bg2)', borderRadius: '12px',
          border: '1px solid var(--border)',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px'
        }}>
          {[
            { label: 'RPC Endpoint', value: 'Aptos Testnet / Shelby SDK', color: 'var(--teal)' },
            { label: 'Contract', value: CASTRA_CONTRACT_ADDRESS.substring(0,10), color: 'var(--accent)' },
            { label: 'Fetch Latency', value: stats.readLatency, color: 'var(--text)' },
            { label: 'Erasure Shards', value: stats.activeSPs, color: 'var(--text)' },
          ].map(item => (
            <div key={item.label}>
              <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: '4px' }}>
                {item.label}
              </div>
              <div style={{ fontSize: '12px', color: item.color, fontFamily: 'var(--mono)', fontWeight: 600, wordBreak: 'break-all' }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>

      </div>
    </main>
  );
};
