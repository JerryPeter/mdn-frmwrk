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
