import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

class OverrideQuoteItemPriceDto {
  @IsString() @MinLength(1) @MaxLength(100) itemId!: string;
  @IsString() @Matches(/^\d{1,14}(?:\.\d{1,4})?$/) unitPrice!: string;
}
export class OverrideQuotePricesDto {
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OverrideQuoteItemPriceDto)
  items!: OverrideQuoteItemPriceDto[];
}
