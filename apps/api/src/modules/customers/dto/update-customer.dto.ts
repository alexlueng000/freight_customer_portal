import { CustomerStatus, MarkupType } from '@prisma/client';
import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const decimalPattern = /^\d{1,14}(?:\.\d{1,4})?$/;

export class UpdateCustomerDto {
  @IsOptional()
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : (value as unknown),
  )
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional() @IsString() @MaxLength(100) shortName?: string | null;

  @IsOptional()
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim().toUpperCase() : (value as unknown),
  )
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  countryCode?: string | null;

  @IsOptional() @IsString() @MaxLength(100) taxId?: string | null;

  @IsOptional() @IsString() @Matches(decimalPattern) creditLimit?: string | null;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(3650) paymentTermDays?: number | null;

  @IsOptional() @IsEnum(MarkupType) defaultMarkupType?: MarkupType;

  @IsOptional() @IsString() @Matches(decimalPattern) defaultMarkupValue?: string | null;

  @IsOptional() @IsString() @MaxLength(100) salesOwnerId?: string | null;

  @IsOptional() @IsEnum(CustomerStatus) status?: CustomerStatus;
}
