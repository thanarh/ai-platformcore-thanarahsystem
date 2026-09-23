import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@Req() request: any) {
    return this.notifications.list(request.user.tenantId.toString(), request.user._id.toString());
  }

  @Patch(':id/read')
  markRead(@Req() request: any, @Param('id') id: string) {
    return this.notifications.markRead(request.user.tenantId.toString(), request.user._id.toString(), id);
  }

  @Get('push/config')
  pushConfig() {
    return this.notifications.getPushConfig();
  }

  @Post('push-subscriptions')
  saveSubscription(@Req() request: any, @Body() body: any) {
    if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
      throw new Error('A valid push subscription is required');
    }
    return this.notifications.saveSubscription(
      request.user.tenantId.toString(),
      request.user._id.toString(),
      body,
      request.headers['user-agent'],
    );
  }

  @Delete('push-subscriptions')
  removeSubscription(@Req() request: any, @Body() body: { endpoint: string }) {
    return this.notifications.removeSubscription(request.user._id.toString(), body.endpoint);
  }
}
