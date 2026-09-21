import { Injectable } from '@nestjs/common';
import { ToolContract, ToolExecutionContext } from './tool.types';

const PRIVILEGED_ROLES = new Set(['OWNER', 'ADMIN', 'AI_ADMIN']);

@Injectable()
export class ToolPermissionService {
  canExecute(tool: ToolContract, context: ToolExecutionContext): boolean {
    if (!context.isApiKeyAuth && PRIVILEGED_ROLES.has(context.role || '')) return true;
    const permissions = new Set(context.permissions || []);
    return tool.requiredPermissions.every(
      (permission) => permissions.has(permission) || permissions.has('tools:*'),
    );
  }
}