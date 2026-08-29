import { RateStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
const upper = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toUpperCase() || undefined : value;
export class ListRatesDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() || undefined : value) @IsString() @MaxLength(200) search?: string;
  @IsOptional() @Transform(upper) @IsString() @Matches(/^[A-Z0-9]{3,10}$/) polCode?: string;
  @IsOptional() @Transform(upper) @IsString() @Matches(/^[A-Z0-9]{3,10}$/) podCode?: string;
  @IsOptional() @Transform(upper) @IsString() @Matches(/^[A-Z0-9]{2,20}$/) carrierCode?: string;
  @IsOptional() @Transform(upper) @IsString() @Matches(/^[A-Z0-9]{2,20}$/) containerType?: string;
  @IsOptional() @IsEnum(RateStatus) status?: RateStatus;
  @IsOptional() @IsDateString({ strict: true }) validOn?: string;
}
