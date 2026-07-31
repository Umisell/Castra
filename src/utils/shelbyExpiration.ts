export type ShelbyRetentionHours = 6 | 12 | 24 | 48;
export type ShelbyVaultMode = 'manual' | 'auto';

export const MAX_SHELBY_EXTENSION_HOURS: ShelbyRetentionHours = 48;
export const DEFAULT_BLOB_RETENTION_HOURS: ShelbyRetentionHours = 48;
export const AUTO_RENEW_THRESHOLD_HOURS = 8;

const MICROS_PER_HOUR = 60 * 60 * 1_000_000;
const MS_PER_HOUR = 60 * 60 * 1000;

export const getShelbyExpirationMicros = (
  hours: ShelbyRetentionHours = DEFAULT_BLOB_RETENTION_HOURS,
) => Math.floor(Date.now() * 1000 + hours * MICROS_PER_HOUR);

export const getShelbyRenewExpirationMicros = (
  currentExpirationMicros?: number,
  hours: ShelbyRetentionHours = DEFAULT_BLOB_RETENTION_HOURS,
) => {
  const nowMicros = Date.now() * 1000;
  const baseMicros = Number.isFinite(currentExpirationMicros) && currentExpirationMicros && currentExpirationMicros > nowMicros
    ? currentExpirationMicros
    : nowMicros;

  return Math.floor(baseMicros + hours * MICROS_PER_HOUR);
};

export const getShelbyExpirationMs = (
  hours: ShelbyRetentionHours = DEFAULT_BLOB_RETENTION_HOURS,
) => Date.now() + hours * MS_PER_HOUR;

export const getRetentionLabel = (hours: ShelbyRetentionHours) => (
  hours === MAX_SHELBY_EXTENSION_HOURS ? '48h max' : `${hours}h`
);

export const getTimeUntilExpirationLabel = (expirationMicros?: number) => {
  if (!expirationMicros) return 'untracked';
  const remainingMs = Math.floor(expirationMicros / 1000) - Date.now();
  if (remainingMs <= 0) return 'expired';
  const hours = Math.floor(remainingMs / MS_PER_HOUR);
  const minutes = Math.floor((remainingMs % MS_PER_HOUR) / (60 * 1000));
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${Math.max(minutes, 1)}m left`;
};

export const getVaultStatus = (expirationMicros?: number) => {
  if (!expirationMicros) return 'untracked';
  const remainingMs = Math.floor(expirationMicros / 1000) - Date.now();
  if (remainingMs <= 0) return 'expired';
  if (remainingMs <= AUTO_RENEW_THRESHOLD_HOURS * MS_PER_HOUR) return 'renew-soon';
  return 'healthy';
};
