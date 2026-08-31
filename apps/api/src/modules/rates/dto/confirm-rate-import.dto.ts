import { IsBoolean, IsString, Length } from 'class-validator';

export class ConfirmRateImportDto {
  @IsString()
  @Length(20, 200)
  previewToken!: string;

  @IsBoolean()
  acceptWarnings!: boolean;
}
