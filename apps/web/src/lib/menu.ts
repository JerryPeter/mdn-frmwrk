/** Cocokkan path aktual dengan route_path berparameter, mis. /billcost/shipments/:id */
export function matchRoutePath(pattern: string, pathname: string): boolean {
  const p = pattern.split('/').filter(Boolean);
  const a = pathname.split('/').filter(Boolean);
  return p.length === a.length && p.every((seg, i) => seg.startsWith(':') || seg === a[i]);
}
