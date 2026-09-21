import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { QuoteStatus, QuoteReviewStatus } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListQuotesDto {
  @ApiPropertyOptional({ description: 'Customer list: quote number contains' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  quoteNo?: string;
  @ApiPropertyOptional({ description: 'Customer list: origin port code, Chinese or English name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  pol?: string;
  @ApiPropertyOptional({
    description: 'Customer list: destination port code, Chinese or English name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  pod?: string;
  @ApiPropertyOptional({ description: 'Customer list: carrier code contains' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  carrierCode?: string;
  @ApiPropertyOptional({ enum: QuoteReviewStatus })
  @IsOptional()
  @IsEnum(QuoteReviewStatus)
  reviewStatus?: QuoteReviewStatus;
  @ApiPropertyOptional({ enum: QuoteStatus })
  @IsOptional()
  @IsEnum(QuoteStatus)
  status?: QuoteStatus;
  @ApiPropertyOptional({
    description: 'Comma-separated statuses; filters apply before pagination',
    example: 'SENT,VIEWED',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',') : value,
  )
  @IsArray()
  @ArrayMaxSize(9)
  @IsEnum(QuoteStatus, { each: true })
  statuses?: QuoteStatus[];
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}
