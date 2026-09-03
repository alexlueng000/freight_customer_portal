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
  @IsString({ message: 'itemId 必须是有效费用项 ID。' })
  @MinLength(1, { message: 'itemId 不能为空。' })
  @MaxLength(100, { message: 'itemId 长度不能超过 100 个字符。' })
  itemId!: string;
  @IsString({ message: 'unitPrice 必须是金额字符串。' })
  @Matches(/^\d{1,14}(?:\.\d{1,4})?$/, { message: 'unitPrice 必须是非负金额，最多 4 位小数。' })
  unitPrice!: string;
}
export class OverrideQuotePricesDto {
  @IsString({ message: 'reason 必须填写。' })
  @MinLength(3, { message: 'reason 至少需要 3 个字符。' })
  @MaxLength(500, { message: 'reason 不能超过 500 个字符。' })
  reason!: string;
  @IsArray()
  @ArrayMinSize(1, { message: 'items 至少需要包含 1 条费用。' })
  @ValidateNested({ each: true })
  @Type(() => OverrideQuoteItemPriceDto)
  items!: OverrideQuoteItemPriceDto[];
}
