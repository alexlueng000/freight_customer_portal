import { Transform, Type } from 'class-transformer';
import { IsInt, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

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
}
