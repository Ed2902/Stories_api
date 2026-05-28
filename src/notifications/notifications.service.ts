import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationDevice,
  Prisma,
  UserNotification,
  UserNotificationPriority,
  UserNotificationStatus,
} from '@prisma/client';
import { QueueService } from '../queue/queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { PublishNotificationDto } from './dto/publish-notification.dto';
import { RegisterNotificationDeviceDto } from './dto/register-device.dto';
import { PUSH_DELIVERY_JOB } from './notifications.constants';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  async registerDevice(
    userId: string,
    dto: RegisterNotificationDeviceDto,
  ): Promise<NotificationDevice> {
    return this.prismaService.notificationDevice.upsert({
      where: {
        pushToken: dto.pushToken,
      },
      update: {
        userId,
        platform: dto.platform,
        deviceId: dto.deviceId?.trim() || null,
        deviceName: dto.deviceName?.trim() || null,
        appVersion: dto.appVersion?.trim() || null,
        locale: dto.locale?.trim() || null,
        isActive: true,
        disabledAt: null,
        lastSeenAt: new Date(),
      },
      create: {
        userId,
        pushToken: dto.pushToken.trim(),
        platform: dto.platform,
        deviceId: dto.deviceId?.trim() || null,
        deviceName: dto.deviceName?.trim() || null,
        appVersion: dto.appVersion?.trim() || null,
        locale: dto.locale?.trim() || null,
      },
    });
  }

  async listMyNotifications(userId: string, query: ListNotificationsQueryDto) {
    const take = query.take ?? 30;
    const notifications = await this.prismaService.userNotification.findMany({
      where: {
        userId,
        ...(query.unreadOnly ? { isRead: false } : {}),
        ...(query.cursor
          ? {
              createdAt: {
                lt: new Date(query.cursor),
              },
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      take,
    });

    const unreadCount = await this.prismaService.userNotification.count({
      where: {
        userId,
        isRead: false,
      },
    });

    return {
      notifications: notifications.map((notification) =>
        this.serializeNotification(notification),
      ),
      unreadCount,
      nextCursor:
        notifications.length === take
          ? notifications[notifications.length - 1]?.createdAt.toISOString() ??
            null
          : null,
    };
  }

  async markAsRead(userId: string, notificationId: string) {
    const notification = await this.prismaService.userNotification.findFirst({
      where: {
        id: notificationId,
        userId,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    const updated = await this.prismaService.userNotification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: notification.readAt ?? new Date(),
      },
    });

    return this.serializeNotification(updated);
  }

  async markAllAsRead(userId: string) {
    await this.prismaService.userNotification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return {
      success: true,
    };
  }

  async publish(dto: PublishNotificationDto) {
    const directTargetUserIds = this.resolveTargetUserIds(dto);
    const broadcastUserIds = dto.broadcast
      ? await this.resolveBroadcastUserIds()
      : [];
    const targetUserIds = Array.from(
      new Set([...directTargetUserIds, ...broadcastUserIds]),
    );

    if (!targetUserIds.length) {
      throw new BadRequestException(
        'No active notification targets were found for this request',
      );
    }

    const createdNotifications = await Promise.all(
      targetUserIds.map((userId) =>
        this.prismaService.userNotification.create({
          data: {
            userId,
            type: dto.type,
            title: dto.title.trim(),
            body: dto.body.trim(),
            subtitle: dto.subtitle?.trim() || null,
            data: (dto.data as Prisma.InputJsonValue | undefined) ?? undefined,
            priority: dto.priority ?? UserNotificationPriority.NORMAL,
            sendPush: dto.sendPush ?? true,
            sourceService: dto.sourceService?.trim() || null,
            sourceEvent: dto.sourceEvent?.trim() || null,
          },
        }),
      ),
    );

    await Promise.all(
      createdNotifications.map((notification) =>
        this.queuePushDelivery(notification.id),
      ),
    );

    return {
      created: createdNotifications.length,
      notifications: createdNotifications.map((notification) =>
        this.serializeNotification(notification),
      ),
    };
  }

  async disableDeviceByPushToken(pushToken: string) {
    await this.prismaService.notificationDevice.updateMany({
      where: {
        pushToken,
      },
      data: {
        isActive: false,
        disabledAt: new Date(),
      },
    });
  }

  async deliverPushForNotification(notificationId: string) {
    const notification = await this.prismaService.userNotification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (!notification.sendPush) {
      await this.prismaService.userNotification.update({
        where: { id: notificationId },
        data: {
          status: UserNotificationStatus.SENT,
          deliveredAt: notification.deliveredAt ?? new Date(),
        },
      });
      return;
    }

    const devices = await this.prismaService.notificationDevice.findMany({
      where: {
        userId: notification.userId,
        isActive: true,
      },
    });

    if (!devices.length) {
      await this.prismaService.userNotification.update({
        where: { id: notificationId },
        data: {
          status: UserNotificationStatus.SENT,
        },
      });
      return;
    }

    const result = await this.sendExpoPush(notification, devices);

    await this.prismaService.userNotification.update({
      where: { id: notificationId },
      data: {
        status: result.success
          ? UserNotificationStatus.SENT
          : UserNotificationStatus.FAILED,
        deliveredAt: result.success ? new Date() : null,
        pushAttemptedAt: new Date(),
        pushError: result.errorMessage,
      },
    });

    if (result.invalidTokens.length) {
      await Promise.all(
        result.invalidTokens.map((pushToken) =>
          this.disableDeviceByPushToken(pushToken),
        ),
      );
    }
  }

  private async queuePushDelivery(notificationId: string) {
    await this.queueService.getSystemQueue().add(
      PUSH_DELIVERY_JOB,
      {
        notificationId,
      },
      {
        jobId: `${PUSH_DELIVERY_JOB}:${notificationId}`,
      },
    );
  }

  private resolveTargetUserIds(dto: PublishNotificationDto) {
    const userIds = new Set<string>();

    if (dto.userId) {
      userIds.add(dto.userId);
    }

    for (const userId of dto.userIds ?? []) {
      userIds.add(userId);
    }

    const targetUserIds = Array.from(userIds);

    if (!targetUserIds.length && !dto.broadcast) {
      throw new BadRequestException(
        'At least one target user is required to publish a notification',
      );
    }

    return targetUserIds;
  }

  private async resolveBroadcastUserIds() {
    const devices = await this.prismaService.notificationDevice.findMany({
      where: {
        isActive: true,
      },
      select: {
        userId: true,
      },
      distinct: ['userId'],
    });

    return devices.map((device) => device.userId);
  }

  private async sendExpoPush(
    notification: UserNotification,
    devices: NotificationDevice[],
  ) {
    const expoPushApiUrl =
      this.configService.get<string>('notifications.expoPushApiUrl') ||
      'https://exp.host/--/api/v2/push/send';
    const expoAccessToken =
      this.configService.get<string>('notifications.expoAccessToken')?.trim() ||
      '';
    const timeoutMs =
      this.configService.get<number>('notifications.pushTimeoutMs') ?? 12000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const messages = devices.map((device) => ({
        to: device.pushToken,
        title: notification.title,
        body: notification.body,
        subtitle: notification.subtitle ?? undefined,
        data: {
          ...(typeof notification.data === 'object' && notification.data
            ? (notification.data as Record<string, unknown>)
            : {}),
          notificationId: notification.id,
          type: notification.type,
        },
        sound: 'default',
        priority:
          notification.priority === UserNotificationPriority.CRITICAL ||
          notification.priority === UserNotificationPriority.HIGH
            ? 'high'
            : 'default',
        channelId: 'default',
      }));

      const response = await fetch(expoPushApiUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(expoAccessToken
            ? {
                Authorization: `Bearer ${expoAccessToken}`,
              }
            : {}),
        },
        body: JSON.stringify(messages),
        signal: controller.signal,
      });

      if (!response.ok) {
        return {
          success: false,
          errorMessage: `Expo push API returned status ${response.status}`,
          invalidTokens: [] as string[],
        };
      }

      const payload = (await response.json()) as {
        data?: Array<{ status?: string; details?: { error?: string } }>;
        errors?: unknown[];
      };

      const invalidTokens: string[] = [];

      payload.data?.forEach((entry, index) => {
        if (
          entry.status === 'error' &&
          entry.details?.error === 'DeviceNotRegistered'
        ) {
          invalidTokens.push(devices[index]?.pushToken);
        }
      });

      return {
        success: !payload.errors?.length,
        errorMessage:
          payload.errors?.length || invalidTokens.length
            ? JSON.stringify(payload.errors ?? invalidTokens)
            : null,
        invalidTokens,
      };
    } catch (error) {
      return {
        success: false,
        errorMessage:
          error instanceof Error ? error.message : 'expo_push_request_failed',
        invalidTokens: [] as string[],
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private serializeNotification(notification: UserNotification) {
    return {
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      subtitle: notification.subtitle,
      data: notification.data,
      priority: notification.priority,
      status: notification.status,
      sendPush: notification.sendPush,
      isRead: notification.isRead,
      readAt: notification.readAt,
      deliveredAt: notification.deliveredAt,
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt,
    };
  }
}
