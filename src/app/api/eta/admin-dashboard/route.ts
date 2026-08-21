import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/eta/admin-dashboard
// Returns all branches' ETA status and compliance data for HQ Admins
export async function GET(request: NextRequest) {
  try {
    // Fetch all branches with their ETA settings
    const branches = await db.branch.findMany({
      include: {
        etaSettings: true,
        orders: {
          where: {
            etaUUID: {
              not: null
            }
          },
          select: {
            id: true,
            etaUUID: true,
            etaSubmissionStatus: true,
            etaSubmittedAt: true,
            etaAcceptedAt: true,
            etaError: true,
            orderTimestamp: true,
            orderNumber: true,
            totalAmount: true
          },
          orderBy: {
            etaSubmittedAt: 'desc'
          },
          take: 100 // Last 100 submissions per branch
        },
        _count: {
          select: {
            orders: {
              where: {
                etaUUID: {
                  not: null
                }
              }
            }
          }
        }
      },
      orderBy: {
        branchName: 'asc'
      }
    });

    // Calculate statistics
    let totalSubmissions = 0;
    let totalAccepted = 0;
    let totalRejected = 0;
    let totalPending = 0;
    let totalFailed = 0;

    const branchStatuses = branches.map(branch => {
      const hasSettings = !!branch.etaSettings;
      const isActive = hasSettings && branch.etaSettings.isActive;
      const totalBranchSubmissions = branch._count.orders;

      // Count submissions by status for this branch
      const branchStats = {
        accepted: 0,
        rejected: 0,
        pending: 0,
        failed: 0
      };

      branch.orders.forEach(order => {
        switch (order.etaSubmissionStatus) {
          case 'ACCEPTED':
            branchStats.accepted++;
            totalAccepted++;
            break;
          case 'REJECTED':
            branchStats.rejected++;
            totalRejected++;
            break;
          case 'PENDING':
          case 'SUBMITTED':
            branchStats.pending++;
            totalPending++;
            break;
          case 'FAILED':
            branchStats.failed++;
            totalFailed++;
            break;
        }
        totalSubmissions++;
      });

      // Calculate success rate
      const successRate = totalBranchSubmissions > 0
        ? ((branchStats.accepted / totalBranchSubmissions) * 100).toFixed(1)
        : '0.0';

      return {
        id: branch.id,
        name: branch.branchName,
        code: branch.licenseKey,
        location: branch.address,
        hasSettings,
        isActive,
        environment: branch.etaSettings?.environment || null,
        companyName: branch.etaSettings?.companyName || null,
        taxRegistrationNumber: branch.etaSettings?.taxRegistrationNumber || null,
        totalSubmissions: totalBranchSubmissions,
        stats: branchStats,
        successRate: parseFloat(successRate),
        lastSubmission: branch.orders[0] || null,
        autoSubmit: branch.etaSettings?.autoSubmit || false,
        includeQR: branch.etaSettings?.includeQR || false,
        needsConfiguration: !hasSettings || !isActive
      };
    });

    // Overall statistics
    const overallSuccessRate = totalSubmissions > 0
      ? ((totalAccepted / totalSubmissions) * 100).toFixed(1)
      : '0.0';

    const stats = {
      totalBranches: branches.length,
      configuredBranches: branchStatuses.filter(b => b.hasSettings && b.isActive).length,
      unconfiguredBranches: branchStatuses.filter(b => b.needsConfiguration).length,
      totalSubmissions,
      totalAccepted,
      totalRejected,
      totalPending,
      totalFailed,
      successRate: parseFloat(overallSuccessRate)
    };

    // Get recent submissions across all branches
    const allRecentSubmissions = branches.flatMap(branch =>
      branch.orders.map(order => ({
        ...order,
        branchId: branch.id,
        branchName: branch.name
      }))
    ).sort((a, b) =>
      new Date(b.etaSubmittedAt || b.orderTimestamp).getTime() -
      new Date(a.etaSubmittedAt || a.orderTimestamp).getTime()
    ).slice(0, 50); // Top 50 recent submissions

    return NextResponse.json({
      success: true,
      stats,
      branches: branchStatuses,
      recentSubmissions: allRecentSubmissions
    });
  } catch (error) {
    console.error('[ETA Admin Dashboard] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch admin dashboard data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
