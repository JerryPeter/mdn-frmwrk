import type { PermissionSet } from '../lib/permissions.js';

export interface AuthInfo {
  userId: string;
  username: string;
  ctx: { company_id: string; application_id: string } | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthInfo;
      permissions?: PermissionSet;
    }
  }
}
