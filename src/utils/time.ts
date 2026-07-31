export function formatRelativeTime(time: string | number): string {
  if (typeof time === 'string') {
    // If it's already a relative string like '2m' or '1h', return as is
    if (time.match(/^\d+[mhsd]/) || time === 'just now') return time;
    
    // Try to parse as date string
    const date = new Date(time);
    if (!isNaN(date.getTime())) {
      return formatDiff(date.getTime());
    }
    return time;
  }
  
  return formatDiff(time);
}

function formatDiff(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd';
  
  return new Date(timestamp).toLocaleDateString();
}
