import { IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

export class ConfirmStoryUploadDto {
  @IsString()
  storageKey!: string;

  @IsString()
  @MaxLength(180)
  caption!: string;

  @IsString()
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(25 * 1024 * 1024)
  size!: number;
}
