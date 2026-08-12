import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, Role } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantsService } from './tenants.service';

@Controller('tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OWNER)
  findAll() {
    return this.tenantsService.findAll();
  }

  @Get('my')
  getMyTenant(@CurrentUser() user: any) {
    if (!user.tenantId) return null;
    return this.tenantsService.findById(user.tenantId.toString());
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OWNER)
  findOne(@Param('id') id: string) {
    return this.tenantsService.findById(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.OWNER)
  create(@Body() body: any) {
    return this.tenantsService.create(body);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.OWNER, Role.AI_ADMIN)
  update(@Param('id') id: string, @Body() body: any) {
    return this.tenantsService.update(id, body);
  }

  @Put(':id/clinic-brain')
  @Roles(Role.ADMIN, Role.OWNER, Role.AI_ADMIN)
  updateClinicBrain(@Param('id') id: string, @Body() body: any) {
    return this.tenantsService.updateClinicBrain(id, body);
  }

  @Put(':id/ai-config')
  @Roles(Role.ADMIN, Role.OWNER, Role.AI_ADMIN)
  updateAiConfig(@Param('id') id: string, @Body() body: any) {
    return this.tenantsService.updateAiConfig(id, body);
  }
}
