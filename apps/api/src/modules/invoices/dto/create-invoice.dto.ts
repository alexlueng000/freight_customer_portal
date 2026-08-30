import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CreateInvoiceLineDto {
  @IsString() @Matches(/^[A-Z0-9_]{1,50}$/) chargeCode!: string;
  @IsString() @MaxLength(200) description!: string;
  @IsString() @Matches(/^\d{1,14}(?:\.\d{1,4})?$/) quantity!: string;
  @IsString() @Matches(/^\d{1,14}(?:\.\d{1,4})?$/) unitPrice!: string;
}

export class CreateInvoiceDto {
  @IsString() shipmentId!: string;
  @IsString() @Matches(/^[A-Z]{3}$/) currency!: string;
  @IsString() @Matches(/^\d{1,14}(?:\.\d{1,4})?$/) taxAmount!: string;
  @IsDateString() dueDate!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceLineDto)
  lines!: CreateInvoiceLineDto[];
}
