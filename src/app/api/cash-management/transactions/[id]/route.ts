import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * PUT /api/cash-management/transactions/[id]
 * Edit a cash transaction (amount, description, transactionDate)
 * Only manual transactions (no shiftId) can be edited.
 * Only ADMIN or MANAGER role can edit.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { amount, description, transactionDate, updatedBy } = body;

    // Find existing transaction
    const existing = await db.cashTransaction.findUnique({
      where: { id },
      include: {
        branch: { select: { id: true, branchName: true } },
        creator: { select: { id: true, username: true, name: true } },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Verify user is admin/manager
    if (updatedBy) {
      const user = await db.user.findUnique({ where: { id: updatedBy } });
      if (!user || (user.role !== 'ADMIN' && user.role !== 'MANAGER')) {
        return NextResponse.json(
          { success: false, error: 'Only admins and managers can edit transactions' },
          { status: 403 }
        );
      }
    }

    // Build update data
    const updateData: any = {};
    if (amount !== undefined && amount !== null && amount > 0) {
      updateData.amount = parseFloat(amount.toString());
    }
    if (description !== undefined) {
      updateData.description = description || null;
    }
    if (transactionDate !== undefined) {
      if (transactionDate === null || transactionDate === '') {
        updateData.transactionDate = null;
      } else {
        updateData.transactionDate = new Date(transactionDate + 'T12:00:00');
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No fields to update' },
        { status: 400 }
      );
    }

    // Update transaction
    const updated = await db.cashTransaction.update({
      where: { id },
      data: updateData,
      include: {
        branch: { select: { id: true, branchName: true } },
        creator: { select: { id: true, username: true, name: true } },
        shift: {
          select: {
            id: true,
            startTime: true,
            endTime: true,
            cashier: { select: { id: true, username: true, name: true } },
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      transaction: updated,
      message: 'Transaction updated successfully',
    });
  } catch (error: any) {
    console.error('[Cash Management] Update transaction error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update transaction', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/cash-management/transactions/[id]
 * Delete a cash transaction.
 * Only manual transactions (no shiftId) can be deleted.
 * Only ADMIN or MANAGER role can delete.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const deletedBy = searchParams.get('deletedBy');

    // Find existing transaction
    const existing = await db.cashTransaction.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Prevent deleting automatic shift closings (they are linked to shifts)
    if (existing.shiftId) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete automatic shift closing transactions. These are linked to shift records.' },
        { status: 400 }
      );
    }

    // Verify user is admin/manager
    if (deletedBy) {
      const user = await db.user.findUnique({ where: { id: deletedBy } });
      if (!user || (user.role !== 'ADMIN' && user.role !== 'MANAGER')) {
        return NextResponse.json(
          { success: false, error: 'Only admins and managers can delete transactions' },
          { status: 403 }
        );
      }
    }

    // Delete transaction
    const deleted = await db.cashTransaction.delete({
      where: { id },
      include: {
        branch: { select: { id: true, branchName: true } },
        creator: { select: { id: true, username: true, name: true } },
      },
    });

    return NextResponse.json({
      success: true,
      deleted,
      message: 'Transaction deleted successfully',
    });
  } catch (error: any) {
    console.error('[Cash Management] Delete transaction error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete transaction', details: error.message },
      { status: 500 }
    );
  }
}