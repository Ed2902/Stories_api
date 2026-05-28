import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { SYSTEM_QUEUE } from '../queue/queue.constants';
import { PUSH_DELIVERY_JOB } from './notifications.constants';
import { NotificationsService } from './notifications.service';

@Processor(SYSTEM_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  constructor(private readonly notificationsService: NotificationsService) {
    super();
  }

  async process(job: Job) {
    if (job.name === PUSH_DELIVERY_JOB) {
      return this.notificationsService.deliverPushForNotification(
        job.data.notificationId as string,
      );
    }

    return null;
  }
}
