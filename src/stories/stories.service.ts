import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  StoryModerationRecommendedAction,
  StoryModerationRiskLevel,
  StoryModerationStatus,
  StoryStatus,
} from '@prisma/client';
import { sanitizePlainText } from '../common/utils/sanitize-text.util';
import { CatalogCacheEventsService } from '../common/catalog-cache-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { AuthenticatedRequestUser } from '../auth/interfaces/authenticated-request.interface';
import { ConfirmStoryUploadDto } from './dto/confirm-story-upload.dto';
import { CreateStoryUploadUrlDto } from './dto/create-story-upload-url.dto';
import { ListAdminStoriesQueryDto } from './dto/list-admin-stories-query.dto';
import { ListAdminStoryMetricsQueryDto } from './dto/list-admin-story-metrics-query.dto';
import { ListStoriesQueryDto } from './dto/list-stories-query.dto';
import { UpdateAdminStoryStatusDto } from './dto/update-admin-story-status.dto';

type ImageAnalyzerResponse = {
  jobId: string;
  productId: string;
  detectedProductType: string;
  isProhibited: boolean;
  riskLevel: keyof typeof StoryModerationRiskLevel;
  confidence: number;
  flags: string[];
  recommendedAction: keyof typeof StoryModerationRecommendedAction;
};

const storyInclude = {
  views: {
    select: {
      viewerUserId: true,
    },
  },
  _count: {
    select: {
      views: true,
    },
  },
} satisfies Prisma.StoryInclude;

