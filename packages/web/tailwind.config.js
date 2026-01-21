/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        solana: {
          purple: '#e96089ff',
          green: '#e189a4ff',
          dark: '#0D1117',
        },
        // Theme-aware colors using CSS variables
        theme: {
          bg: {
            primary: 'var(--bg-primary)',
            secondary: 'var(--bg-secondary)',
            card: 'var(--bg-card)',
            input: 'var(--bg-input)',
            hover: 'var(--bg-hover)',
            modal: 'var(--bg-modal)',
            selected: 'var(--bg-selected)',
          },
          border: {
            DEFAULT: 'var(--border-color)',
            input: 'var(--border-input)',
          },
          text: {
            primary: 'var(--text-primary)',
            secondary: 'var(--text-secondary)',
            muted: 'var(--text-muted)',
          },
        },
      },
    },
  },
  plugins: [],
};
