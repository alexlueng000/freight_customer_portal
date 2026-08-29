import { Transform, Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

const upper = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toUpperCase() : value;
export class SearchCustomerRatesDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @Transform(upper) @IsString() @Matches(/^[A-Z0-9]{3,10}$/) polCode!: string;
  @Transform(upper) @IsString() @Matches(/^[A-Z0-9]{3,10}$/) podCode!: string;
  @Transform(upper) @IsString() @Matches(/^[A-Z0-9]{2,20}$/) containerType!: string;
  @IsDateString({ strict: true }) etdFrom!: string;
  @IsDateString({ strict: true }) etdTo!: string;
  @IsOptional() @Transform(upper) @IsString() @Matches(/^[A-Z0-9]{2,20}$/) carrierCode?: string;
}
