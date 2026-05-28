import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StoriesController } from './stories.controller';
import { StoriesAdminController } from './stories-admin.controller';
import { StoriesService } from './stories.service';

@Module({
  imports: [AuthModule],
  controllers: [StoriesController, StoriesAdminController],
  providers: [StoriesService],
})
export class StoriesModule {}
