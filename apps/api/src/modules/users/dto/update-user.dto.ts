import { RoleCode, UserStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsEnum(RoleCode)
  roleCode?: RoleCode;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
