import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ShipmentActionDto {
  @IsOptional() @IsString() @MaxLength(500) remark?: string;
}
