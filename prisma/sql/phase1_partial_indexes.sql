-- Phase 1: Partial unique indexes for LoyaltyStampTransaction idempotency
-- These cannot be expressed in Prisma schema syntax and must be created via raw SQL.
-- All are additive (CREATE INDEX IF NOT EXISTS) and safe to re-run.

-- One EARNED per order per promotion (PER_VISIT — orderItemId IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS prevent_duplicate_per_visit
  ON "LoyaltyStampTransaction" ("orderId", "promotionId")
  WHERE "orderItemId" IS NULL AND "type" = 'EARNED';

-- One EARNED per order item per promotion (PER_ITEM/QUANTITY/AMOUNT)
CREATE UNIQUE INDEX IF NOT EXISTS prevent_duplicate_per_item
  ON "LoyaltyStampTransaction" ("orderItemId", "promotionId")
  WHERE "orderItemId" IS NOT NULL AND "type" = 'EARNED';

-- One full-refund reversal per order per promotion (voidedItemId IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS prevent_duplicate_full_refund
  ON "LoyaltyStampTransaction" ("orderId", "promotionId")
  WHERE "type" = 'REFUND_REVERSED' AND "voidedItemId" IS NULL;

-- One void reversal per voided item per promotion
CREATE UNIQUE INDEX IF NOT EXISTS prevent_duplicate_void_reversal
  ON "LoyaltyStampTransaction" ("voidedItemId", "promotionId")
  WHERE "type" = 'REFUND_REVERSED' AND "voidedItemId" IS NOT NULL;

-- One reward restoration per reward instance (stamps = 0 means restoration, not stamp reversal)
CREATE UNIQUE INDEX IF NOT EXISTS prevent_duplicate_reward_restoration
  ON "LoyaltyStampTransaction" ("rewardInstanceId", "type")
  WHERE "type" = 'REFUND_REVERSED' AND "rewardInstanceId" IS NOT NULL AND "stamps" = 0;
