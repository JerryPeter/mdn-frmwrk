import type {
  CreateMemberInput,
  GroupInput,
  GroupListParams,
  GroupMember,
  MemberListParams,
  PermissionMatrix,
  UpdateMemberInput,
  UserGroup,
} from '@/types/group';
import { request, requestPage } from './client';

type Restored = UserGroup & { restored_permissions: number };

/** Endpoint /user-groups (PRD §9.2: UM_GROUP, UM_GROUP_MEMBER, UM_GROUP_PERM) */
export const userGroupsApi = {
  list: (params: GroupListParams) =>
    requestPage<UserGroup>({
      method: 'GET',
      url: '/user-groups',
      params: {
        ...params,
        q: params.q || undefined,
        application_id: params.application_id || undefined,
        include_deleted: params.include_deleted || undefined,
      },
    }),

  get: (id: string) => request<UserGroup>({ method: 'GET', url: `/user-groups/${id}` }),

  create: (input: GroupInput) => request<UserGroup>({ method: 'POST', url: '/user-groups', data: input }),

  update: (id: string, input: GroupInput) => request<UserGroup>({ method: 'PUT', url: `/user-groups/${id}`, data: input }),

  duplicate: (id: string, input: Omit<GroupInput, 'application_id'>) =>
    request<UserGroup>({ method: 'POST', url: `/user-groups/${id}/duplicate`, data: input }),

  setStatus: (id: string, is_active: boolean) =>
    request<UserGroup>({ method: 'PATCH', url: `/user-groups/${id}/status`, data: { is_active } }),

  remove: (id: string) => request<UserGroup>({ method: 'DELETE', url: `/user-groups/${id}` }),

  restore: (id: string) => request<Restored>({ method: 'POST', url: `/user-groups/${id}/restore` }),

  // Anggota
  members: (groupId: string, params: MemberListParams) =>
    requestPage<GroupMember>({
      method: 'GET',
      url: `/user-groups/${groupId}/members`,
      params: { ...params, q: params.q || undefined, company_id: params.company_id || undefined },
    }),

  addMember: (groupId: string, input: CreateMemberInput) =>
    request<GroupMember>({ method: 'POST', url: `/user-groups/${groupId}/members`, data: input }),

  updateMember: (groupId: string, memberId: string, input: UpdateMemberInput) =>
    request<GroupMember>({ method: 'PUT', url: `/user-groups/${groupId}/members/${memberId}`, data: input }),

  removeMember: (groupId: string, memberId: string) =>
    request<GroupMember>({ method: 'DELETE', url: `/user-groups/${groupId}/members/${memberId}` }),

  // Permission matriks
  permissions: (groupId: string) => request<PermissionMatrix>({ method: 'GET', url: `/user-groups/${groupId}/permissions` }),

  savePermissions: (groupId: string, menuActionIds: string[]) =>
    request<PermissionMatrix>({ method: 'PUT', url: `/user-groups/${groupId}/permissions`, data: { menu_action_ids: menuActionIds } }),
};
