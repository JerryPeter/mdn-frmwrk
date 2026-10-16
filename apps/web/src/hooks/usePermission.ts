import { usePermissionSet } from './useAuth';

/**
 * FR-AUTHZ-03: true bila user memiliki permission `menuCode:actionCode`
 * pada konteks aktif. Hanya untuk kenyamanan UI; backend tetap memeriksa.
 */
export function usePermission(menuCode: string, actionCode: string): boolean {
  const { data } = usePermissionSet();
  return data?.has(`${menuCode}:${actionCode}`) ?? false;
}
