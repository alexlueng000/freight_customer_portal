import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { RATE_IMPORT_TARGET_FIELDS, type RateImportTargetField } from '../rate-import-workbook-analyzer.js';

export class RateImportColumnMappingDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  sourceColumn!: number;

  @IsString()
  @MaxLength(200)
  sourceLabel!: string;

  @IsIn(RATE_IMPORT_TARGET_FIELDS)
  targetField!: RateImportTargetField;
}

export class CreateRateImportMappingProfileDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  supplierName?: string;

  @IsString()
  @Length(1, 120)
  sheetName!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  headerRow!: number;

  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2])
  headerDepth!: 1 | 2;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RateImportColumnMappingDto)
  mappings!: RateImportColumnMappingDto[];

  @IsOptional()
  @IsString()
  @MaxLength(128)
  sourceFingerprint?: string;
}
