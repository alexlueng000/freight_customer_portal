import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class ShipmentActionDto {
  @IsOptional() @IsDateString() occurredAt?: string;
  @IsOptional() @IsString() @MaxLength(500) remark?: string;
}
