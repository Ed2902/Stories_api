import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListAdminStoriesQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  ownerUserId?: string;

  @IsOptional()
  @IsIn(['UNDER_REVIEW', 'ACTIVE', 'BLOCKED', 'EXPIRED'])
  status?: 'UNDER_REVIEW' | 'ACTIVE' | 'BLOCKED' | 'EXPIRED';

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  @Max(5000)
  skip?: number;
}
