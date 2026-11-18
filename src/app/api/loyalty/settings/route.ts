import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/loyalty/settings — returns loyalty configuration
export async function GET() {
  try {
    // For now, return the hardcoded config (same as in /api/loyalty/route.ts)
    // In Phase 1, this will read from a LoyaltyGlobalSettings table
    return NextResponse.json({
      success: true,
      settings: {
        pointsPerCurrency: 0.1,
        pointsValue: 0.1,
        tiers: {
          BRONZE: { minPoints: 0, discount: 0, name: 'Bronze' },
          SILVER: { minPoints: 200, discount: 5, name: 'Silver' },
          GOLD: { minPoints: 500, discount: 10, name: 'Gold' },
          PLATINUM: { minPoints: 1000, discount: 15, name: 'Platinum' },
        },
      },
    });
  } catch (error: any) {
    console.error('Loyalty settings error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch loyalty settings' },
      { status: 500 }
    );
  }
}
