/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0a',
        surface: '#111',
        border: '#1a1a1a',
        text: '#e5e5e5',
        muted: '#666',
        accent: '#3b82f6',
        green: '#22c55e',
        red: '#ef4444',
        yellow: '#eab308',
      }
    },
  },
  plugins: [],
}
