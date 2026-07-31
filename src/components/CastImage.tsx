import { Suspense, lazy, useState, useEffect } from 'react';
import { shelbyClient } from '../shelbyClient';
import { useAppContext } from '../AppContext';
import { decryptData } from '../utils/encryption';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { canReadBlobOnChain } from '../aptosClient';

const ShelbyVideoPlayer = lazy(() =>
  import('@shelby-protocol/player').then((mod) => ({ default: mod.VideoPlayer })),
);

interface CastImageProps {
  image: string;
  owner?: string;
  mimeType?: string;
  encrypted?: boolean;
  mediaKind?: 'image' | 'video' | 'stream';
  mediaFormat?: 'shelby-blob' | 'hls' | 'dash' | 'raw';
}

const getMimeType = (filename: string, providedMime?: string) => {
  if (providedMime) return providedMime;
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'm3u8') return 'application/vnd.apple.mpegurl';
  if (ext === 'mpd') return 'application/dash+xml';
  if (ext === 'mp4') return 'video/mp4';
  if (ext === 'webm') return 'video/webm';
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'png') return 'image/png';
  return 'image/jpeg';
};

const deadMediaKey = (owner: string, image: string) => `castra_dead_media:${owner}:${image}`;

const isNotFoundError = (error: any) => {
  const message = error?.message || String(error);
  const status = error?.status || error?.response?.status;
  return status === 404 || message.includes('404') || message.toLowerCase().includes('not found');
};

export const CastImage = ({ image, owner, mimeType, encrypted = true, mediaKind, mediaFormat }: CastImageProps) => {
  const { encryptionKey } = useAppContext();
  const { account } = useWallet();
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
    setSrc(null);

    if (image.startsWith('http') || image.startsWith('data:') || image.startsWith('blob:')) {
      setSrc(image);
      return;
    }

    if ((image.includes('.i_') || image.includes('.f_') || image.includes('.img_')) && owner) {
      if (sessionStorage.getItem(deadMediaKey(owner, image)) === '1') {
        setError(true);
        setLoading(false);
        return;
      }

      const fetchImage = async (retries = 2) => {
        if (!owner || !image) return;

        setLoading(true);
        setRetryCount(2 - retries);
        const timeoutId = window.setTimeout(() => undefined, 30000);

        try {
          const viewer = account?.address?.toString();
          if (viewer) {
            const allowedByProtocol = await canReadBlobOnChain({ owner, viewer, blobName: image });
            if (!allowedByProtocol) {
              throw new Error('Access denied by on-chain Castra permission');
            }
          }

          const downloaded = await Promise.race([
            shelbyClient.download({ account: owner, blobName: image }),
            new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Download timeout')), 10000)),
          ]);

          if (!downloaded || !downloaded.readable) {
            throw new Error('Stream invalid or empty');
          }

          const buffer = await new Response(downloaded.readable).arrayBuffer();
          window.clearTimeout(timeoutId);

          let finalBuffer: Uint8Array = new Uint8Array(buffer);
          if (encrypted && image.includes('.i_') && encryptionKey) {
            try {
              finalBuffer = await decryptData(finalBuffer, encryptionKey);
            } catch (e) {
              console.debug(`Decryption failed for ${image}, trying raw`, e);
            }
          }

          const blobBytes = finalBuffer.buffer.slice(
            finalBuffer.byteOffset,
            finalBuffer.byteOffset + finalBuffer.byteLength,
          ) as ArrayBuffer;
          const blob = new Blob([blobBytes], { type: getMimeType(image, mimeType) });
          setSrc(URL.createObjectURL(blob));
          setLoading(false);
        } catch (e: any) {
          window.clearTimeout(timeoutId);

          if (isNotFoundError(e)) {
            sessionStorage.setItem(deadMediaKey(owner, image), '1');
            setError(true);
            setLoading(false);
            return;
          }

          if (retries > 0) {
            window.setTimeout(() => fetchImage(retries - 1), 1500);
          } else {
            console.debug(`Media unavailable (${image})`, e);
            setError(true);
            setLoading(false);
          }
        }
      };

      fetchImage();
    } else {
      setLoading(false);
    }
  }, [image, owner, encryptionKey, mimeType, encrypted, account]);

  if (loading) {
    const isVideo = getMimeType(image, mimeType).startsWith('video/');
    return (
          <div className="cast-media-loading">
        <span className="spinner">Loading</span> {isVideo ? 'Preparing Shelby stream' : 'Fetching media'}
        {retryCount > 0 && <span style={{ marginLeft: '8px', color: 'var(--accent)' }}>(Retry {retryCount})</span>}
        <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.7 }}>This may take a few seconds for larger files</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="cast-media-unavailable">
        Media unavailable
      </div>
    );
  }

  if (!src) return null;

  const resolvedMime = getMimeType(image, mimeType);
  const isStream = mediaKind === 'stream' || mediaFormat === 'hls' || mediaFormat === 'dash' || resolvedMime.includes('mpegurl') || resolvedMime.includes('dash+xml');
  const isVideo = mediaKind === 'video' || isStream || resolvedMime.startsWith('video/');

  return (
    <div className="cast-media">
      {isVideo ? (
        <div className="castra-shelby-player" data-format={mediaFormat || (isStream ? 'hls' : 'raw')}>
          <Suspense fallback={<div className="cast-media-loading">Loading Shelby player</div>}>
            <ShelbyVideoPlayer
              key={src}
              src={src}
              title="Castra media"
              playsInline
              preload="metadata"
              config={{
                abr: { enabled: true },
                streaming: {
                  bufferingGoal: 20,
                  rebufferingGoal: 4,
                },
              }}
            />
          </Suspense>
        </div>
      ) : (
        <img
          src={src}
          alt="Cast content"
          style={{ width: '100%', borderRadius: '12px', border: '1px solid var(--border)', marginTop: '8px' }}
        />
      )}
    </div>
  );
};
