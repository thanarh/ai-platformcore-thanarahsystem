import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, Role } from '../../common/decorators/roles.decorator';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OWNER, Role.AI_ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  getStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('logs')
  getLogs() {
    return this.adminService.getRecentLogs();
  }

  @Get('tenants')
  getTenants() {
    return this.adminService.getAllTenants();
  }

  @Get('api-keys')
  getApiKeys() {
    return this.adminService.getAllApiKeys();
  }
}
