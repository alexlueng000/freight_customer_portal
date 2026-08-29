import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class BookingActionDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(500) remark?: string;
}
