type ThemeToggleProps = {
  theme: 'light' | 'dark';
  onToggle: () => void;
};

export const ThemeToggle = ({ theme, onToggle }: ThemeToggleProps) => (
  <button
    className="theme-toggle"
    type="button"
    onClick={onToggle}
    aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
  >
    <span className="theme-toggle-track">
      <span className="theme-toggle-thumb">{theme === 'dark' ? 'D' : 'L'}</span>
    </span>
    <span className="theme-toggle-label">{theme === 'dark' ? 'Dark' : 'Light'}</span>
  </button>
);
