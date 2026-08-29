import { Injectable } from '@nestjs/common';
import { MarkupType, Prisma } from '@prisma/client';

@Injectable()
export class CustomerRatePricingService {
  calculate(
    costAmount: Prisma.Decimal,
    standardSellAmount: Prisma.Decimal | null,
    markupType: MarkupType,
    markupValue: Prisma.Decimal | null,
  ): Prisma.Decimal {
    const base = standardSellAmount ?? costAmount;
    if (markupType === MarkupType.NONE || !markupValue) return base.toDecimalPlaces(4);
    if (markupType === MarkupType.FIXED) return base.add(markupValue).toDecimalPlaces(4);
    return base.add(base.mul(markupValue).div(100)).toDecimalPlaces(4);
  }
}
