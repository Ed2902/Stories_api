import { IsDateString, IsOptional } from 'class-validator';

export class ListAdminStoryMetricsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

