import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';

// Validation schema for ETA settings
const etaSettingsSchema = z.object({
  branchId: z.string().cuid(),
  companyName: z.string().min(1),
  taxRegistrationNumber: z.string().min(1).regex(/^\d{9}$/),
  branchCode: z.string().min(1),
  commercialRegister: z.string().optional(),
  address: z.string().min(1),
  city: z.string().min(1),
  governorate: z.string().min(1),
  postalCode: z.string().optional(),
  phone: z.string().min(1),
  email: z.string().email().optional(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  environment: z.enum(['TEST', 'PRODUCTION']).default('TEST'),
  certificateFile: z.string().optional(),
  certificatePassword: z.string().optional(),
  autoSubmit: z.boolean().default(true),
  includeQR: z.boolean().default(true),
  retryFailed: z.boolean().default(true),
  maxRetries: z.number().int().min(1).max(10).default(3),
  isActive: z.boolean().default(true),
});

// GET /api/eta/settings?branchId={branchId}
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get('branchId');

    if (!branchId) {
      return NextResponse.json(
        { error: 'branchId is required' },
        { status: 400 }
      );
    }

    const settings = await db.branchETASettings.findUnique({
      where: { branchId },
    });

    if (!settings) {
      return NextResponse.json(
        { error: 'ETA settings not found for this branch' },
        { status: 404 }
      );
    }

    // Don't return sensitive data
    const { clientSecret, certificatePassword, ...safeSettings } = settings;

    return NextResponse.json({
      success: true,
      settings: safeSettings,
    });
  } catch (error) {
    console.error('[ETA Settings GET] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ETA settings', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/eta/settings
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = etaSettingsSchema.parse(body);

    // Verify branch exists
    const branch = await db.branch.findUnique({
      where: { id: validatedData.branchId },
    });

    if (!branch) {
      return NextResponse.json(
        { error: 'Branch not found' },
        { status: 404 }
      );
    }

    // Check if settings already exist for this branch
    const existingSettings = await db.branchETASettings.findUnique({
      where: { branchId: validatedData.branchId },
    });

    let settings;

    if (existingSettings) {
      // Update existing settings
      settings = await db.branchETASettings.update({
        where: { branchId: validatedData.branchId },
        data: {
          companyName: validatedData.companyName,
          taxRegistrationNumber: validatedData.taxRegistrationNumber,
          branchCode: validatedData.branchCode,
          commercialRegister: validatedData.commercialRegister,
          address: validatedData.address,
          city: validatedData.city,
          governorate: validatedData.governorate,
          postalCode: validatedData.postalCode,
          phone: validatedData.phone,
          email: validatedData.email,
          clientId: validatedData.clientId,
          clientSecret: validatedData.clientSecret,
          environment: validatedData.environment,
          certificateFile: validatedData.certificateFile,
          certificatePassword: validatedData.certificatePassword,
          autoSubmit: validatedData.autoSubmit,
          includeQR: validatedData.includeQR,
          retryFailed: validatedData.retryFailed,
          maxRetries: validatedData.maxRetries,
          isActive: validatedData.isActive,
        },
      });
    } else {
      // Create new settings
      settings = await db.branchETASettings.create({
        data: {
          branchId: validatedData.branchId,
          companyName: validatedData.companyName,
          taxRegistrationNumber: validatedData.taxRegistrationNumber,
          branchCode: validatedData.branchCode,
          commercialRegister: validatedData.commercialRegister,
          address: validatedData.address,
          city: validatedData.city,
          governorate: validatedData.governorate,
          postalCode: validatedData.postalCode,
          phone: validatedData.phone,
          email: validatedData.email,
          clientId: validatedData.clientId,
          clientSecret: validatedData.clientSecret,
          environment: validatedData.environment,
          certificateFile: validatedData.certificateFile,
          certificatePassword: validatedData.certificatePassword,
          autoSubmit: validatedData.autoSubmit,
          includeQR: validatedData.includeQR,
          retryFailed: validatedData.retryFailed,
          maxRetries: validatedData.maxRetries,
          isActive: validatedData.isActive,
        },
      });
    }

    // Don't return sensitive data
    const { clientSecret, certificatePassword, ...safeSettings } = settings;

    return NextResponse.json({
      success: true,
      settings: safeSettings,
      message: existingSettings ? 'ETA settings updated successfully' : 'ETA settings created successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('[ETA Settings POST] Error:', error);
    return NextResponse.json(
      { error: 'Failed to save ETA settings', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
