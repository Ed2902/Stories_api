import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { PublishNotificationDto } from './dto/publish-notification.dto';
import { InternalNotificationsGuard } from './guards/internal-notifications.guard';
import { NotificationsService } from './notifications.service';

@Controller('internal/notifications')
@UseGuards(InternalNotificationsGuard)
export class InternalNotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('publish')
  publish(@Body() dto: PublishNotificationDto) {
    return this.notificationsService.publish(dto);
  }
}
