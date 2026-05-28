import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListStoriesQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  take?: number;
}
