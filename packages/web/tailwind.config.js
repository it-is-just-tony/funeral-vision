/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        solana: {
          purple: '#e96089ff',
          green: '#e189a4ff',
          dark: '#0D1117',
        },
      },
    },
  },
  plugins: [],
};
