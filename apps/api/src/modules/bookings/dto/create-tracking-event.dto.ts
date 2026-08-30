import { IsBoolean, IsDateString, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateTrackingEventDto {
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,49}$/) eventType!: string;
  @IsDateString() eventTime!: string;
  @IsOptional() @IsString() @MaxLength(10) locationCode?: string;
  @IsOptional() @IsString() @MaxLength(150) locationName?: string;
  @IsOptional() @IsString() @MaxLength(500) remark?: string;
  @IsOptional() @IsBoolean() customerVisible?: boolean;
}
