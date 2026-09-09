import { Transform, Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
export class SearchCustomerRatesDto {
  @ApiPropertyOptional({ description: '起运地中文名、英文名或港口代码；与 polCode 同时提供时取交集', example: '深圳', maxLength: 150 })
  @IsOptional() @IsString() @MaxLength(150) pol?: string;
  @ApiPropertyOptional({ description: '目的地中文名、英文名或港口代码；与 podCode 同时提供时取交集', example: '洛杉矶', maxLength: 150 })
  @IsOptional() @IsString() @MaxLength(150) pod?: string;
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @Transform(upper) @IsString() @Matches(/^[A-Z0-9]{3,10}$/) polCode?: string;
  @IsOptional() @Transform(upper) @IsString() @Matches(/^[A-Z0-9]{3,10}$/) podCode?: string;
  @IsOptional() @Transform(upper) @IsString() @Matches(/^[A-Z0-9]{2,20}$/) containerType?: string;
  @IsOptional() @IsDateString({ strict: true }) etdFrom?: string;
  @IsOptional() @IsDateString({ strict: true }) etdTo?: string;
  @IsOptional() @Transform(upper) @IsString() @Matches(/^[A-Z0-9]{2,20}$/) carrierCode?: string;
}
