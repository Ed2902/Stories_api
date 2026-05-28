import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  UserNotificationPriority,
  UserNotificationType,
} from '@prisma/client';

export class PublishNotificationDto {
  @IsOptional()
  @IsBoolean()
  broadcast?: boolean;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  userIds?: string[];

  @IsEnum(UserNotificationType)
  type!: UserNotificationType;

  @IsString()
  @MaxLength(140)
  title!: string;

  @IsString()
  @MaxLength(280)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  subtitle?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(UserNotificationPriority)
  priority?: UserNotificationPriority;

  @IsOptional()
  @IsBoolean()
  sendPush?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sourceService?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceEvent?: string;
}
