const dateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Tanggal ISO UTC dari API → tampilan zona Asia/Jakarta (PRD §9.1) */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '–';
  return `${dateTimeFormatter.format(new Date(iso))} WIB`;
}

const dateFormatter = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Tanggal tanpa jam (kolom date, mis. "2026-01-01") */
export function formatDate(date: string | null | undefined): string {
  if (!date) return '–';
  return dateFormatter.format(new Date(`${date.slice(0, 10)}T00:00:00Z`));
}

/** Tanggal hari ini (YYYY-MM-DD) zona Asia/Jakarta, sama dengan backend */
export const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
