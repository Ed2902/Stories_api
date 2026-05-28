import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentAuthUser } from '../auth/decorators/current-auth-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequestUser } from '../auth/interfaces/authenticated-request.interface';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { RegisterNotificationDeviceDto } from './dto/register-device.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('devices/register')
  registerDevice(
    @CurrentAuthUser() authUser: AuthenticatedRequestUser,
    @Body() dto: RegisterNotificationDeviceDto,
  ) {
    return this.notificationsService.registerDevice(authUser.userId, dto);
  }

  @Get('me')
  listMyNotifications(
    @CurrentAuthUser() authUser: AuthenticatedRequestUser,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notificationsService.listMyNotifications(authUser.userId, query);
  }

  @Post('me/:notificationId/read')
  markAsRead(
    @CurrentAuthUser() authUser: AuthenticatedRequestUser,
    @Param('notificationId') notificationId: string,
  ) {
    return this.notificationsService.markAsRead(authUser.userId, notificationId);
  }

  @Post('me/read-all')
  markAllAsRead(@CurrentAuthUser() authUser: AuthenticatedRequestUser) {
    return this.notificationsService.markAllAsRead(authUser.userId);
  }
}
