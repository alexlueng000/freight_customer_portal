import { CustomerStatus, MarkupType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
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

export class CreateCustomerDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9_-]{0,49}$/)
  code!: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  shortName?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  countryCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  taxId?: string;

  @IsOptional()
  @IsString()
  @Matches(decimalPattern)
  creditLimit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  paymentTermDays?: number;

  @IsOptional()
  @IsEnum(MarkupType)
  defaultMarkupType: MarkupType = MarkupType.NONE;

  @IsOptional()
  @IsString()
  @Matches(decimalPattern)
  defaultMarkupValue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  salesOwnerId?: string;

  @IsOptional()
  @IsEnum(CustomerStatus)
  status: CustomerStatus = CustomerStatus.ACTIVE;
}
