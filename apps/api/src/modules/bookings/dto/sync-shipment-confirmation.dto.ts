import { ArrayNotEmpty, ArrayUnique, IsArray, IsDateString, IsIn, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export const confirmationFields = ['carrierCode', 'vessel', 'voyage', 'etd', 'eta'] as const;
export class SyncShipmentConfirmationDto {
  @ApiProperty() @IsString() soRecordId!: string;
  @ApiProperty() @IsDateString() expectedUpdatedAt!: string;
  @ApiProperty({ enum: confirmationFields, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(confirmationFields, { each: true })
  fields!: Array<(typeof confirmationFields)[number]>;
}
