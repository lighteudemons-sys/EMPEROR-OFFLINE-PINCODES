import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';
import { randomBytes } from 'crypto';

// Validation schema for batch generation
const generateBatchSchema = z.object({
  promotionId: z.string().min(1, 'Promotion ID is required').optional(),
  count: z.number().int().min(1).max(1000, 'Count must be between 1 and 1000'),
  prefix: z.string().optional(),
  isSingleUse: z.boolean().default(true),
  codeLength: z.number().int().min(8).max(16).default(12),
  campaignName: z.string().optional(),
  preview: z.boolean().default(false),
});

// Helper function to generate random code
function generateRandomCode(prefix: string = '', length: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 to avoid confusion
  const randomPart = Array.from({ length: length }, () =>
    chars[randomBytes(1)[0] % chars.length]
  ).join('');
  return prefix ? `${prefix.toUpperCase()}-${randomPart}` : randomPart;
}

// POST /api/promo-codes/generate-batch - Generate bulk promo codes
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = generateBatchSchema.parse(body);

    const { promotionId, count, prefix, isSingleUse, codeLength, campaignName, preview } = validatedData;

    // For preview mode, skip promotion check and database insertion
    if (!preview) {
      // Check if promotion exists
      const promotion = await db.promotion.findUnique({
        where: { id: promotionId },
      });

      if (!promotion) {
        return NextResponse.json(
          { success: false, error: 'Promotion not found' },
          { status: 404 }
        );
      }
    }

    // Fetch existing codes only if we have a promotionId
    let existingCodes = new Set<string>();
    if (promotionId) {
      const existingCodeRecords = await db.promotionCode.findMany({
        where: { promotionId },
        select: { code: true },
      });
      existingCodes = new Set(existingCodeRecords.map((pc) => pc.code));
    }

    // Generate codes
    const codes: string[] = [];
    let attempts = 0;
    const maxAttempts = count * 10; // Allow 10x attempts for uniqueness

    while (codes.length < count && attempts < maxAttempts) {
      attempts++;
      const newCode = generateRandomCode(prefix || '', codeLength);

      // Check for uniqueness
      if (!existingCodes.has(newCode) && !codes.includes(newCode)) {
        codes.push(newCode);
      }
    }

    if (codes.length < count) {
      return NextResponse.json(
        {
          success: false,
          error: `Could not generate unique codes. Generated ${codes.length} of ${count} requested.`,
        },
        { status: 500 }
      );
    }

    // Insert codes in batch (only if not preview mode and promotionId exists)
    if (!preview && promotionId) {
      const codeData = codes.map((code) => ({
        promotionId,
        code,
        isSingleUse,
        maxUses: isSingleUse ? 1 : null,
        campaignName,
      }));

      await db.promotionCode.createMany({
        data: codeData,
      });
    }

    return NextResponse.json({
      success: true,
      message: preview
        ? `Generated ${codes.length} preview codes`
        : `Successfully generated ${codes.length} promo codes`,
      codes,
      promotionId,
      campaignName,
    });
  } catch (error) {
    console.error('Error generating promo codes batch:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to generate promo codes' },
      { status: 500 }
    );
  }
}
