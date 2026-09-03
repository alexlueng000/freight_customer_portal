import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateQuoteReviewDto {
  @IsOptional()
  @IsDateString({}, { message: 'validUntil 必须是有效日期。' })
  validUntil?: string;

  @IsOptional()
  @IsString({ message: 'customerTerms 必须是文本。' })
  @MaxLength(2000, { message: 'customerTerms 不能超过 2000 个字符。' })
  customerTerms?: string;

  @IsOptional()
  @IsString({ message: 'internalNote 必须是文本。' })
  @MaxLength(2000, { message: 'internalNote 不能超过 2000 个字符。' })
  internalNote?: string;
}
