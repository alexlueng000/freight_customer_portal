import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class QuoteApprovalSettingsDto {
  @ApiProperty({ description: 'Require tenant administrator approval and publication for formal quotes' })
  @IsBoolean() quoteApprovalRequired!: boolean;
}
export class RejectQuoteApprovalDto {
  @ApiProperty({ description: 'Internal rejection reason', minLength: 3, maxLength: 2000 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(3) @MaxLength(2000) reason!: string;
}
