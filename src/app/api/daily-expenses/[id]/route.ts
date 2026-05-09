import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { UserRole } from '@prisma/client';

/**
 * DELETE /api/daily-expenses/[id] - Delete a daily expense
 * Only accessible by:
 * - BRANCH_MANAGER or ADMIN (for expenses in their branch)
 * - User who created the expense
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const expenseId = params.id;
    const { searchParams } = new URL(request.url);
    const currentUserId = searchParams.get('currentUserId');

    if (!currentUserId) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    // Get current user to check permissions
    const currentUser = await db.user.findUnique({
      where: { id: currentUserId },
      include: { branch: true },
    });

    if (!currentUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get the expense to delete
    const expense = await db.dailyExpense.findUnique({
      where: { id: expenseId },
      include: {
        shift: true,
      },
    });

    if (!expense) {
      return NextResponse.json(
        { error: 'Expense not found' },
        { status: 404 }
      );
    }

    // Check permissions:
    // 1. BRANCH_MANAGER and ADMIN can delete any expense in their branch
    // 2. Users can only delete their own expenses
    // 3. Shift must be open (not closed)
    const canDelete =
      currentUser.role === UserRole.ADMIN ||
      (currentUser.role === UserRole.BRANCH_MANAGER &&
        (currentUser.branchId === expense.branchId || currentUser.branch?.id === expense.branchId)) ||
      currentUser.id === expense.recordedBy;

    if (!canDelete) {
      return NextResponse.json(
        {
          error: 'You do not have permission to delete this expense',
          details: 'Only Branch Managers, Admins, or the user who created the expense can delete it',
        },
        { status: 403 }
      );
    }

    // Check if shift is still open
    if (expense.shift && expense.shift.isClosed) {
      return NextResponse.json(
        {
          error: 'Cannot delete expense from a closed shift',
          details: 'Expenses can only be deleted while the shift is still open',
        },
        { status: 400 }
      );
    }

    // Delete the expense
    await db.dailyExpense.delete({
      where: { id: expenseId },
    });

    // Delete associated BranchCost record if it exists
    if (expense.costId) {
      try {
        await db.branchCost.delete({
          where: { id: expense.costId },
        });
        console.log('[Daily Expense Delete] Deleted associated BranchCost:', expense.costId);
      } catch (costError) {
        console.error('[Daily Expense Delete] Failed to delete BranchCost:', costError);
        // Don't fail the deletion if cost deletion fails
      }
    }

    console.log('[Daily Expense Delete] Deleted expense:', expenseId, 'by user:', currentUser.id);

    return NextResponse.json({
      success: true,
      message: 'Expense deleted successfully',
      expenseId,
    });
  } catch (error: any) {
    console.error('Delete daily expense error:', error);
    return NextResponse.json(
      { error: 'Failed to delete expense', details: error.message },
      { status: 500 }
    );
  }
}
