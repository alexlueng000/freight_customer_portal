import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  ArrayMaxSize,
  ArrayUnique,
  IsDateString,
  IsOptional,
  IsString,
  ValidateIf,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ChargeBasis } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';

class OverrideQuoteItemPriceDto {
  @ApiPropertyOptional({ description: '新增费用时省略；已有费用必须属于当前报价' })
  @IsOptional()
  @IsString({ message: 'itemId 必须是有效费用项 ID。' })
  @MinLength(1, { message: 'itemId 不能为空。' })
  @MaxLength(100, { message: 'itemId 长度不能超过 100 个字符。' })
  itemId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  chargeName?: string;

  @IsOptional()
  @IsEnum(ChargeBasis)
  chargeBasis?: ChargeBasis;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  containerType?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{1,14}(?:\.\d{1,4})?$/)
  quantity?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{1,14}(?:\.\d{1,4})?$/)
  costAmount?: string | null;

  @ApiPropertyOptional({ description: '必须与当前报价币种一致，不进行汇率换算' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
  @IsString({ message: 'unitPrice 必须是金额字符串。' })
  @Matches(/^\d{1,14}(?:\.\d{1,4})?$/, { message: 'unitPrice 必须是非负金额，最多 4 位小数。' })
  unitPrice!: string;
}
export class OverrideQuotePricesDto {
  @ApiPropertyOptional({ description: '明确删除的附加费用 ID；海运费不允许删除', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  deletedItemIds?: string[];

  @ApiPropertyOptional({ description: '与价格在同一事务保存的报价有效期', format: 'date' })
  @IsOptional()
  @IsDateString({ strict: true })
  validUntil?: string;

  @ApiPropertyOptional({ description: '与价格一起保存，仅内部可见', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNote?: string;
  @ApiPropertyOptional({ description: '客户可见报价说明与条款，随改价保存；省略时保留已有内容', maxLength: 2000 })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  customerTerms?: string;
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString({ message: 'reason 必须填写。' })
  @MinLength(3, { message: 'reason 至少需要 3 个字符。' })
  @MaxLength(500, { message: 'reason 不能超过 500 个字符。' })
  reason!: string;
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayMinSize(1, { message: 'items 至少需要包含 1 条费用。' })
  @ValidateNested({ each: true })
  @Type(() => OverrideQuoteItemPriceDto)
  items!: OverrideQuoteItemPriceDto[];
}
