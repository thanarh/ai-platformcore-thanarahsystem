import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiKeysService } from './api-keys.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role, Roles } from '../../common/decorators/roles.decorator';

@Controller('api-keys')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.ADMIN, Role.TENANT_OWNER)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.apiKeysService.findByTenant(user.tenantId?.toString());
  }

  @Post()
  async create(
    @CurrentUser() user: any,
    @Body()
    body: {
      name: string;
      environment?: 'live' | 'test';
      scopes?: string[];
      rateLimit?: number;
      expiresAt?: string;
    },
  ) {
    const { key, rawKey } = await this.apiKeysService.create({
      tenantId: user.tenantId?.toString(),
      userId: user._id.toString(),
      name: body.name,
      environment: body.environment,
      scopes: body.scopes,
      rateLimit: body.rateLimit,
      expiresAt: body.expiresAt,
    });

    // Return key with raw value (shown ONCE only)
    const { keyHash: _hash, ...safeKey } = key.toObject();
    return {
      ...safeKey,
      key: rawKey,
      warning: 'This is the only time the full key will be shown. Save it securely.',
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(@Param('id') id: string, @CurrentUser() user: any) {
    return this.apiKeysService.revoke(id, user.tenantId?.toString());
  }
}
