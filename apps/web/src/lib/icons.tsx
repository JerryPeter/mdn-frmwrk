import {
  BarChart3,
  Box,
  Circle,
  Database,
  FileText,
  KeyRound,
  LayoutGrid,
  PencilLine,
  Receipt,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

/** Pemetaan nilai kolom `icon` (menus/applications) ke ikon lucide */
const ICONS: Record<string, LucideIcon> = {
  shield: ShieldCheck,
  receipt: Receipt,
  box: Box,
  database: Database,
  key: KeyRound,
  edit: PencilLine,
  'bar-chart': BarChart3,
  file: FileText,
  grid: LayoutGrid,
};

export function resolveIcon(name?: string | null, fallback: LucideIcon = Circle): LucideIcon {
  return (name && ICONS[name]) || fallback;
}

/** Pilihan ikon untuk form (kolom `icon` di applications/menus) */
export const ICON_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'shield', label: 'Perisai (shield)' },
  { value: 'receipt', label: 'Struk (receipt)' },
  { value: 'box', label: 'Kotak (box)' },
  { value: 'database', label: 'Database' },
  { value: 'key', label: 'Kunci (key)' },
  { value: 'edit', label: 'Pensil (edit)' },
  { value: 'bar-chart', label: 'Grafik (bar-chart)' },
  { value: 'file', label: 'Dokumen (file)' },
  { value: 'grid', label: 'Grid' },
];
