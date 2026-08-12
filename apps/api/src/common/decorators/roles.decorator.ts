import { SetMetadata } from '@nestjs/common';

export enum Role {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  AI_ADMIN = 'AI_ADMIN',
  DEVELOPER = 'DEVELOPER',
  STAFF = 'STAFF',
  USER = 'USER',
}

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
