import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentAuthUser } from '../auth/decorators/current-auth-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequestUser } from '../auth/interfaces/authenticated-request.interface';
import { ConfirmStoryUploadDto } from './dto/confirm-story-upload.dto';
import { CreateStoryUploadUrlDto } from './dto/create-story-upload-url.dto';
import { ListStoriesQueryDto } from './dto/list-stories-query.dto';
import { StoriesService } from './stories.service';

@Controller('stories')
@UseGuards(JwtAuthGuard)
export class StoriesController {
  constructor(private readonly storiesService: StoriesService) {}

  @Get('feed')
  listFeed(
    @CurrentAuthUser() actor: AuthenticatedRequestUser,
    @Query() query: ListStoriesQueryDto,
  ) {
    return this.storiesService.listFeed(actor, query);
  }

  @Get('me')
  listMine(
    @CurrentAuthUser() actor: AuthenticatedRequestUser,
    @Query() query: ListStoriesQueryDto,
  ) {
    return this.storiesService.listMine(actor, query);
  }

  @Get('users/:userId')
  listUserStories(
    @CurrentAuthUser() actor: AuthenticatedRequestUser,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Query() query: ListStoriesQueryDto,
  ) {
    return this.storiesService.listUserStories(actor, userId, query);
  }

  @Post('upload-url')
  createUploadUrl(
    @CurrentAuthUser() actor: AuthenticatedRequestUser,
    @Body() createUploadUrlDto: CreateStoryUploadUrlDto,
  ) {
    return this.storiesService.createUploadUrl(actor, createUploadUrlDto);
  }

  @Post('confirm')
  confirmUpload(
    @CurrentAuthUser() actor: AuthenticatedRequestUser,
    @Body() confirmStoryUploadDto: ConfirmStoryUploadDto,
  ) {
    return this.storiesService.confirmUpload(actor, confirmStoryUploadDto);
  }

  @Post(':storyId/view')
  markViewed(
    @CurrentAuthUser() actor: AuthenticatedRequestUser,
    @Param('storyId', new ParseUUIDPipe()) storyId: string,
  ) {
    return this.storiesService.markViewed(actor, storyId);
  }

  @Delete(':storyId')
  removeStory(
    @CurrentAuthUser() actor: AuthenticatedRequestUser,
    @Param('storyId', new ParseUUIDPipe()) storyId: string,
  ) {
    return this.storiesService.removeStory(actor, storyId);
  }
}
