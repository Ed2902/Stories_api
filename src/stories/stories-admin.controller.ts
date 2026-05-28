import { Body, Controller, Delete, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard';
import { AdminPermissionsGuard } from '../auth/guards/admin-permissions.guard';
import { RequireAdminPermissions } from '../auth/decorators/require-admin-permissions.decorator';
import { ListAdminStoriesQueryDto } from './dto/list-admin-stories-query.dto';
import { ListAdminStoryMetricsQueryDto } from './dto/list-admin-story-metrics-query.dto';
import { UpdateAdminStoryStatusDto } from './dto/update-admin-story-status.dto';
import { StoriesService } from './stories.service';

@Controller('stories/admin')
@UseGuards(AdminJwtAuthGuard, AdminPermissionsGuard)
export class StoriesAdminController {
  constructor(private readonly storiesService: StoriesService) {}

  @Get('metrics')
  @RequireAdminPermissions('stats.read')
  getMetrics(@Query() query: ListAdminStoryMetricsQueryDto) {
    return this.storiesService.getAdminMetrics(query);
  }

  @Get()
  @RequireAdminPermissions('stories.read')
  listStories(@Query() query: ListAdminStoriesQueryDto) {
    return this.storiesService.listAdminStories(query);
  }

  @Patch(':storyId/status')
  @RequireAdminPermissions('stories.moderate')
  updateStatus(
    @Param('storyId') storyId: string,
    @Body() dto: UpdateAdminStoryStatusDto,
  ) {
    return this.storiesService.updateAdminStoryStatus(storyId, dto);
  }

  @Delete(':storyId')
  @RequireAdminPermissions('stories.moderate')
  deleteStory(@Param('storyId') storyId: string) {
    return this.storiesService.adminDeleteStory(storyId);
  }
}

