import type { AdminMenuNode } from '@/types/menu';

/** Ratakan pohon menjadi daftar node (urutan tampil) */
export function flatten(nodes: AdminMenuNode[]): AdminMenuNode[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)]);
}

export function findNode(nodes: AdminMenuNode[], id: string | null): AdminMenuNode | undefined {
  if (!id) return undefined;
  return flatten(nodes).find((n) => n.id === id);
}

/** Id node beserta seluruh turunannya (tidak boleh menjadi parent baru node tersebut) */
export function subtreeIds(node: AdminMenuNode): Set<string> {
  return new Set(flatten([node]).map((n) => n.id));
}

/** Pilihan parent: menu GROUP yang belum dihapus, dengan label berindentasi sesuai kedalaman */
export function groupOptions(nodes: AdminMenuNode[], exclude: Set<string> = new Set(), depth = 0): Array<{ id: string; label: string }> {
  return nodes.flatMap((n) => {
    if (n.menu_type !== 'GROUP' || n.is_deleted || exclude.has(n.id)) return [];
    return [{ id: n.id, label: `${'— '.repeat(depth)}${n.menu_name} (${n.menu_code})` }, ...groupOptions(n.children, exclude, depth + 1)];
  });
}

/** Saring pohon: tampilkan node yang cocok beserta seluruh leluhurnya */
export function filterTree(nodes: AdminMenuNode[], q: string): AdminMenuNode[] {
  if (!q) return nodes;
  const needle = q.toLowerCase();
  return nodes.flatMap((n) => {
    const children = filterTree(n.children, q);
    const match = [n.menu_code, n.menu_name, n.route_path ?? ''].some((v) => v.toLowerCase().includes(needle));
    return match || children.length ? [{ ...n, children: match ? n.children : children }] : [];
  });
}
