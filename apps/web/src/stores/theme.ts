import { create } from 'zustand';

/** Pilihan tema; `system` mengikuti pengaturan sistem operasi/browser */
export type ThemePreference = 'light' | 'dark' | 'system';

/** Sama dengan skrip awal di index.html (mencegah kedipan tema saat halaman dimuat) */
const STORAGE_KEY = 'modena-theme';

const media = () => window.matchMedia('(prefers-color-scheme: dark)');

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

const resolve = (pref: ThemePreference): 'light' | 'dark' => (pref === 'system' ? (media().matches ? 'dark' : 'light') : pref);

function apply(pref: ThemePreference) {
  const root = document.documentElement;
  const dark = resolve(pref) === 'dark';
  if (root.classList.contains('dark') === dark) return;
  // Matikan animasi warna sesaat agar seluruh elemen berganti tema serentak
  const style = document.createElement('style');
  style.textContent = '*,*::before,*::after{transition:none!important}';
  document.head.appendChild(style);
  root.classList.toggle('dark', dark);
  void getComputedStyle(root).color; // paksa style diterapkan sebelum transisi dipulihkan
  requestAnimationFrame(() => style.remove());
}

interface ThemeState {
  preference: ThemePreference;
  /** Tema yang sedang tampil */
  resolved: 'light' | 'dark';
  setPreference: (pref: ThemePreference) => void;
}

export const useTheme = create<ThemeState>((set) => ({
  preference: readPreference(),
  resolved: resolve(readPreference()),
  setPreference: (preference) => {
    try {
      if (preference === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      /* penyimpanan tidak tersedia: tema tetap berlaku sampai halaman dimuat ulang */
    }
    apply(preference);
    set({ preference, resolved: resolve(preference) });
  },
}));

// Ikuti perubahan tema sistem selama pilihan = "system"
media().addEventListener('change', () => {
  const { preference } = useTheme.getState();
  if (preference !== 'system') return;
  apply(preference);
  useTheme.setState({ resolved: resolve(preference) });
});

apply(useTheme.getState().preference);
