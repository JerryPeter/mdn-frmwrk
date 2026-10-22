/**
 * Warna diambil dari CSS variable di src/styles/theme.css agar tema terang/gelap
 * berganti lewat class `dark` di <html> tanpa class `dark:` di tiap komponen.
 * Nilai mode terang = palet Tailwind (slate, red, amber, emerald, sky) + palet brand.
 */
const SCALE = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
const themed = (name) => Object.fromEntries(SCALE.map((s) => [s, `rgb(var(--c-${name}-${s}) / <alpha-value>)`]));

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        white: 'rgb(var(--c-white) / <alpha-value>)',
        slate: themed('slate'),
        // Warna aksen brand; ubah nilainya di src/styles/theme.css bila ada panduan brand resmi
        brand: themed('brand'),
        red: themed('red'),
        amber: themed('amber'),
        emerald: themed('emerald'),
        sky: themed('sky'),
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
