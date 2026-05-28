import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class CreateStoryUploadUrlDto {
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(25 * 1024 * 1024)
  size!: number;
}
