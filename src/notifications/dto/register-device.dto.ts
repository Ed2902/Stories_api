import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterNotificationDeviceDto {
  @IsString()
  @MaxLength(255)
  pushToken!: string;

  @IsString()
  @IsIn(['android', 'ios'])
  platform!: 'android' | 'ios';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  appVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  locale?: string;
}
