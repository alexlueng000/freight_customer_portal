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
  ValidateIf,
  ValidateNested,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const quoteRequestedServices = [
  'ORIGIN_PICKUP',
  'EXPORT_CUSTOMS',
  'IMPORT_CUSTOMS',
  'DESTINATION_DELIVERY',
] as const;
export const quoteIncoterms = ['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'DAP', 'DDP', 'OTHER'] as const;

export class CreateQuoteCargoItemDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'commodity 必须是文本。' })
  @MinLength(1, { message: '请填写货物品名。' })
  @MaxLength(500, { message: 'commodity 不能超过 500 个字符。' })
  commodity!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 }, { message: 'estimatedGrossWeight 必须是有效重量。' })
  @Min(0.001, { message: 'estimatedGrossWeight 必须大于 0。' })
  @Max(999999999, { message: 'estimatedGrossWeight 超出允许范围。' })
  estimatedGrossWeight?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'cargoNature 必须是文本。' })
  @MaxLength(200, { message: 'cargoNature 不能超过 200 个字符。' })
  cargoNature?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'specialRequirement 必须是文本。' })
  @MaxLength(2000, { message: 'specialRequirement 不能超过 2000 个字符。' })
  specialRequirement?: string;
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
  @IsInt({ message: 'containerQuantity 必须是整数。' })
  @Min(1, { message: 'containerQuantity 必须大于等于 1。' })
  @Max(999, { message: 'containerQuantity 不能超过 999。' })
  containerQuantity!: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsIn(quoteIncoterms, { message: 'incoterm 包含无效值。' })
  incoterm?: string;

  @IsArray({ message: 'cargoItems 必须是货物明细数组。' })
  @ArrayMinSize(1, { message: '请至少添加一种货物。' })
  @ArrayMaxSize(50, { message: '一次报价最多添加 50 种货物。' })
  @ValidateNested({ each: true })
  @Type(() => CreateQuoteCargoItemDto)
  cargoItems!: CreateQuoteCargoItemDto[];

  @ValidateIf(
    (dto: CreateQuoteDto) =>
      dto.requestedServices?.includes('ORIGIN_PICKUP') || dto.pickupLocationText !== undefined,
  )
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'pickupLocationText 必须是文本。' })
  @MinLength(1, { message: '选择起运地拖车后，请填写 Pickup Location。' })
  @MaxLength(1000, { message: 'pickupLocationText 不能超过 1000 个字符。' })
  pickupLocationText?: string;

  @ValidateIf(
    (dto: CreateQuoteDto) =>
      dto.requestedServices?.includes('DESTINATION_DELIVERY') ||
      dto.deliveryLocationText !== undefined,
  )
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'deliveryLocationText 必须是文本。' })
  @MinLength(1, { message: '选择目的地派送后，请填写 Delivery Location。' })
  @MaxLength(1000, { message: 'deliveryLocationText 不能超过 1000 个字符。' })
  deliveryLocationText?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'exportCustomsRemark 必须是文本。' })
  @MaxLength(1000, { message: 'exportCustomsRemark 不能超过 1000 个字符。' })
  exportCustomsRemark?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'importCustomsRemark 必须是文本。' })
  @MaxLength(1000, { message: 'importCustomsRemark 不能超过 1000 个字符。' })
  importCustomsRemark?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'customerRemarks 必须是文本。' })
  @MaxLength(2000, { message: 'customerRemarks 不能超过 2000 个字符。' })
  customerRemarks?: string;

  @IsArray({ message: 'requestedServices 必须是服务代码数组。' })
  @ArrayMaxSize(4, { message: 'requestedServices 最多选择 4 项。' })
  @IsIn(quoteRequestedServices, { each: true, message: 'requestedServices 包含无效服务代码。' })
  requestedServices!: string[];
}
