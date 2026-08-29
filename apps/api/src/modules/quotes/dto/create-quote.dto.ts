import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateQuoteDto {
  @IsString() @MinLength(1) @MaxLength(100) rateId!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z0-9]{2,20}$/)
  containerType!: string;
}
