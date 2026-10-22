import clsx from 'clsx';
import { ChevronRight, EyeOff, FileText, Folder, FolderOpen } from 'lucide-react';
import type { AdminMenuNode } from '@/types/menu';

interface Props {
  nodes: AdminMenuNode[];
  selectedId: string | null;
  expanded: Set<string>;
  /** Saat pencarian aktif seluruh node dibuka */
  forceExpand: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}

function TreeRow({ node, depth, ...props }: Props & { node: AdminMenuNode; depth: number }) {
  const isGroup = node.menu_type === 'GROUP';
  const open = props.forceExpand || props.expanded.has(node.id);
  const selected = props.selectedId === node.id;
  const FolderIcon = open ? FolderOpen : Folder;

  return (
    <li role="treeitem" aria-expanded={isGroup ? open : undefined} aria-selected={selected}>
      <div
        className={clsx(
          'group flex items-center gap-1.5 rounded-lg py-1.5 pr-2 text-sm transition-colors',
          selected ? 'bg-brand-50 ring-1 ring-inset ring-brand-200' : 'hover:bg-slate-50',
        )}
        style={{ paddingLeft: `${depth * 18 + 4}px` }}
      >
        {isGroup && node.children.length > 0 ? (
          <button
            type="button"
            onClick={() => props.onToggle(node.id)}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
            aria-label={open ? `Tutup ${node.menu_name}` : `Buka ${node.menu_name}`}
          >
            <ChevronRight className={clsx('h-4 w-4 transition-transform', open && 'rotate-90')} />
          </button>
        ) : (
          <span className="w-5" />
        )}
        <button type="button" onClick={() => props.onSelect(node.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          {isGroup ? (
            <FolderIcon className="h-4 w-4 shrink-0 text-amber-500" />
          ) : (
            <FileText className="h-4 w-4 shrink-0 text-slate-400" />
          )}
          <span
            className={clsx(
              'truncate',
              isGroup ? 'font-medium text-slate-800' : 'text-slate-700',
              (!node.is_active || node.is_deleted) && 'text-slate-400',
              node.is_deleted && 'line-through',
            )}
          >
            {node.menu_name}
          </span>
          <span className="hidden truncate font-mono text-[11px] text-slate-400 sm:inline">{node.menu_code}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {!node.is_visible && <EyeOff className="h-3.5 w-3.5 text-slate-400" aria-label="Tersembunyi dari sidebar" />}
            {node.is_deleted ? (
              <span className="rounded bg-red-50 px-1.5 text-[10px] font-medium text-red-700">Terhapus</span>
            ) : (
              !node.is_active && <span className="rounded bg-slate-100 px-1.5 text-[10px] font-medium text-slate-600">Nonaktif</span>
            )}
          </span>
        </button>
      </div>
      {isGroup && open && node.children.length > 0 && (
        <ul role="group">
          {node.children.map((c) => (
            <TreeRow key={c.id} {...props} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function MenuTreeView(props: Props) {
  return (
    <ul role="tree" aria-label="Pohon menu" className="space-y-0.5">
      {props.nodes.map((n) => (
        <TreeRow key={n.id} {...props} node={n} depth={0} />
      ))}
    </ul>
  );
}
