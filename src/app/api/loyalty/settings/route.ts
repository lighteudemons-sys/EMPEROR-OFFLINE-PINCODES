import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session-manager';
import { canManageSettings } from '@/lib/loyalty-permissions';

// GET /api/loyalty/settings — returns the singleton LoyaltyGlobalSettings row.
export async function GET() {
  try {
    let settings = await db.loyaltyGlobalSettings.findUnique({
      where: { id: 'singleton' },
    });

    // Auto-create the singleton if missing.
    if (!settings) {
      settings = await db.loyaltyGlobalSettings.create({
        data: { id: 'singleton' },
      });
    }

    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error('[Loyalty] settings GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch loyalty settings' },
      { status: 500 }
    );
  }
}

const updateSettingsSchema = z.object({
  legacyPointsPerCurrency: z.union([z.number(), z.string()]).optional(),
  legacyPointsValue: z.union([z.number(), z.string()]).optional(),
  legacyBronzeThreshold: z.number().int().min(0).optional(),
  legacySilverThreshold: z.number().int().min(0).optional(),
  legacyGoldThreshold: z.number().int().min(0).optional(),
  legacyPlatinumThreshold: z.number().int().min(0).optional(),
  legacyEarningEnabled: z.boolean().optional(),
  legacyRedemptionEnabled: z.boolean().optional(),
  membershipCodePrefix: z.string().optional(),
  membershipCodeLength: z.number().int().positive().optional(),
  defaultRewardExpiryDays: z.number().int().positive().nullable().optional(),
  enableLoyaltyNotifications: z.boolean().optional(),
  notifyOnTierUpgrade: z.boolean().optional(),
  notifyOnRewardEarned: z.boolean().optional(),
  notifyOnRewardExpiring: z.boolean().optional(),
  rewardExpiryWarningDays: z.number().int().min(0).optional(),
  maxActivePromotionsPerCustomer: z.number().int().positive().nullable().optional(),
  pendingRedemptionTimeoutMinutes: z.number().int().positive().optional(),
});

// PUT /api/loyalty/settings — update settings. ADMIN only.
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!canManageSettings(session)) {
      return NextResponse.json({ error: 'Forbidden — ADMIN only' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = updateSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    // Ensure the singleton exists.
    let settings = await db.loyaltyGlobalSettings.findUnique({
      where: { id: 'singleton' },
    });
    if (!settings) {
      settings = await db.loyaltyGlobalSettings.create({
        data: { id: 'singleton' },
      });
    }

    const updated = await db.loyaltyGlobalSettings.update({
      where: { id: 'singleton' },
      data: { ...parsed.data, updatedBy: session.userId },
    });

    return NextResponse.json({ success: true, settings: updated });
  } catch (error) {
    console.error('[Loyalty] settings PUT error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update loyalty settings' },
      { status: 500 }
    );
  }
}
