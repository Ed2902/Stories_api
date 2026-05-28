import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAdminStoryStatusDto {
  @IsIn(['UNDER_REVIEW', 'ACTIVE', 'BLOCKED', 'EXPIRED'])
  status!: 'UNDER_REVIEW' | 'ACTIVE' | 'BLOCKED' | 'EXPIRED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

