import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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
  IsIn,
  ValidateNested,
} from 'class-validator';
import { PackageType } from '@prisma/client';

const bookingRequestedServices = [
  'ORIGIN_PICKUP',
  'EXPORT_CUSTOMS',
  'IMPORT_CUSTOMS',
  'DESTINATION_DELIVERY',
] as const;
const bookingIncoterms = ['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'DAP', 'DDP', 'OTHER'] as const;

export class UpdateBookingCargoItemDto {
  @IsString() @MinLength(1) @MaxLength(100) id!: string;
  @IsString() @MinLength(1) @MaxLength(500) commodity!: string;
  @IsOptional() @IsString() @Matches(/^\d{1,14}(?:\.\d{1,3})?$/) estimatedGrossWeight?: string;
  @IsOptional() @IsString() @MaxLength(200) cargoNature?: string;
  @IsOptional() @IsString() @MaxLength(2000) specialRequirement?: string;
}

export class UpdateBookingContainerRequestDto {
  @IsString() @MinLength(1) @MaxLength(20) containerType!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(999) quantity!: number;
}

export class UpdateBookingDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(10) polCode?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(10) podCode?: string;
  @IsOptional() @IsString() @MaxLength(20) carrierCode?: string;
  @IsOptional() @IsString() @MaxLength(200) serviceName?: string;
  @IsOptional() @IsDateString({ strict: true }) etd?: string;
  @IsOptional() @IsIn(bookingIncoterms) incoterm?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsIn(bookingRequestedServices, { each: true })
  requestedServices?: string[];
  @IsOptional() @IsString() @MaxLength(1000) pickupLocationText?: string;
  @IsOptional() @IsString() @MaxLength(1000) deliveryLocationText?: string;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => UpdateBookingCargoItemDto)
  cargoItems?: UpdateBookingCargoItemDto[];
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => UpdateBookingContainerRequestDto)
  containerRequests?: UpdateBookingContainerRequestDto[];
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
