import { IsDateString, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateQuoteReviewDto {
  @ApiPropertyOptional({ type: String, format: 'date', nullable: true, description: '拟参加船期，选填，仅内部审核使用；YYYY-MM-DD，null 清空，省略保留。不替换来源 ETD，不代表已确认订舱。' })
  @IsOptional()
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/, { message: 'plannedSailingDate 拟参加船期须为 YYYY-MM-DD。' })
  @IsDateString({ strict: true }, { message: 'plannedSailingDate 请选择有效的拟参加船期。' })
  plannedSailingDate?: string | null;

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
