import { ChargeBasis, RateStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

const decimalPattern = /^\d{1,14}(?:\.\d{1,4})?$/;
const code = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toUpperCase() : value;

export class RatePriceDto {
  @Transform(code) @IsString() @Matches(/^[A-Z0-9]{2,20}$/) containerType!: string;
  @IsString() @Matches(decimalPattern) costAmount!: string;
  @IsOptional() @IsString() @Matches(decimalPattern) sellAmount?: string;
  @Transform(code) @IsString() @Matches(/^[A-Z]{3}$/) currency!: string;
  @IsOptional() @IsString() @MaxLength(500) remark?: string;
}

export class RateChargeDto {
  @Transform(code) @IsString() @Matches(/^[A-Z0-9_-]{1,30}$/) chargeCode!: string;
  @IsString() @MaxLength(150) chargeName!: string;
  @IsEnum(ChargeBasis) chargeBasis!: ChargeBasis;
  @IsOptional() @Transform(code) @IsString() @Matches(/^[A-Z0-9]{2,20}$/) containerType?: string;
  @IsString() @Matches(decimalPattern) amount!: string;
  @Transform(code) @IsString() @Matches(/^[A-Z]{3}$/) currency!: string;
  @IsOptional() @IsBoolean() isIncluded = false;
}

export class CreateRateDto {
  @Transform(code) @IsString() @Matches(/^[A-Z0-9][A-Z0-9_-]{0,49}$/) rateNo!: string;
  @Transform(code) @IsString() @Matches(/^[A-Z0-9]{3,10}$/) polCode!: string;
  @IsString() @MaxLength(150) polName!: string;
  @Transform(code) @IsString() @Matches(/^[A-Z0-9]{3,10}$/) podCode!: string;
  @IsString() @MaxLength(150) podName!: string;
  @Transform(code) @IsString() @Matches(/^[A-Z0-9]{2,20}$/) carrierCode!: string;
  @IsOptional() @IsString() @MaxLength(150) serviceName?: string;
  @IsDateString({ strict: true }) effectiveDate!: string;
  @IsDateString({ strict: true }) expiryDate!: string;
  @IsOptional() @IsDateString() etd?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(365) transitDays?: number;
  @IsOptional() @IsString() @MaxLength(200) supplierName?: string;
  @IsOptional() @IsString() @MaxLength(100) contractNo?: string;
  @Transform(code) @IsString() @Matches(/^[A-Z]{3}$/) currency!: string;
  @IsOptional() @IsEnum(RateStatus) status: RateStatus = RateStatus.DRAFT;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => RatePriceDto) prices!: RatePriceDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => RateChargeDto) charges: RateChargeDto[] = [];
}
