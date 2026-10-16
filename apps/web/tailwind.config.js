/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warna aksen brand; ganti di sini bila ada panduan brand resmi
        brand: {
          50: '#eef4ff', 100: '#dae6ff', 200: '#bcd2ff', 300: '#8eb5ff', 400: '#598cff',
          500: '#3366ff', 600: '#1f47f5', 700: '#1834e1', 800: '#1a2db6', 900: '#1b2c8f', 950: '#151c57',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
