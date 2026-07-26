// Shared request/context types.

export interface CurrentUser {
  id: string;
  client_id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_superuser: boolean;
  is_platform_admin: boolean;
  is_hr: boolean;
  permissions: string[];
}

export interface JwtPayload {
  sub: string;
  client_id: string;
  type: 'access';
}
