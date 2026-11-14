import { Injectable, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { ApiKeysService } from '../../modules/api-keys/api-keys.service';

export const IS_PUBLIC_KEY = 'isPublic';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private apiKeysService: ApiKeysService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Check for API key authentication — validate the key before granting access
    const request = context.switchToHttp().getRequest();
    const rawKey = request.headers['x-api-key'] as string | undefined;
    if (rawKey) {
      const apiKey = await this.apiKeysService.validateKey(rawKey);
      if (!apiKey) {
        throw new UnauthorizedException('Invalid or expired API key');
      }
      // A dedicated messaging key must not inherit access to legacy chat/user routes.
      if (!apiKey.scopes.includes('chat') &&
        !(
          /^\/(?:api\/)?whatsapp\/messages\/?$/i.test(request.path || '')
          && request.method === 'POST'
          || /^\/(?:api\/)?whatsapp\/messages\/[a-f\d]{24}\/?$/i.test(request.path || '')
          && request.method === 'GET'
          || /^\/(?:api\/)?whatsapp\/consents(?:\/revoke)?\/?$/i.test(request.path || '')
          && request.method === 'POST'
          && apiKey.scopes.includes('whatsapp:consent')
        )) {
        throw new ForbiddenException('API key is not scoped for this route');
      }
      // Establish a tenant-bound principal so downstream handlers behave correctly
      request.user = {
        _id: apiKey.createdBy,
        tenantId: apiKey.tenantId,
        role: 'api',
        isApiKeyAuth: true,
        apiKeyScopes: apiKey.scopes,
        apiKeyId: String(apiKey._id),
        apiKeyRateLimit: apiKey.rateLimit,
        apiKeyEnvironment: apiKey.environment,
      };
      return true;
    }

    return super.canActivate(context) as Promise<boolean>;
  }

  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('Authentication required');
    }
    return user;
  }
}
