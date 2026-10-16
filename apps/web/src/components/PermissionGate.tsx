import type { ReactNode } from 'react';
import { usePermission } from '@/hooks/usePermission';

/** Render children hanya bila user memiliki permission menuCode:action (FR-AUTHZ-03) */
export function PermissionGate({ menu, action, children }: { menu: string; action: string; children: ReactNode }) {
  return usePermission(menu, action) ? <>{children}</> : null;
}
