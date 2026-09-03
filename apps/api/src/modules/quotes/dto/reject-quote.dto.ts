import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectQuoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
