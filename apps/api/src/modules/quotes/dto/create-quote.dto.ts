import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const quoteRequestedServices = [
  'ORIGIN_LOGISTICS',
  'ORIGIN_CUSTOMS_CLEARANCE',
  'DESTINATION_CUSTOMS_CLEARANCE',
  'DESTINATION_LOGISTICS',
] as const;

export class CreateQuoteCargoItemDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'commodity 必须是文本。' })
  @MinLength(1, { message: '请填写货物品名。' })
  @MaxLength(500, { message: 'commodity 不能超过 500 个字符。' })
  commodity!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 }, { message: 'grossWeightKg 必须是有效重量。' })
  @Min(0.001, { message: 'grossWeightKg 必须大于 0。' })
  @Max(999999999, { message: 'grossWeightKg 超出允许范围。' })
  grossWeightKg!: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'specialRequirements 必须是文本。' })
  @MaxLength(2000, { message: 'specialRequirements 不能超过 2000 个字符。' })
  specialRequirements?: string;
}

export class CreateQuoteDto {
  @IsString({ message: 'rateId 必须是有效的运价 ID。' })
  @MinLength(1, { message: 'rateId 不能为空。' })
  @MaxLength(100, { message: 'rateId 长度不能超过 100 个字符。' })
  rateId!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString({ message: 'containerType 必须是有效箱型。' })
  @Matches(/^[A-Z0-9]{2,20}$/, { message: 'containerType 格式不正确。' })
  containerType!: string;

  @Type(() => Number)
  @IsInt({ message: 'quantity 必须是整数。' })
  @Min(1, { message: 'quantity 必须大于等于 1。' })
  @Max(999, { message: 'quantity 不能超过 999。' })
  quantity!: number;

  @IsArray({ message: 'cargoItems 必须是货物明细数组。' })
  @ArrayMinSize(1, { message: '请至少添加一种货物。' })
  @ArrayMaxSize(50, { message: '一次报价最多添加 50 种货物。' })
  @ValidateNested({ each: true })
  @Type(() => CreateQuoteCargoItemDto)
  cargoItems!: CreateQuoteCargoItemDto[];

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'pickupAddress 必须是文本。' })
  @MaxLength(1000, { message: 'pickupAddress 不能超过 1000 个字符。' })
  pickupAddress?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'deliveryAddress 必须是文本。' })
  @MaxLength(1000, { message: 'deliveryAddress 不能超过 1000 个字符。' })
  deliveryAddress?: string;

  @IsArray({ message: 'requestedServices 必须是服务代码数组。' })
  @ArrayMaxSize(4, { message: 'requestedServices 最多选择 4 项。' })
  @IsIn(quoteRequestedServices, { each: true, message: 'requestedServices 包含无效服务代码。' })
  requestedServices!: string[];
}
