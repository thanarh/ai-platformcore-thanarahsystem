import {
  Body,
  Controller,
  Delete,
  Get,
  Put,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ContextProfileService } from './context-profile.service';

@Controller('context-profile')
@UseGuards(JwtAuthGuard)
export class ContextProfileController {
  constructor(private readonly profileService: ContextProfileService) {}

  private scope(user: any) {
    if (!user?.tenantId || !user?._id) {
      throw new ForbiddenException('Tenant and user context required');
    }
    return {
      tenantId: user.tenantId.toString(),
      userId: user._id.toString(),
    };
  }

  @Get('me')
  getMine(@CurrentUser() user: any) {
    const scope = this.scope(user);
    return this.profileService.getForUser(scope.tenantId, scope.userId);
  }

  @Put('me')
  updateMine(@CurrentUser() user: any, @Body() body: any) {
    const scope = this.scope(user);
    return this.profileService.updateForUser(scope.tenantId, scope.userId, body);
  }

  @Delete('me')
  deleteMine(@CurrentUser() user: any) {
    const scope = this.scope(user);
    return this.profileService.deleteForUser(scope.tenantId, scope.userId);
  }

  @Get('suggestions')
  suggestions(@CurrentUser() user: any) {
    const scope = this.scope(user);
    return this.profileService.suggestions(scope.tenantId, scope.userId);
  }
}