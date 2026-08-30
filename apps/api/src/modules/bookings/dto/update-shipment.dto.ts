import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateShipmentDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) vessel?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(50) voyage?: string;
  @IsOptional() @IsDateString() etd?: string;
  @IsOptional() @IsDateString() eta?: string;
  @IsOptional() @IsString() @MaxLength(100) mblNo?: string;
  @IsOptional() @IsString() @MaxLength(100) hblNo?: string;
}
