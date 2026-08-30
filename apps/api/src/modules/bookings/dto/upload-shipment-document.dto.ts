import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsString } from 'class-validator';

export class UploadShipmentDocumentDto {
  @IsString() @IsIn(['DRAFT_BL', 'FINAL_BL', 'OTHER']) documentType!: string;
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  customerVisible!: boolean;
}
