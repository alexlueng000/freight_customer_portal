import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateShipmentDto {
  @ApiPropertyOptional({ description: 'Expected current confirmation ID; stale versions return 409. Shipment fields come from the current effective confirmation on the server.' })
  @IsOptional() @IsString() @MaxLength(100) soRecordId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) vessel?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(50) voyage?: string;
  @IsOptional() @IsDateString() eta?: string;
}
