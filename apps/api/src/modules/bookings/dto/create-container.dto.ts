import { IsDateString, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateContainerDto {
  @IsString() @Matches(/^[A-Z]{4}\d{7}$/) containerNo!: string;
  @IsString() @Matches(/^[A-Z0-9]{2,20}$/) containerType!: string;
  @IsOptional() @IsString() @MaxLength(50) sealNo?: string;
  @IsOptional() @IsString() @Matches(/^\d{1,14}(?:\.\d{1,4})?$/) vgmWeight?: string;
  @IsOptional() @IsDateString() pickupAt?: string;
  @IsOptional() @IsDateString() gateInAt?: string;
  @IsOptional() @IsDateString() loadedAt?: string;
  @IsOptional() @IsDateString() dischargedAt?: string;
}
