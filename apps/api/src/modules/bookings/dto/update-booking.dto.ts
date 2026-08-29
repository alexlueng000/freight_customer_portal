import { Type } from 'class-transformer';
import {
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
  ValidateNested,
} from 'class-validator';

export class BookingContainerRequestDto {
  @IsString() @MinLength(2) @MaxLength(20) containerType!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(999) quantity!: number;
  @IsOptional() @IsString() @Matches(/^\d{1,14}(?:\.\d{1,4})?$/) weightPerContainer?: string;
  @IsOptional() @IsString() @MaxLength(500) remark?: string;
}

export class UpdateBookingDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(300) commodity?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(999999) packages?: number;
  @IsOptional() @IsString() @Matches(/^\d{1,14}(?:\.\d{1,4})?$/) grossWeight?: string;
  @IsOptional() @IsString() @Matches(/^\d{1,14}(?:\.\d{1,4})?$/) volumeCbm?: string;
  @IsOptional() @IsBoolean() isDangerousGoods?: boolean;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) shipperName?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(1000) shipperAddress?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(150) bookingContactName?: string;
  @IsOptional() @IsEmail() @MaxLength(320) bookingContactEmail?: string;
  @IsOptional() @IsString() @MaxLength(50) bookingContactPhone?: string;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BookingContainerRequestDto)
  containerRequests?: BookingContainerRequestDto[];
}
