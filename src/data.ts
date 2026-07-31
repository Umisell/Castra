import type { User, CastItem, Channel } from './types';

export const ME: User = { 
  id: 'me', name: 'user', handle: 'user', avatar: 'U', avatarBg: 'linear-gradient(135deg,#8b5cf6,#00d4b4)', bio: '', followers: 0, following: 0, premium: false 
};

export const USERS: User[] = [];

export const CHANNELS: Channel[] = [];

export const INITIAL_CASTS: CastItem[] = [];

export const EXTRA_CAST_TEMPLATES: any[] = [];
