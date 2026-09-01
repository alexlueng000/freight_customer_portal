import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SubmitBookingToCarrierDto {
  @IsOptional() @IsString() @MaxLength(200) sourceName?: string;
  @IsOptional() @IsString() @MaxLength(200) reference?: string;
  @IsOptional() @IsString() @MaxLength(1000) internalRemark?: string;
}
