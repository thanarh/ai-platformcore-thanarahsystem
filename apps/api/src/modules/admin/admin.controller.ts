import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, Role } from '../../common/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

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

  @Get('users')
  @Roles(Role.ADMIN, Role.OWNER)
  getUsers() {
    return this.adminService.getAllUsers();
  }

  @Get('users/:id/customer')
  @Roles(Role.ADMIN, Role.OWNER)
  getCustomer(@Param('id') id: string) {
    return this.adminService.getCustomer(id);
  }

  @Patch('users/:id/customer')
  @Roles(Role.ADMIN, Role.OWNER)
  updateCustomer(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: any,
  ) {
    return this.adminService.updateCustomer(id, body, user._id.toString());
  }

  @Get('api-keys')
  getApiKeys() {
    return this.adminService.getAllApiKeys();
  }
}
