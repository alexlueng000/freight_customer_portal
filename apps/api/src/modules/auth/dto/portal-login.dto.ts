import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class PortalLoginDto {
  @IsString()
  @Matches(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/)
  portalSlug!: string;

  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(200)
  password!: string;
}
