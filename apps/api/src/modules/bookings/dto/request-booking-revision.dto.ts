import { BookingRevisionReasonCode } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RequestBookingRevisionDto {
  @IsEnum(BookingRevisionReasonCode) reasonCode!: BookingRevisionReasonCode;
  @IsString() @MinLength(3) @MaxLength(1000) customerVisibleRemark!: string;
  @IsOptional() @IsString() @MaxLength(1000) internalRemark?: string;
}
