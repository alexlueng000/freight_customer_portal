import { BookingSoSourceType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateBookingSoRecordDto {
  @IsString() @MinLength(1) @MaxLength(100) soNumber!: string;
  @IsEnum(BookingSoSourceType) sourceType!: BookingSoSourceType;
  @IsOptional() @IsString() @MaxLength(200) sourceName?: string;
  @IsOptional() @IsString() @MaxLength(20) carrierCode?: string;
  @IsOptional() @IsString() @MaxLength(100) vessel?: string;
  @IsOptional() @IsString() @MaxLength(50) voyage?: string;
  @IsOptional() @IsDateString() etd?: string;
  @IsOptional() @IsDateString() eta?: string;
  @IsOptional() @IsDateString() cyCutoffAt?: string;
  @IsOptional() @IsDateString() siCutoffAt?: string;
  @IsOptional() @IsDateString() vgmCutoffAt?: string;
  @IsOptional() @IsString() @MaxLength(300) terminal?: string;
  @IsDateString() receivedAt!: string;
}