@Injectable()
export class StoriesService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
    private readonly catalogCacheEventsService: CatalogCacheEventsService,
  ) {}

  async createUploadUrl(
    actor: AuthenticatedRequestUser,
    createUploadUrlDto: CreateStoryUploadUrlDto,
  ) {
    return this.storageService.createStoryUploadUrl({
      userId: actor.userId,
      fileName: createUploadUrlDto.fileName,
      mimeType: createUploadUrlDto.mimeType,
      size: createUploadUrlDto.size,
    });
  }

  async confirmUpload(
    actor: AuthenticatedRequestUser,
    confirmStoryUploadDto: ConfirmStoryUploadDto,
  ) {
    await this.expireDueStories();

    this.storageService.assertStoryOwnership(
      actor.userId,
      confirmStoryUploadDto.storageKey,
    );
    await this.storageService.ensureObjectExists(confirmStoryUploadDto.storageKey);

    const existingStory = await this.prismaService.story.findUnique({
      where: {
        storagePath: confirmStoryUploadDto.storageKey,
      },
      include: storyInclude,
    });

    if (existingStory) {
      if (existingStory.ownerUserId !== actor.userId) {
        throw new NotFoundException('Story not found');
      }

      return this.serializeStory(existingStory, actor.userId);
    }

    const caption = confirmStoryUploadDto.caption?.trim()
      ? sanitizePlainText(confirmStoryUploadDto.caption, {
          preserveNewLines: false,
        })
      : null;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const readUrl = await this.storageService.createStoryReadUrl(
      confirmStoryUploadDto.storageKey,
    );
    const moderation = await this.moderateStoryImage({
      storyKey: confirmStoryUploadDto.storageKey,
      imageUrl: readUrl,
    });
    const { status, moderationStatus } = this.resolveStatuses(
      moderation.recommendedAction,
    );
    const publishedAt = status === StoryStatus.ACTIVE ? new Date() : null;

    const story = await this.prismaService.story.create({
      data: {
        ownerUserId: actor.userId,
        caption,
        status,
        storagePath: confirmStoryUploadDto.storageKey,
        storageUrl: this.storageService.createStoryPublicUrl(
          confirmStoryUploadDto.storageKey,
        ),
        mimeType: confirmStoryUploadDto.mimeType,
        sizeBytes: confirmStoryUploadDto.size,
        moderationStatus,
        moderationRiskLevel:
          moderation.riskLevel as StoryModerationRiskLevel,
        moderationConfidence: moderation.confidence,
        moderationFlags: moderation.flags,
        moderationRecommendedAction:
          moderation.recommendedAction as StoryModerationRecommendedAction,
        moderationRawResult: moderation as unknown as Prisma.InputJsonValue,
        moderationReviewedAt: new Date(),
        moderationErrorMessage: null,
        publishedAt,
        expiresAt,
      },
      include: storyInclude,
    });
    if (story.status === StoryStatus.ACTIVE) {
      this.catalogCacheEventsService.publish({
        eventType: 'story.created',
        ownerUserId: actor.userId,
      });
    }

    return this.serializeStory(story, actor.userId);
  }

  async listFeed(actor: AuthenticatedRequestUser, query: ListStoriesQueryDto) {
    await this.expireDueStories();
    const take = query.take ?? 20;
    const now = new Date();
    const stories = await this.prismaService.story.findMany({
      where: {
        ownerUserId: {
          not: actor.userId,
        },
        status: StoryStatus.ACTIVE,
        expiresAt: {
          gt: now,
        },
        deletedAt: null,
      },
      include: storyInclude,
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const grouped = new Map<
      string,
      Array<Prisma.StoryGetPayload<{ include: typeof storyInclude }>>
    >();

    for (const story of stories) {
      const bucket = grouped.get(story.ownerUserId) ?? [];
      bucket.push(story);
      grouped.set(story.ownerUserId, bucket);
    }

    const feed = await Promise.all(
      Array.from(grouped.entries()).map(async ([ownerUserId, ownerStories]) => {
        const orderedStories = ownerStories.sort(
          (left, right) =>
            new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
        );
        const previewStory = ownerStories[0];
        const previewUrl =
          this.storageService.createStoryThumbnailUrl(previewStory.storagePath) ??
          (await this.storageService.createStoryReadUrl(previewStory.storagePath));

        return {
          ownerUserId,
          previewUrl,
          latestPublishedAt:
            previewStory.publishedAt?.toISOString() ?? previewStory.createdAt.toISOString(),
          hasUnviewed: orderedStories.some(
            story => !story.views.some(view => view.viewerUserId === actor.userId),
          ),
          storyCount: orderedStories.length,
          stories: await Promise.all(
            orderedStories.map(story => this.serializeStory(story, actor.userId)),
          ),
        };
      }),
    );

    return feed
      .sort(
        (left, right) =>
          new Date(right.latestPublishedAt).getTime() -
          new Date(left.latestPublishedAt).getTime(),
      )
      .slice(0, take);
  }

  async listMine(actor: AuthenticatedRequestUser, query: ListStoriesQueryDto) {
    await this.expireDueStories();
    const take = query.take ?? 20;
    const stories = await this.prismaService.story.findMany({
      where: {
        ownerUserId: actor.userId,
        deletedAt: null,
        status: {
          in: [StoryStatus.ACTIVE, StoryStatus.UNDER_REVIEW, StoryStatus.BLOCKED],
        },
      },
      include: storyInclude,
      orderBy: [{ createdAt: 'desc' }],
      take,
    });

    return Promise.all(stories.map(story => this.serializeStory(story, actor.userId)));
  }

  async listUserStories(
    actor: AuthenticatedRequestUser,
    userId: string,
    query: ListStoriesQueryDto,
  ) {
    await this.expireDueStories();
    const take = query.take ?? 20;
    const stories = await this.prismaService.story.findMany({
      where: {
        ownerUserId: userId,
        deletedAt: null,
        status: StoryStatus.ACTIVE,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: storyInclude,
      orderBy: [{ createdAt: 'asc' }],
      take,
    });

    return Promise.all(stories.map(story => this.serializeStory(story, actor.userId)));
  }

  async markViewed(actor: AuthenticatedRequestUser, storyId: string) {
    await this.expireDueStories();
    const story = await this.prismaService.story.findUnique({
      where: {
        id: storyId,
      },
      select: {
        id: true,
        ownerUserId: true,
        status: true,
        expiresAt: true,
        deletedAt: true,
      },
    });

    if (
      !story ||
      story.deletedAt ||
      story.status !== StoryStatus.ACTIVE ||
      story.expiresAt <= new Date()
    ) {
      throw new NotFoundException('Story not found');
    }

    if (story.ownerUserId === actor.userId) {
      return {
        success: true,
        storyId,
        viewed: false,
      };
    }

    await this.prismaService.storyView.upsert({
      where: {
        storyId_viewerUserId: {
          storyId,
          viewerUserId: actor.userId,
        },
      },
      update: {
        viewedAt: new Date(),
      },
      create: {
        storyId,
        viewerUserId: actor.userId,
      },
    });

    return {
      success: true,
      storyId,
      viewed: true,
    };
  }

  async removeStory(actor: AuthenticatedRequestUser, storyId: string) {
    const story = await this.prismaService.story.findUnique({
      where: {
        id: storyId,
      },
    });

    if (!story || story.deletedAt || story.ownerUserId !== actor.userId) {
      throw new NotFoundException('Story not found');
    }

    await this.prismaService.story.update({
      where: {
        id: storyId,
      },
      data: {
        deletedAt: new Date(),
        status: StoryStatus.EXPIRED,
      },
    });

    try {
      await this.storageService.deleteObject(story.storagePath);
    } catch {
      // Story is already hidden even if the binary cleanup fails.
    }

    return {
      success: true,
      storyId,
    };
  }

  async listAdminStories(query: ListAdminStoriesQueryDto) {
    await this.expireDueStories();
    const take = query.take ?? 50;
    const search = query.q?.trim();
    const stories = await this.prismaService.story.findMany({
      where: {
        deletedAt: null,
        ...(query.ownerUserId ? { ownerUserId: query.ownerUserId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(search
          ? {
              OR: [
                { caption: { contains: search, mode: 'insensitive' } },
                { ownerUserId: { contains: search, mode: 'insensitive' } },
                { moderationFlags: { has: search } },
              ],
            }
          : {}),
      },
      include: storyInclude,
      orderBy: [{ createdAt: 'desc' }],
      take,
    });

    return Promise.all(stories.map((story) => this.serializeAdminStory(story)));
  }

  async updateAdminStoryStatus(
    storyId: string,
    dto: UpdateAdminStoryStatusDto,
  ) {
    const story = await this.prismaService.story.findUnique({
      where: { id: storyId },
    });

    if (!story || story.deletedAt) {
      throw new NotFoundException('Story not found');
    }

    const updated = await this.prismaService.story.update({
      where: { id: storyId },
      data: {
        status: dto.status,
        moderationStatus:
          dto.status === StoryStatus.ACTIVE
            ? StoryModerationStatus.APPROVED
            : dto.status === StoryStatus.BLOCKED
              ? StoryModerationStatus.BLOCKED
              : story.moderationStatus,
        moderationReviewedAt: new Date(),
        moderationErrorMessage: dto.reason?.trim() || story.moderationErrorMessage,
        publishedAt:
          dto.status === StoryStatus.ACTIVE
            ? story.publishedAt ?? new Date()
            : story.publishedAt,
      },
      include: storyInclude,
    });
    if (
      updated.status !== story.status ||
      updated.publishedAt?.getTime() !== story.publishedAt?.getTime()
    ) {
      this.catalogCacheEventsService.publish({
        eventType:
          updated.status === StoryStatus.EXPIRED ||
          updated.status === StoryStatus.BLOCKED
            ? 'story.expired'
            : 'story.created',
        ownerUserId: updated.ownerUserId,
      });
    }

    return this.serializeAdminStory(updated);
  }

  async adminDeleteStory(storyId: string) {
    const story = await this.prismaService.story.findUnique({
      where: { id: storyId },
    });

    if (!story || story.deletedAt) {
      throw new NotFoundException('Story not found');
    }

    const updated = await this.prismaService.story.update({
      where: { id: storyId },
      data: {
        deletedAt: new Date(),
        status: StoryStatus.EXPIRED,
      },
      include: storyInclude,
    });

    try {
      await this.storageService.deleteObject(story.storagePath);
    } catch {
      // La historia queda oculta aunque falle la limpieza del archivo.
    }
    this.catalogCacheEventsService.publish({
      eventType: 'story.expired',
      ownerUserId: story.ownerUserId,
    });

    return this.serializeAdminStory(updated);
  }

  async getAdminMetrics(query: ListAdminStoryMetricsQueryDto) {
    const range = this.resolveMetricsRange(query);
    const dateFilter = { gte: range.from, lte: range.to };

    const [
      storiesCreated,
      storiesPublished,
      storiesBlocked,
      storiesExpired,
      storyViews,
      activeStories,
      underReviewStories,
      blockedStories,
    ] = await Promise.all([
      this.prismaService.story.count({ where: { createdAt: dateFilter } }),
      this.prismaService.story.count({ where: { publishedAt: dateFilter } }),
      this.prismaService.story.count({
        where: { status: StoryStatus.BLOCKED, updatedAt: dateFilter },
      }),
      this.prismaService.story.count({
        where: { status: StoryStatus.EXPIRED, updatedAt: dateFilter },
      }),
      this.prismaService.storyView.count({ where: { viewedAt: dateFilter } }),
      this.prismaService.story.count({
        where: { status: StoryStatus.ACTIVE, deletedAt: null },
      }),
      this.prismaService.story.count({
        where: { status: StoryStatus.UNDER_REVIEW, deletedAt: null },
      }),
      this.prismaService.story.count({
        where: { status: StoryStatus.BLOCKED, deletedAt: null },
      }),
    ]);

    return {
      service: 'stories',
      range,
      totals: {
        activeStories,
        underReviewStories,
        blockedStories,
      },
      period: {
        storiesCreated,
        storiesPublished,
        storiesBlocked,
        storiesExpired,
        storyViews,
      },
    };
  }

  private async moderateStoryImage(input: {
    storyKey: string;
    imageUrl: string;
  }): Promise<ImageAnalyzerResponse> {
    const workerUrl = this.configService.get<string>(
      'moderation.imageAnalyzerUrl',
    );

    if (!workerUrl) {
      throw new ServiceUnavailableException(
        'Image analyzer worker is not configured',
      );
    }

    const timeoutMs =
      this.configService.get<number>('moderation.imageAnalyzerTimeoutMs') ?? 15000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(
        `${workerUrl.replace(/\/+$/, '')}/analyze/product-image`,
        {
          method: 'POST',
          headers: this.buildWorkerHeaders(),
          body: JSON.stringify({
            jobId: `story_${input.storyKey}`,
            productId: input.storyKey,
            imageUrl: input.imageUrl,
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new ServiceUnavailableException(
          `Image analyzer failed with status ${response.status}`,
        );
      }

      return (await response.json()) as ImageAnalyzerResponse;
    } finally {
      clearTimeout(timeout);
    }
  }

  private resolveStatuses(
    recommendedAction: keyof typeof StoryModerationRecommendedAction,
  ) {
    if (
      recommendedAction === StoryModerationRecommendedAction.APPROVE ||
      recommendedAction === StoryModerationRecommendedAction.KEEP_VISIBLE
    ) {
      return {
        status: StoryStatus.ACTIVE,
        moderationStatus: StoryModerationStatus.APPROVED,
      };
    }

    if (
      recommendedAction === StoryModerationRecommendedAction.REMOVE_PRODUCT
    ) {
      return {
        status: StoryStatus.BLOCKED,
        moderationStatus: StoryModerationStatus.BLOCKED,
      };
    }

    return {
      status: StoryStatus.UNDER_REVIEW,
      moderationStatus: StoryModerationStatus.NEEDS_REVIEW,
    };
  }

  private buildWorkerHeaders() {
    const internalToken = this.configService.get<string>(
      'moderation.internalToken',
    );

    if (!internalToken) {
      throw new ServiceUnavailableException(
        'Moderation internal token is not configured',
      );
    }

    return {
      'Content-Type': 'application/json',
      'X-Internal-Token': internalToken,
    };
  }

  private async serializeStory(
    story: Prisma.StoryGetPayload<{ include: typeof storyInclude }>,
    viewerUserId: string,
  ) {
    return {
      id: story.id,
      ownerUserId: story.ownerUserId,
      caption: story.caption,
      status: story.status,
      mimeType: story.mimeType,
      mediaUrl: await this.storageService.createStoryReadUrl(story.storagePath),
      thumbnailUrl: this.storageService.createStoryThumbnailUrl(
        story.storagePath,
      ),
      viewCount: story._count.views,
      hasViewed: story.views.some(view => view.viewerUserId === viewerUserId),
      expiresAt: story.expiresAt.toISOString(),
      publishedAt: story.publishedAt?.toISOString() ?? null,
      createdAt: story.createdAt.toISOString(),
      moderation: {
        status: story.moderationStatus,
        riskLevel: story.moderationRiskLevel,
        confidence: story.moderationConfidence,
        flags: story.moderationFlags,
        recommendedAction: story.moderationRecommendedAction,
        errorMessage: story.moderationErrorMessage,
      },
    };
  }

  private async serializeAdminStory(
    story: Prisma.StoryGetPayload<{ include: typeof storyInclude }>,
  ) {
    return {
      id: story.id,
      ownerUserId: story.ownerUserId,
      caption: story.caption,
      status: story.status,
      storageUrl: story.storageUrl,
      mediaUrl: await this.storageService.createStoryReadUrl(story.storagePath),
      thumbnailUrl: this.storageService.createStoryThumbnailUrl(
        story.storagePath,
      ),
      mimeType: story.mimeType,
      sizeBytes: story.sizeBytes,
      viewCount: story._count.views,
      expiresAt: story.expiresAt.toISOString(),
      publishedAt: story.publishedAt?.toISOString() ?? null,
      createdAt: story.createdAt.toISOString(),
      updatedAt: story.updatedAt.toISOString(),
      deletedAt: story.deletedAt?.toISOString() ?? null,
      moderation: {
        status: story.moderationStatus,
        riskLevel: story.moderationRiskLevel,
        confidence: story.moderationConfidence,
        flags: story.moderationFlags,
        recommendedAction: story.moderationRecommendedAction,
        errorMessage: story.moderationErrorMessage,
        reviewedAt: story.moderationReviewedAt?.toISOString() ?? null,
      },
    };
  }

  private resolveMetricsRange(query: ListAdminStoryMetricsQueryDto) {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);

    return { from, to };
  }

  private async expireDueStories() {
    const dueStories = await this.prismaService.story.findMany({
      where: {
        deletedAt: null,
        expiresAt: {
          lte: new Date(),
        },
        status: {
          in: [StoryStatus.ACTIVE, StoryStatus.UNDER_REVIEW],
        },
      },
      select: {
        id: true,
        ownerUserId: true,
      },
    });

    if (!dueStories.length) {
      return;
    }

    await this.prismaService.story.updateMany({
      where: {
        id: {
          in: dueStories.map((story) => story.id),
        },
        deletedAt: null,
        status: {
          in: [StoryStatus.ACTIVE, StoryStatus.UNDER_REVIEW],
        },
      },
      data: {
        status: StoryStatus.EXPIRED,
      },
    });
    for (const ownerUserId of [
      ...new Set(dueStories.map((story) => story.ownerUserId)),
    ]) {
      this.catalogCacheEventsService.publish({
        eventType: 'story.expired',
        ownerUserId,
      });
    }
  }
}
