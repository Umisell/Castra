import { createContext, useContext, useState, useEffect } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { CastItem, User, Channel } from './types';
import { USERS, CHANNELS, INITIAL_CASTS, ME } from './data';
import { deriveStaticKey } from './utils/encryption';
import { useWallet } from '@aptos-labs/wallet-adapter-react';

interface AppContextType {
  activeNavTab: string;
  setActiveNavTab: (tab: string) => void;
  feedTab: string;
  setFeedTab: (tab: string) => void;
  casts: CastItem[];
  realCasts: CastItem[];
  addCast: (cast: CastItem) => void;
  setRealCasts: Dispatch<SetStateAction<CastItem[]>>;
  likeCast: (id: string) => void;
  recastCast: (id: string) => void;
  users: User[];
  channels: Channel[];
  followState: Record<string, boolean>;
  toggleFollow: (id: string) => void;
  channelState: Record<string, boolean>;
  toggleChannel: (id: string) => void;
  toastMsg: string | null;
  showToast: (msg: string) => void;
  premiumModalOpen: boolean;
  setPremiumModalOpen: (b: boolean) => void;
  profileModalUid: string | null;
  openProfile: (uid: string) => void;
  closeModals: () => void;
  encryptionKey: CryptoKey | null;
  setEncryptionKey: (k: CryptoKey | null) => void;
  likedIds: string[];
  recastedIds: string[];
  deletedIds: string[];
  hiddenIds: string[];
  removeCast: (id: string) => void;
  hideCast: (id: string) => void;
  replyingToCast: CastItem | null;
  setReplyingToCast: (c: CastItem | null) => void;
  incrementReplies: (id: string) => void;
  nodeTxCount: number;
  incrementNodeTx: () => void;
  isPremium: boolean;
  setIsPremium: (b: boolean) => void;
  isRegistered: boolean;
  setIsRegistered: (b: boolean) => void;
  socialBalance: number;
  setSocialBalance: (n: number) => void;
  myProfile: User;
  updateMyProfile: (u: Partial<User>) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const readStorageJson = <T,>(key: string, fallback: T): T => {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return fallback;
    return JSON.parse(saved) as T;
  } catch (error) {
    console.warn(`Invalid localStorage value for ${key}, resetting it`, error);
    localStorage.removeItem(key);
    return fallback;
  }
};

const writeStorageJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value, (_key, item) => (
      typeof item === 'bigint' ? item.toString() : item
    )));
  } catch (error) {
    console.warn(`Failed to persist ${key}`, error);
  }
};

const writeStorageValue = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn(`Failed to persist ${key}`, error);
  }
};

