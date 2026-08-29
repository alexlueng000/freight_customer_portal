import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateBookingDto {
  @IsString() @MinLength(1) @MaxLength(100) quoteId!: string;
}
