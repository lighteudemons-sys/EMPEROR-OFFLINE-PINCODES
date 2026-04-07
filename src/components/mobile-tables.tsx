'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { MobileBranchSelector } from '@/components/mobile-branch-selector';
import { 
  Utensils, Users, CheckCircle, Clock, AlertCircle, 
  Plus, Edit, Trash2, RefreshCw, Building2
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n-context';
import { formatCurrency } from '@/lib/utils';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';

interface TableData {
  id: string;
  tableNumber: number;
  status: 'AVAILABLE' | 'OCCUPIED' | 'READY_TO_PAY' | 'RESERVED' | 'CLEANING';
  capacity: number | null;
  notes: string | null;
  totalAmount: number;
  customer?: {
    id: string;
    name: string;
    phone: string;
  } | null;
  openedAt: string | null;
  closedAt: string | null;
}

export function MobileTables() {
  const { user } = useAuth();
  const { currency } = useI18n();
  const [tables, setTables] = useState<TableData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState('');
  
  // Dialog states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<TableData | null>(null);
  const [tableToDelete, setTableToDelete] = useState<TableData | null>(null);
  const [deletingTableId, setDeletingTableId] = useState<string | null>(null);
  
  // Form states
  const [tableNumber, setTableNumber] = useState('');
  const [capacity, setCapacity] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user?.branchId) {
      setSelectedBranch(user.branchId);
    }
  }, [user]);

  useEffect(() => {
    if (selectedBranch) {
      fetchTables();
    } else {
      setLoading(false);
    }
  }, [selectedBranch]);

  const fetchTables = async () => {
    if (!selectedBranch) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/tables?branchId=${selectedBranch}`);
      if (response.ok) {
        const data = await response.json();
        setTables(data.tables || []);
      } else {
        const error = await response.json();
        showErrorToast('Error', error.error || 'Failed to fetch tables');
      }
    } catch (error) {
      console.error('Failed to fetch tables:', error);
      showErrorToast('Error', 'Failed to fetch tables. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranch) {
      showErrorToast('Error', 'Please select a branch first');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: selectedBranch,
          tableNumber: parseInt(tableNumber),
          capacity: capacity ? parseInt(capacity) : null,
          notes: notes || null,
        }),
      });

      if (response.ok) {
        await fetchTables();
        setIsDialogOpen(false);
        resetForm();
        showSuccessToast('Success', `Table ${tableNumber} created successfully!`);
      } else {
        const data = await response.json();
        showErrorToast('Error', data.error || data.details || 'Failed to create table');
      }
    } catch (error) {
      console.error('Failed to create table:', error);
      showErrorToast('Error', 'Failed to create table. Please check your connection.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTable) return;

    setSubmitting(true);
    try {
      const response = await fetch(`/api/tables/${editingTable.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableNumber: parseInt(tableNumber),
          capacity: capacity ? parseInt(capacity) : null,
          notes: notes || null,
          status: editingTable.status,
        }),
      });

      if (response.ok) {
        await fetchTables();
        setIsDialogOpen(false);
        setEditingTable(null);
        resetForm();
        showSuccessToast('Success', `Table ${tableNumber} updated successfully!`);
      } else {
        const data = await response.json();
        showErrorToast('Error', data.error || data.details || 'Failed to update table');
      }
    } catch (error) {
      console.error('Failed to update table:', error);
      showErrorToast('Error', 'Failed to update table. Please check your connection.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTable = async () => {
    if (!tableToDelete) return;

    setDeletingTableId(tableToDelete.id);
    try {
      const response = await fetch(`/api/tables/${tableToDelete.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchTables();
        setDeleteDialogOpen(false);
        setTableToDelete(null);
        showSuccessToast('Success', `Table ${tableToDelete.tableNumber} deleted successfully!`);
      } else {
        const data = await response.json();
        showErrorToast('Error', data.error || data.details || 'Failed to delete table');
      }
    } catch (error) {
      console.error('Failed to delete table:', error);
      showErrorToast('Error', 'Failed to delete table. Please check your connection.');
    } finally {
      setDeletingTableId(null);
    }
  };

  const handleEditClick = (table: TableData) => {
    setEditingTable(table);
    setTableNumber(table.tableNumber.toString());
    setCapacity(table.capacity?.toString() || '');
    setNotes(table.notes || '');
    setIsDialogOpen(true);
  };

  const handleDeleteClick = (table: TableData) => {
    setTableToDelete(table);
    setDeleteDialogOpen(true);
  };

  const resetForm = () => {
    setTableNumber('');
    setCapacity('');
    setNotes('');
    setEditingTable(null);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { 
      color: string; 
      bgColor: string; 
      icon: React.ReactNode; 
      label: string;
    }> = {
      AVAILABLE: {
        color: 'text-emerald-700',
        bgColor: 'bg-emerald-100',
        icon: <CheckCircle className="h-3 w-3" />,
        label: 'Available',
      },
      OCCUPIED: {
        color: 'text-blue-700',
        bgColor: 'bg-blue-100',
        icon: <Users className="h-3 w-3" />,
        label: 'Occupied',
      },
      READY_TO_PAY: {
        color: 'text-orange-700',
        bgColor: 'bg-orange-100',
        icon: <Clock className="h-3 w-3" />,
        label: 'Ready to Pay',
      },
      RESERVED: {
        color: 'text-purple-700',
        bgColor: 'bg-purple-100',
        icon: <Utensils className="h-3 w-3" />,
        label: 'Reserved',
      },
      CLEANING: {
        color: 'text-slate-700',
        bgColor: 'bg-slate-100',
        icon: <AlertCircle className="h-3 w-3" />,
        label: 'Cleaning',
      },
    };

    const config = statusConfig[status] || statusConfig.AVAILABLE;
    return (
      <Badge className={config.bgColor + ' ' + config.color}>
        <span className="flex items-center gap-1">
          {config.icon}
          {config.label}
        </span>
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white px-4 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
            <Utensils className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Table Management</h1>
            <p className="text-emerald-100 text-sm">Create and manage restaurant tables</p>
          </div>
        </div>

        {/* Branch Selector */}
        <MobileBranchSelector onBranchChange={setSelectedBranch} />
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Add Table Button */}
        {user?.role === 'ADMIN' && selectedBranch && (
          <div className="mb-4">
            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) {
                resetForm();
                setEditingTable(null);
              }
            }}>
              <DialogTrigger asChild>
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 h-12 text-base font-semibold">
                  <Plus className="h-5 w-5 mr-2" />
                  Add New Table
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{editingTable ? 'Edit Table' : 'Create New Table'}</DialogTitle>
                  <DialogDescription>
                    {editingTable ? 'Update table details' : 'Add a new table to your restaurant'}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={editingTable ? handleUpdateTable : handleCreateTable}>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="tableNumber">Table Number *</Label>
                      <Input
                        id="tableNumber"
                        type="number"
                        value={tableNumber}
                        onChange={(e) => setTableNumber(e.target.value)}
                        placeholder="e.g., 1"
                        required
                        min="1"
                        className="h-12 text-base"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="capacity">Capacity (seats)</Label>
                      <Input
                        id="capacity"
                        type="number"
                        value={capacity}
                        onChange={(e) => setCapacity(e.target.value)}
                        placeholder="e.g., 4"
                        min="1"
                        className="h-12 text-base"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="notes">Notes</Label>
                      <Input
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="e.g., Near window, Outdoor, etc."
                        className="h-12 text-base"
                      />
                    </div>
                  </div>
                  <DialogFooter className="gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsDialogOpen(false);
                        resetForm();
                        setEditingTable(null);
                      }}
                      className="flex-1 h-12"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 h-12"
                      disabled={submitting}
                    >
                      {submitting ? 'Saving...' : editingTable ? 'Update Table' : 'Create Table'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* Refresh Button */}
        {selectedBranch && (
          <div className="mb-4 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchTables}
              disabled={loading}
              className="h-10"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''} mr-2`} />
              Refresh
            </Button>
          </div>
        )}

        {/* Tables List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <div className="animate-spin h-10 w-10 border-4 border-emerald-600 border-t-transparent rounded-full mb-3" />
            <p className="font-medium">Loading tables...</p>
          </div>
        ) : !selectedBranch ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <Building2 className="w-16 h-16 mb-4 text-slate-300" />
            <p className="font-medium">No branch selected</p>
            <p className="text-sm">Please select a branch to view tables</p>
          </div>
        ) : tables.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <Utensils className="w-16 h-16 mb-4 text-slate-300" />
            <p className="font-medium">No tables found</p>
            <p className="text-sm">Create your first table to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tables.map((table) => (
              <Card key={table.id} className="border-slate-200 shadow-sm">
                <CardContent className="p-4">
                  {/* Table Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-bold text-slate-900">
                          Table {table.tableNumber}
                        </h3>
                        {getStatusBadge(table.status)}
                      </div>
                      {table.capacity && (
                        <p className="text-sm text-slate-600 flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          {table.capacity} seats
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Customer Info */}
                  {table.customer && (
                    <div className="mb-3 p-2 bg-slate-50 rounded-lg">
                      <p className="text-sm font-medium text-slate-900">{table.customer.name}</p>
                      <p className="text-xs text-slate-600">{table.customer.phone}</p>
                    </div>
                  )}

                  {/* Total Amount */}
                  {table.totalAmount > 0 && (
                    <div className="mb-3">
                      <p className="text-sm text-slate-600">Total Amount</p>
                      <p className="text-lg font-bold text-emerald-600">
                        {formatCurrency(table.totalAmount)}
                      </p>
                    </div>
                  )}

                  {/* Notes */}
                  {table.notes && (
                    <div className="mb-3 p-2 bg-amber-50 rounded-lg border border-amber-200">
                      <p className="text-sm text-amber-800">{table.notes}</p>
                    </div>
                  )}

                  {/* Actions */}
                  {user?.role === 'ADMIN' && (
                    <div className="flex gap-2 pt-3 border-t border-slate-100">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditClick(table)}
                        className="flex-1 h-10"
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteClick(table)}
                        disabled={deletingTableId === table.id}
                        className="flex-1 h-10 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        {deletingTableId === table.id ? 'Deleting...' : 'Delete'}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">Delete Table {tableToDelete?.tableNumber}?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. The table will be permanently removed from the system.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setTableToDelete(null);
              }}
              className="flex-1 h-12"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteTable}
              disabled={deletingTableId === tableToDelete?.id}
              className="flex-1 h-12"
            >
              {deletingTableId === tableToDelete?.id ? 'Deleting...' : 'Delete Table'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
