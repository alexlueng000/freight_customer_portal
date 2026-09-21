CREATE TYPE "QuoteReviewStatus" AS ENUM ('NONE', 'PENDING', 'REJECTED', 'APPROVED');
ALTER TABLE "Tenant" ADD COLUMN "quoteApprovalRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Quote" ADD COLUMN "reviewStatus" "QuoteReviewStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "reviewSubmittedAt" TIMESTAMPTZ(3),
  ADD COLUMN "reviewedAt" TIMESTAMPTZ(3),
  ADD COLUMN "approvalNote" VARCHAR(2000),
  ADD COLUMN "amountsByCurrency" JSONB NOT NULL DEFAULT '{}';
-- Preserve legacy scalar totals as the primary-currency subtotal, never an FX total.
UPDATE "Quote" SET "amountsByCurrency" = jsonb_build_object("currency", "totalAmount"::text);
