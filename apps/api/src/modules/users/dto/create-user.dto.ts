import { RoleCode, UserStatus, UserType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateUserDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 150)
  displayName!: string;

  @IsString()
  @Length(12, 128)
  initialPassword!: string;

  @IsEnum(UserType)
  userType!: UserType;

  @IsEnum(RoleCode)
  roleCode!: RoleCode;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerCompanyId?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status: UserStatus = UserStatus.ACTIVE;
}
