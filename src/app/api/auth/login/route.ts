import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { rateLimit, rateLimits } from '@/lib/rate-limit';
import { createSession } from '@/lib/session-manager';
import { validateRequest, formatZodErrors, loginSchema } from '@/lib/validators';
import { logLogin } from '@/lib/audit-logger';

// Dynamic import for bcryptjs to avoid build issues
const getBcrypt = async () => {
  const bcrypt = await import('bcryptjs');
  return bcrypt;
};

export async function POST(request: NextRequest) {
  // Apply rate limiting (5 login attempts per minute)
  const rateLimitResponse = await rateLimit(rateLimits.login)(request);

  if (rateLimitResponse.status === 429) {
    return rateLimitResponse;
  }

  try {
    const body = await request.json();

    // Validate request body
    const validation = validateRequest(loginSchema, body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: formatZodErrors(validation.errors)
        },
        { status: 400 }
      );
    }

    const { username, password, userCode, pin } = validation.data!;

    let user;
    const bcrypt = await getBcrypt();

    // Method 1: Username + Password (existing)
    if (username && password && !userCode) {
      user = await db.user.findUnique({
        where: { username },
      });

      if (!user) {
        return NextResponse.json(
          { success: false, error: 'Invalid username or password' },
          { status: 401 }
        );
      }

      if (!user.isActive) {
        return NextResponse.json(
          { success: false, error: 'User account is inactive' },
          { status: 403 }
        );
      }

      // Verify password using bcrypt
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

      if (!isPasswordValid) {
        return NextResponse.json(
          { success: false, error: 'Invalid username or password' },
          { status: 401 }
        );
      }
    }
    // Method 2 & 3: UserCode + Password or UserCode + PIN
    else if (userCode) {
      // Find user by userCode
      user = await db.user.findUnique({
        where: { userCode },
      });

      if (!user) {
        return NextResponse.json(
          { success: false, error: 'Invalid user code' },
          { status: 401 }
        );
      }

      if (!user.isActive) {
        return NextResponse.json(
          { success: false, error: 'User account is inactive' },
          { status: 403 }
        );
      }

      // Method 2: UserCode + Password
      if (password) {
        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

        if (!isPasswordValid) {
          return NextResponse.json(
            { success: false, error: 'Invalid user code or password' },
            { status: 401 }
          );
        }
      }
      // Method 3: UserCode + PIN
      else if (pin) {
        if (!user.pin) {
          return NextResponse.json(
            { success: false, error: 'PIN not set for this user. Please use username and password.' },
            { status: 401 }
          );
        }

        const isPinValid = await bcrypt.compare(pin, user.pin);

        if (!isPinValid) {
          return NextResponse.json(
            { success: false, error: 'Invalid user code or PIN' },
            { status: 401 }
          );
        }
      }
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid login credentials' },
        { status: 400 }
      );
    }

    // Check if user's branch is active (if user has a branch)
    if (user.branchId) {
      const branch = await db.branch.findUnique({
        where: { id: user.branchId },
        select: { id: true, branchName: true, isActive: true, licenseExpiresAt: true },
      });

      if (!branch) {
        return NextResponse.json(
          { success: false, error: 'Branch not found. Please contact administrator.' },
          { status: 403 }
        );
      }

      if (!branch.isActive) {
        return NextResponse.json(
          { success: false, error: `Branch "${branch.branchName}" is deactivated. Please contact administrator.` },
          { status: 403 }
        );
      }

      // Check license - try new BranchLicense system first, fall back to old system
      const branchLicense = await db.branchLicense.findFirst({
        where: { branchId: user.branchId },
        include: { devices: true }
      });

      if (branchLicense) {
        // New license system
        if (branchLicense.isRevoked) {
          return NextResponse.json(
            { success: false, error: `License revoked: ${branchLicense.revokedReason || 'Please contact administrator.'}` },
            { status: 403 }
          );
        }

        // Check if license is expired
        if (new Date(branchLicense.expirationDate) < new Date()) {
          return NextResponse.json(
            { success: false, error: `Branch license expired on ${new Date(branchLicense.expirationDate).toLocaleDateString()}. Please contact administrator.` },
            { status: 403 }
          );
        }

        // Note: Device limit is enforced during activation, not on every login
        // This allows offline access for already-registered devices
      } else {
        // Fallback to old license system for backward compatibility
        if (new Date(branch.licenseExpiresAt) < new Date()) {
          return NextResponse.json(
            { success: false, error: `Branch license expired on ${new Date(branch.licenseExpiresAt).toLocaleDateString()}. Please contact administrator.` },
            { status: 403 }
          );
        }
      }
    }

    // Create session
    const sessionData = await createSession({
      userId: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
      branchId: user.branchId
    })

    // Log login to audit logs (fire and forget, don't await)
    logLogin(user.id).catch(err => console.error('Failed to log login:', err));

    // Return success with session info
    return NextResponse.json({
      success: true,
      session: sessionData,
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        branchId: user.branchId,
      }
    });
  } catch (error: any) {
    console.error('Login error:', error);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    console.error('Error code:', error?.code);

    // More detailed error for debugging
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        debugMessage: error?.message || 'Unknown error',
        debugCode: error?.code || 'UNKNOWN'
      },
      { status: 500 }
    );
  }
}
