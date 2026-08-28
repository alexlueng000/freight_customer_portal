import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';

const trimOptional = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class CreateCustomerContactDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 150)
  name!: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(100)
  roleTitle?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary = false;

  @IsOptional()
  @IsBoolean()
  isBookingContact = false;

  @IsOptional()
  @IsBoolean()
  isDocumentContact = false;
}
