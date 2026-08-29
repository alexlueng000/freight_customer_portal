import { PartialType } from '@nestjs/swagger';
import { CreateRateDto } from './create-rate.dto.js';
export class UpdateRateDto extends PartialType(CreateRateDto) {}
