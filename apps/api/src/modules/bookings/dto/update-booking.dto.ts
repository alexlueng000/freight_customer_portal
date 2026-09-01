import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  IsDateString,
  IsEnum,
} from 'class-validator';
import { PackageType } from '@prisma/client';

export class UpdateBookingDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(300) commodity?: string;
  @IsOptional() @IsEnum(PackageType) packageType?: PackageType;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(999999) packages?: number;
  @IsOptional() @IsString() @Matches(/^\d{1,14}(?:\.\d{1,4})?$/) grossWeight?: string;
  @IsOptional() @IsString() @Matches(/^\d{1,14}(?:\.\d{1,4})?$/) volumeCbm?: string;
  @IsOptional() @IsDateString({ strict: true }) cargoReadyDate?: string;
  @IsOptional() @IsBoolean() isDangerousGoods?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) specialInstructions?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) sourceShipperId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) shipperName?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(1000) shipperAddress?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(150) bookingContactName?: string;
  @IsOptional() @IsEmail() @MaxLength(320) bookingContactEmail?: string;
  @IsOptional() @IsString() @MaxLength(50) bookingContactPhone?: string;
}
