import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateShipmentDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) vessel?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(50) voyage?: string;
  @IsOptional() @IsDateString() eta?: string;
}
