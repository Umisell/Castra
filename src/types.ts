export interface User {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  avatarBg: string;
  bio: string;
  followers: number;
  following: number;
  premium: boolean;
}

export interface Badge {
  t: string;
  d: string;
}

export interface Embed {
  icon: string;
  title: string;
  url: string;
}

export interface MiniApp {
  name: string;
  icon: string;
  title: string;
  desc: string;
  btn: string;
}

export interface CastItem {
  id: string;
  userId: string;
  author?: Pick<User, 'name' | 'handle' | 'avatar' | 'avatarBg' | 'premium'>;
  time: string | number;
  channel: string;
  visibility?: 'public' | 'premium' | 'private' | 'allowlist' | 'timelock' | 'purchasable';
  allowlist?: string[];
  unlockAt?: number;
  priceOctas?: number;
  body: string;
  badges?: Badge[];
  likes: number;
  replies: number;
  recasts: number;
  quotes: number;
  liked: boolean;
  recasted: boolean;
  embed?: Embed;
  miniapp?: MiniApp;
  image?: string;
  localPreview?: string;
  encrypted?: boolean;
  mediaEncrypted?: boolean;
  mimeType?: string;
  mediaKind?: 'image' | 'video' | 'stream';
  mediaFormat?: 'shelby-blob' | 'hls' | 'dash' | 'raw';
  shelbyBlobs?: string[];
  expirationMicros?: number;
  renewedAt?: number;
  replyTo?: string;
}

export interface Channel {
  id: string;
  name: string;
  icon: string;
  desc: string;
  members: string;
}
