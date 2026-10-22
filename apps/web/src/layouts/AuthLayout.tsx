import type { ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

/** Kerangka halaman sebelum masuk aplikasi (login, ganti password, pilih konteks) */
export function AuthLayout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-screen">
      <aside className="relative hidden w-[42%] flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-900 via-brand-800 to-brand-950 p-10 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[rgb(255_255_255/0.05)]" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-[rgb(255_255_255/0.05)]" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgb(255_255_255/0.1)] ring-1 ring-[rgb(255_255_255/0.2)]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-semibold tracking-wide">MODENA</p>
            <p className="text-xs text-[#bcd2ff]">Application Framework</p>
          </div>
        </div>
        <div className="relative max-w-sm">
          <h2 className="text-3xl font-semibold leading-tight">Satu akun untuk seluruh aplikasi internal.</h2>
          <p className="mt-3 text-sm text-[#bcd2ff]">
            Akses diatur per company, aplikasi, menu, dan action sesuai peran Anda.
          </p>
        </div>
        <p className="relative text-xs text-brand-300">© {new Date().getFullYear()} Divisi IT MODENA Indonesia</p>
      </aside>

      <main className="relative flex flex-1 items-center justify-center bg-slate-50 px-4 py-10 sm:px-8">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>
        <div className={wide ? 'w-full max-w-3xl' : 'w-full max-w-md'}>{children}</div>
      </main>
    </div>
  );
}