const cleanStoredCasts = (items: CastItem[]) => items.map(c => {
  if (c.localPreview?.startsWith('blob:') || c.localPreview?.startsWith('data:') || c.image?.startsWith('blob:')) {
    return { ...c, localPreview: undefined, image: c.image?.startsWith('blob:') ? undefined : c.image };
  }
  return c;
});

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [activeNavTab, setActiveNavTab] = useState('home');
  const [feedTab, setFeedTab] = useState('home');
  const [casts, setCasts] = useState<CastItem[]>(() => {
    return cleanStoredCasts(readStorageJson<CastItem[]>('castra_casts', INITIAL_CASTS));
  });
  const [realCasts, setRealCasts] = useState<CastItem[]>(() => {
    return cleanStoredCasts(readStorageJson<CastItem[]>('castra_real_casts', []));
  });
  const [users] = useState<User[]>(USERS);
  const [channels] = useState<Channel[]>(CHANNELS);
  
  const [followState, setFollowState] = useState<Record<string, boolean>>(() => {
    return readStorageJson<Record<string, boolean>>('castra_follows', {});
  });
  const [channelState, setChannelState] = useState<Record<string, boolean>>(() => {
    return readStorageJson<Record<string, boolean>>('castra_channels', {});
  });

  useEffect(() => {
    writeStorageJson('castra_casts', casts);
  }, [casts]);

  useEffect(() => {
    writeStorageJson('castra_real_casts', realCasts);
  }, [realCasts]);

  useEffect(() => {
    writeStorageJson('castra_follows', followState);
  }, [followState]);

  useEffect(() => {
    writeStorageJson('castra_channels', channelState);
  }, [channelState]);
  
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [premiumModalOpen, setPremiumModalOpen] = useState(false);
  const [profileModalUid, setProfileModalUid] = useState<string | null>(null);
  const [nodeTxCount, setNodeTxCount] = useState(() => {
    return parseInt(localStorage.getItem('castra_node_tx') || '0');
  });

  const incrementNodeTx = () => {
    setNodeTxCount(prev => {
      const next = prev + 1;
      writeStorageValue('castra_node_tx', next.toString());
      return next;
    });
  };

  const [isPremium, setIsPremium] = useState<boolean>(() => localStorage.getItem('castra_premium') === 'true');
  const [isRegistered, setIsRegistered] = useState<boolean>(() => localStorage.getItem('castra_registered') === 'true');
  const [socialBalance, setSocialBalance] = useState<number>(0);
  const [myProfile, setMyProfile] = useState<User>(() => {
    return readStorageJson<User>('castra_my_profile', ME);
  });
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);
  const [replyingToCast, setReplyingToCast] = useState<CastItem | null>(null);

  useEffect(() => {
    writeStorageValue('castra_premium', isPremium ? 'true' : 'false');
  }, [isPremium]);

  useEffect(() => {
    writeStorageValue('castra_registered', isRegistered ? 'true' : 'false');
  }, [isRegistered]);

  const { account, connected, signAndSubmitTransaction } = useWallet();

  // On-chain Sync for Profile Status
  useEffect(() => {
    if (connected && account) {
      const syncProfile = async () => {
        const { getUserProfile, getSocialBalance } = await import('./aptosClient');
        const profile = await getUserProfile(account.address.toString());
        if (profile && profile.data) {
          setIsRegistered(true);
          if (profile.data.is_premium) {
            setIsPremium(true);
          } else {
            setIsPremium(false);
          }
          const balance = await getSocialBalance(account.address.toString());
          setSocialBalance(balance);
        } else {
          setIsRegistered(false);
          setIsPremium(false);
          setSocialBalance(0);
        }
      };
      syncProfile();
      const interval = setInterval(syncProfile, 60000);
      return () => clearInterval(interval);
    } else {
      setIsRegistered(false);
      setIsPremium(false);
      setSocialBalance(0);
    }
  }, [connected, account]);


  // Auto-Unlock for this DApp specifically
  useEffect(() => {
    const initKey = async () => {
      const secret = import.meta.env.VITE_APP_ENCRYPTION_SECRET || 'default_secret_for_castra';
      try {
        const key = await deriveStaticKey(secret);
        setEncryptionKey(key);
        console.log("🔐 DApp Privacy Key Initialized (Auto-Unlock)");
      } catch (e) {
        console.error("Failed to init static key:", e);
      }
    };
    initKey();
  }, []);

  useEffect(() => {
    writeStorageJson('castra_my_profile', myProfile);
  }, [myProfile]);

  const updateMyProfile = (u: Partial<User>) => {
    setMyProfile(prev => ({ ...prev, ...u }));
  };



  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2800);
  };

  const addCast = (cast: CastItem) => {
    setCasts(prev => [cast, ...prev]);
    // Optimistically add to realCasts if it's the active feed
    setRealCasts(prev => [cast, ...prev]);
  };

  // Persistence for interactions
  const [likedIds, setLikedIds] = useState<string[]>(() => readStorageJson<string[]>('castra_liked', []));
  const [recastedIds, setRecastedIds] = useState<string[]>(() => readStorageJson<string[]>('castra_recasted', []));
  const [deletedIds, setDeletedIds] = useState<string[]>(() => readStorageJson<string[]>('castra_deleted', []));
  const [hiddenIds, setHiddenIds] = useState<string[]>(() => readStorageJson<string[]>('castra_hidden', []));

  useEffect(() => {
    writeStorageJson('castra_liked', likedIds);
  }, [likedIds]);

  useEffect(() => {
    writeStorageJson('castra_recasted', recastedIds);
  }, [recastedIds]);

  useEffect(() => {
    writeStorageJson('castra_deleted', deletedIds);
  }, [deletedIds]);

  useEffect(() => {
    writeStorageJson('castra_hidden', hiddenIds);
  }, [hiddenIds]);

  const likeCast = async (id: string) => {
    const isLiked = likedIds.includes(id);
    
    // On-chain interaction if connected
    if (connected && account && !isLiked) {
      try {
        console.log(`👍 Liking cast ${id} on-chain...`);
        const { getLikeCastPayload, isCastraContractDeployed } = await import('./aptosClient');
        if (await isCastraContractDeployed()) {
          await signAndSubmitTransaction(getLikeCastPayload(id));
          incrementNodeTx();
        }
      } catch (e) {
        console.error("Failed to like on-chain:", e);
        // We continue with local like anyway for UX, but maybe show a warning
      }
    }

    if (isLiked) {
      setLikedIds(prev => prev.filter(x => x !== id));
    } else {
      setLikedIds(prev => [...prev, id]);
    }

    const update = (prev: CastItem[]) => prev.map(c => {
      if (c.id === id) {
        return { ...c, liked: !isLiked, likes: isLiked ? c.likes - 1 : c.likes + 1 };
      }
      return c;
    });
    setCasts(update);
    setRealCasts(update);
  };

  const recastCast = (id: string) => {
    const isRecasted = recastedIds.includes(id);
    if (isRecasted) {
      setRecastedIds(prev => prev.filter(x => x !== id));
    } else {
      setRecastedIds(prev => [...prev, id]);
      showToast('Recasted! 🔁');
    }

    const update = (prev: CastItem[]) => prev.map(c => {
      if (c.id === id) {
        return { ...c, recasted: !isRecasted, recasts: isRecasted ? c.recasts - 1 : c.recasts + 1 };
      }
      return c;
    });
    setCasts(update);
    setRealCasts(update);
  };

  const removeCast = (id: string) => {
    setDeletedIds(prev => [...prev, id]);
    showToast('Cast deleted (hidden from feed)');
  };

  const hideCast = (id: string) => {
    setHiddenIds(prev => [...prev, id]);
    showToast('Cast hidden');
  };

  const incrementReplies = (id: string) => {
    const update = (prev: CastItem[]) => prev.map(c => {
      if (c.id === id) {
        return { ...c, replies: (c.replies || 0) + 1 };
      }
      return c;
    });
    setCasts(update);
    setRealCasts(update);
  };

  const toggleFollow = (id: string) => {
    setFollowState(prev => {
      const next = !prev[id];
      showToast(next ? 'Following user' : 'Unfollowed user');
      return { ...prev, [id]: next };
    });
  };

  const toggleChannel = (id: string) => {
    setChannelState(prev => {
      const next = !prev[id];
      showToast(next ? `Following /${id}` : `Unfollowed /${id}`);
      return { ...prev, [id]: next };
    });
  };

  const openProfile = (uid: string) => {
    setProfileModalUid(uid);
  };

  const closeModals = () => {
    setPremiumModalOpen(false);
    setProfileModalUid(null);
  };

  return (
    <AppContext.Provider value={{
      activeNavTab, setActiveNavTab, feedTab, setFeedTab,
      casts, realCasts, addCast, setRealCasts, likeCast, recastCast,
      users, channels, followState, toggleFollow, channelState, toggleChannel,
      toastMsg, showToast,
      premiumModalOpen, setPremiumModalOpen,
      profileModalUid, openProfile, closeModals,
      encryptionKey, setEncryptionKey,
      likedIds, recastedIds, deletedIds, hiddenIds,
      removeCast, hideCast,
      replyingToCast, setReplyingToCast, incrementReplies,
      nodeTxCount, incrementNodeTx,
      isPremium, setIsPremium,
      isRegistered, setIsRegistered,
      socialBalance, setSocialBalance,
      myProfile, updateMyProfile
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be within AppProvider");
  return ctx;
};
