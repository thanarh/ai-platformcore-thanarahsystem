import {
  Body, Controller, Delete, Get, Header, Headers, HttpCode, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role, Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { EmbeddedService } from './embedded.service';
import { EmbeddedSessionsService } from './embedded-sessions.service';

@Controller('embedded/integrations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.ADMIN, Role.TENANT_OWNER)
export class EmbeddedIntegrationsController {
  constructor(private readonly embedded: EmbeddedService) {}
  @Get()
  list(@CurrentUser() user: any) { return this.embedded.list(user.tenantId?.toString()); }
  @Post()
  create(@CurrentUser() user: any, @Body() body: { name: string; allowedOrigins: string[] }) {
    return this.embedded.create(user.tenantId?.toString(), user._id.toString(), body);
  }
  @Patch(':id')
  update(@Param('id') id: string, @CurrentUser() user: any, @Body() body: { name: string; allowedOrigins: string[] }) {
    return this.embedded.update(id, user.tenantId?.toString(), body);
  }
  @Post(':id/rotate')
  rotate(@Param('id') id: string, @CurrentUser() user: any) { return this.embedded.rotate(id, user.tenantId?.toString()); }
  @Delete(':id')
  revoke(@Param('id') id: string, @CurrentUser() user: any) { return this.embedded.revoke(id, user.tenantId?.toString()); }
}

@Controller('embedded')
export class EmbeddedPublicController {
  constructor(private readonly embedded: EmbeddedService, private readonly sessions: EmbeddedSessionsService) {}
  @Get(':id/config')
  @Header('Cache-Control', 'no-store')
  config(@Param('id') id: string, @Query('origin') origin: string) { return this.embedded.config(id, origin); }
  @Post(':id/bootstrap')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  bootstrap(@Param('id') id: string, @Headers('x-thanarah-integration-key') key: string,
    @Body() body: { externalUserId: string; origin: string; nonce: string }) {
    return this.embedded.bootstrap(id, key, body);
  }
  @Post(':id/exchange')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  exchange(@Param('id') id: string, @Body() body: { code: string; origin: string; nonce: string }) {
    return this.embedded.exchange(id, body);
  }
  @Post('session/refresh')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  refresh(@Body() body: { refreshToken: string }) { return this.sessions.refresh(body?.refreshToken); }
  @Post('session/logout')
  @HttpCode(200)
  logout(@Headers('authorization') authorization: string) {
    return this.sessions.logout(authorization?.replace(/^Bearer /, ''));
  }
}
