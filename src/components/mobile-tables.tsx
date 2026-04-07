'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MobileBranchSelector } from '@/components/mobile-branch-selector';
import { 
  LayoutGrid, Users, Clock, Utensils, CheckCircle, AlertCircle, 
  RefreshCw, X, Info, ArrowRight, Copy, Printer
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
  opener?: {
    id: string;
    name: string;
    username: string;
  } | null;
  openedAt: string | null;
  closedAt: string | null;
}

interface CartItem {
  id: string;
  menuItemId: string;
  name: string;
  variantId?: string | null;
  variantName?: string | null;
  customVariantValue?: number | null;
  quantity: number;
  price: number;
  note?: string;
  requiresCaptainReceipt?: boolean;
}

export function MobileTables() {
  const { user } = useAuth();
  const { currency } = useI18n();
  const [tables, setTables] = useState<TableData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [filter, setFilter] = useState<'all' | 'available' | 'occupied'>('all');
  
  // Table selection
  const [selectedTable, setSelectedTable] = useState<TableData | null>(null);
  const [tableDetailsOpen, setTableDetailsOpen] = useState(false);
  const [tableWithOpenButton, setTableWithOpenButton] = useState<string | null>(null);
  
  // Table cart
  const [tableCart, setTableCart] = useState<CartItem[]>([]);
  const [loadingCart, setLoadingCart] = useState(false);
  
  // Close table dialog
  const [closeTableDialogOpen, setCloseTableDialogOpen] = useState(false);
  const [closeTableLoading, setCloseTableLoading] = useState(false);
  
  // Transfer dialog
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [availableTables, setAvailableTables] = useState<TableData[]>([]);
  const [targetTableId, setTargetTableId] = useState('');
  const [transferItems, setTransferItems] = useState<Record<string, number>>({});
  const [transferLoading, setTransferLoading] = useState(false);

  useEffect(() => {
    fetchTables();
  }, [selectedBranch]);

  const fetchTables = async () => {
    if (!selectedBranch) return;
    
    setLoading(true);
    try {
      // First, try to load from IndexedDB for offline support
      let offlineTables: any[] = [];
      try {
        const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
        const indexedDBStorage = getIndexedDBStorage();
        await indexedDBStorage.init();
        offlineTables = await indexedDBStorage.getAllTables();
      } catch (dbError) {
        console.error('Failed to load tables from IndexedDB:', dbError);
      }

      // Try API
      const response = await fetch(`/api/tables?branchId=${selectedBranch}`);
      if (response.ok) {
        const data = await response.json();
        const apiTables = data.tables || [];

        // Merge with offline modifications
        const mergedTables = apiTables.map((apiTable: any) => {
          const offlineModified = offlineTables.find((t: any) => t.id === apiTable.id && t._offlineModified);
          if (offlineModified) {
            return {
              ...apiTable,
              status: offlineModified.status,
              openedAt: offlineModified.openedAt,
            };
          }
          return apiTable;
        });

        setTables(mergedTables);
      } else {
        setTables(offlineTables);
      }
    } catch (error) {
      console.error('Failed to fetch tables:', error);
      // Final fallback to offline
      try {
        const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
        const indexedDBStorage = getIndexedDBStorage();
        await indexedDBStorage.init();
        const cachedTables = await indexedDBStorage.getAllTables();
        setTables(cachedTables);
      } catch (dbError) {
        console.error('Failed to load cached tables:', dbError);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchTableCart = async (tableId: string) => {
    setLoadingCart(true);
    try {
      const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
      const indexedDBStorage = getIndexedDBStorage();
      await indexedDBStorage.init();
      const storage = indexedDBStorage as any;
      const cartKey = `table-cart-${tableId}`;
      const cart = await storage.getJSON(cartKey);
      setTableCart(cart || []);
    } catch (error) {
      console.error('Failed to load table cart:', error);
      setTableCart([]);
    } finally {
      setLoadingCart(false);
    }
  };

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { 
      color: string; 
      bgColor: string; 
      borderColor: string; 
      icon: any;
      label: string;
    }> = {
      AVAILABLE: {
        color: 'text-emerald-700',
        bgColor: 'bg-emerald-50 hover:bg-emerald-100',
        borderColor: 'border-emerald-200 hover:border-emerald-400',
        icon: CheckCircle,
        label: 'Available',
      },
      OCCUPIED: {
        color: 'text-blue-700',
        bgColor: 'bg-blue-50 hover:bg-blue-100',
        borderColor: 'border-blue-200 hover:border-blue-400',
        icon: Users,
        label: 'Occupied',
      },
      READY_TO_PAY: {
        color: 'text-orange-700',
        bgColor: 'bg-orange-50 hover:bg-orange-100',
        borderColor: 'border-orange-200 hover:border-orange-400',
        icon: Clock,
        label: 'Ready to Pay',
      },
      RESERVED: {
        color: 'text-purple-700',
        bgColor: 'bg-purple-50 hover:bg-purple-100',
        borderColor: 'border-purple-200 hover:border-purple-400',
        icon: Utensils,
        label: 'Reserved',
      },
      CLEANING: {
        color: 'text-slate-700',
        bgColor: 'bg-slate-50 hover:bg-slate-100',
        borderColor: 'border-slate-200 hover:border-slate-400',
        icon: AlertCircle,
        label: 'Cleaning',
      },
    };
    return configs[status] || configs.AVAILABLE;
  };

  const filteredTables = tables.filter(table => {
    if (filter === 'all') return true;
    if (filter === 'available') return table.status === 'AVAILABLE';
    if (filter === 'occupied') return table.status === 'OCCUPIED' || table.status === 'READY_TO_PAY';
    return true;
  });

  const handleTableClick = async (table: TableData) => {
    if (table.status === 'AVAILABLE') {
      // Show "Open" button for available tables
      setTableWithOpenButton(table.id);
    } else {
      // Show details for occupied tables
      setSelectedTable(table);
      await fetchTableCart(table.id);
      setTableDetailsOpen(true);
    }
  };

  const handleOpenTable = async (table: TableData) => {
    try {
      if (!user) {
        showErrorToast('Error', 'User not logged in');
        return;
      }

      let tableData: TableData;

      // Try API
      const response = await fetch(`/api/tables/${table.id}/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cashierId: user.id,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        tableData = { ...data.table, totalAmount: 0 };
        await fetchTables();
        setTableWithOpenButton(null);
        showSuccessToast('Success', `Table ${table.tableNumber} opened!`);
        
        // Open table details
        setSelectedTable(tableData);
        await fetchTableCart(tableData.id);
        setTableDetailsOpen(true);
      } else {
        throw new Error('API request failed');
      }
    } catch (error) {
      console.error('Failed to open table via API (likely offline), trying offline fallback:', error);

      // OFFLINE FALLBACK
      try {
        const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
        const indexedDBStorage = getIndexedDBStorage();
        await indexedDBStorage.init();

        const offlineOpenedTable: TableData = {
          ...table,
          status: 'OCCUPIED',
          openedAt: new Date().toISOString(),
        };

        await indexedDBStorage.put('tables', {
          ...offlineOpenedTable,
          _offlineModified: true,
        });

        await indexedDBStorage.addOperation({
          type: 'UPDATE_TABLE',
          data: {
            id: table.id,
            status: 'OCCUPIED',
            openedBy: user.id,
            openedAt: new Date().toISOString(),
          },
          branchId: selectedBranch,
        });

        console.log('[MobileTables] Table opened offline:', offlineOpenedTable);

        setSelectedTable({ ...offlineOpenedTable, totalAmount: 0 });
        await fetchTableCart(offlineOpenedTable.id);
        setTableDetailsOpen(true);

        setTables(tables.map(t =>
          t.id === table.id ? offlineOpenedTable : t
        ));

        setTableWithOpenButton(null);
        showSuccessToast('Success', `Table ${table.tableNumber} opened (offline)!`);
      } catch (offlineError) {
        console.error('Failed to open table offline:', offlineError);
        showErrorToast('Error', 'Failed to open table. Please check your connection.');
      }
    }
  };

  const handleCloseTable = async () => {
    if (!selectedTable) return;
    
    setCloseTableLoading(true);
    try {
      let closedSuccessfully = false;

      // Try API
      try {
        const response = await fetch(`/api/tables/${selectedTable.id}/close`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cashierId: user.id,
          }),
        });

        if (response.ok) {
          closedSuccessfully = true;
        } else {
          throw new Error('API request failed');
        }
      } catch (apiError) {
        console.error('Failed to close table via API, trying offline:', apiError);

        // OFFLINE FALLBACK
        const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
        const indexedDBStorage = getIndexedDBStorage();
        await indexedDBStorage.init();

        const updatedTable = {
          ...selectedTable,
          status: 'AVAILABLE' as const,
          openedAt: null as string | null,
          _offlineModified: true,
        };

        await indexedDBStorage.put('tables', updatedTable);
        await indexedDBStorage.addOperation({
          type: 'UPDATE_TABLE',
          data: {
            id: selectedTable.id,
            status: 'AVAILABLE',
            closedBy: user.id,
            closedAt: new Date().toISOString(),
          },
          branchId: selectedBranch,
        });

        console.log('[MobileTables] Table closed offline:', updatedTable);
        closedSuccessfully = true;
      }

      if (closedSuccessfully) {
        // Clear cart
        try {
          const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
          const indexedDBStorage = getIndexedDBStorage();
          await indexedDBStorage.init();
          const storage = indexedDBStorage as any;
          const cartKey = `table-cart-${selectedTable.id}`;
          await storage.deleteItem(cartKey);
        } catch (e) {
          console.error('Failed to clear cart:', e);
        }

        setTableCart([]);
        await fetchTables();
        setCloseTableDialogOpen(false);
        setTableDetailsOpen(false);
        setSelectedTable(null);
        showSuccessToast('Success', `Table ${selectedTable.tableNumber} closed!`);
      }
    } catch (error) {
      console.error('Failed to close table:', error);
      showErrorToast('Error', 'Failed to close table');
    } finally {
      setCloseTableLoading(false);
    }
  };

  const handleOpenTransferDialog = async () => {
    if (!selectedTable) return;

    try {
      const response = await fetch(`/api/tables?branchId=${selectedBranch}`);
      if (response.ok) {
        const data = await response.json();
        const occupiedTables = (data.tables || []).filter(
          (t: any) => t.status === 'OCCUPIED' && t.id !== selectedTable.id
        );
        setAvailableTables(occupiedTables);

        if (occupiedTables.length === 0) {
          showSuccessToast('Info', 'No other occupied tables available for transfer');
          return;
        }

        const initialTransferItems: Record<string, number> = {};
        tableCart.forEach(item => {
          initialTransferItems[item.id] = 0;
        });
        setTransferItems(initialTransferItems);
        setTargetTableId('');
        setTransferDialogOpen(true);
      }
    } catch (error) {
      console.error('Failed to fetch tables:', error);
      showErrorToast('Error', 'Failed to load available tables');
    }
  };

  const handleTransferItems = async () => {
    if (!selectedTable || !targetTableId) {
      showErrorToast('Error', 'Please select a target table');
      return;
    }

    const itemsToTransfer = Object.entries(transferItems).filter(([_, qty]) => qty > 0);
    if (itemsToTransfer.length === 0) {
      showErrorToast('Error', 'Please select at least one item to transfer');
      return;
    }

    setTransferLoading(true);
    try {
      const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
      const indexedDBStorage = getIndexedDBStorage();
      await indexedDBStorage.init();
      const storage = indexedDBStorage as any;

      const sourceCart = [...tableCart];
      const targetCartKey = `table-cart-${targetTableId}`;
      const targetCartJson = await storage.getJSON(targetCartKey);
      let targetCart: CartItem[] = targetCartJson || [];

      itemsToTransfer.forEach(([itemId, qty]) => {
        const sourceItem = sourceCart.find(i => i.id === itemId);
        if (!sourceItem) return;

        const targetItem = targetCart.find(t =>
          t.menuItemId === sourceItem.menuItemId &&
          t.variantId === sourceItem.variantId &&
          t.note === sourceItem.note &&
          t.customVariantValue === sourceItem.customVariantValue
        );

        if (targetItem) {
          targetItem.quantity += qty;
        } else {
          targetCart.push({
            ...sourceItem,
            quantity: qty,
          });
        }

        if (qty >= sourceItem.quantity) {
          const idx = sourceCart.findIndex(i => i.id === itemId);
          if (idx > -1) {
            sourceCart.splice(idx, 1);
          }
        } else {
          sourceItem.quantity -= qty;
        }
      });

      setTableCart(sourceCart);
      await storage.setJSON(`table-cart-${selectedTable.id}`, sourceCart);
      await storage.setJSON(targetCartKey, targetCart);

      setTransferDialogOpen(false);
      setTransferItems({});
      setTargetTableId('');
      showSuccessToast('Success', 'Items transferred successfully!');
    } catch (error) {
      console.error('Transfer failed:', error);
      showErrorToast('Error', 'Failed to transfer items');
    } finally {
      setTransferLoading(false);
    }
  };

  const handleTransferQuantityChange = (itemId: string, value: number) => {
    setTransferItems(prev => ({
      ...prev,
      [itemId]: Math.max(0, value),
    }));
  };

  const handleSetMaxQuantity = (itemId: string) => {
    const item = tableCart.find(i => i.id === itemId);
    if (item) {
      setTransferItems(prev => ({
        ...prev,
        [itemId]: item.quantity,
      }));
    }
  };

  const getCartTotal = () => {
    return tableCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  const formatVariantDisplay = (item: CartItem) => {
    if (item.customVariantValue && item.variantName) {
      // Custom input mode - show weight in grams
      const weight = Math.round(item.customVariantValue * 1000);
      return `${weight}g`;
    }
    if (item.variantName) {
      return item.variantName;
    }
    return '';
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white px-4 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
            <LayoutGrid className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Tables</h1>
            <p className="text-emerald-100 text-sm">View and manage restaurant tables</p>
          </div>
        </div>

        {/* Branch Selector */}
        <MobileBranchSelector onBranchChange={setSelectedBranch} />
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
            className={filter === 'all' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
          >
            All ({tables.length})
          </Button>
          <Button
            variant={filter === 'available' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('available')}
            className={filter === 'available' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
          >
            Available ({tables.filter(t => t.status === 'AVAILABLE').length})
          </Button>
          <Button
            variant={filter === 'occupied' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('occupied')}
            className={filter === 'occupied' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
          >
            Occupied ({tables.filter(t => t.status === 'OCCUPIED' || t.status === 'READY_TO_PAY').length})
          </Button>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={fetchTables}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tables Grid */}
      <div className="p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <div className="animate-spin h-10 w-10 border-4 border-emerald-600 border-t-transparent rounded-full mb-3" />
            <p>Loading tables...</p>
          </div>
        ) : filteredTables.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <LayoutGrid className="w-16 h-16 mb-4 text-slate-300" />
            <p className="font-medium">No tables found</p>
            <p className="text-sm">Create tables in Settings to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {filteredTables.map((table) => {
              const config = getStatusConfig(table.status);
              const showOpenButton = tableWithOpenButton === table.id;

              return (
                <div key={table.id} className="relative">
                  {/* Table Card */}
                  <button
                    className={`
                      w-full aspect-square rounded-xl border-2 flex flex-col items-center justify-center
                      transition-all duration-200 relative shadow-sm
                      ${config.bgColor} ${config.borderColor}
                      ${showOpenButton ? 'opacity-50' : 'hover:scale-105 hover:shadow-md active:scale-95'}
                    `}
                    onClick={() => !showOpenButton && handleTableClick(table)}
                  >
                    <span className={`text-3xl font-bold ${config.color}`}>
                      {table.tableNumber}
                    </span>
                    <div className={`mt-2 w-2 h-2 rounded-full ${config.color.replace('text', 'bg')}`} />
                    
                    {/* Info indicator */}
                    {(table.customer || table.totalAmount > 0) && (
                      <div className="absolute top-2 left-2">
                        <Info className="h-4 w-4 text-slate-400" />
                      </div>
                    )}
                  </button>

                  {/* Open Button */}
                  {showOpenButton && (
                    <div className="absolute inset-0 flex items-center justify-center z-10 p-2">
                      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border-2 border-emerald-500 p-3 flex flex-col gap-2 w-full animate-in fade-in zoom-in duration-200">
                        <div className="text-center">
                          <p className="font-bold text-slate-900 dark:text-white text-lg">Table {table.tableNumber}</p>
                          <p className="text-xs text-slate-500">Open this table?</p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleOpenTable(table)}
                            className="bg-emerald-600 hover:bg-emerald-700 flex-1"
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Open
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setTableWithOpenButton(null)}
                            className="flex-1"
                          >
                            <X className="h-3 w-3 mr-1" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Table Details Dialog */}
      <Dialog open={tableDetailsOpen} onOpenChange={setTableDetailsOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutGrid className="h-5 w-5 text-emerald-600" />
              Table {selectedTable?.tableNumber}
            </DialogTitle>
            <DialogDescription>
              {selectedTable && getStatusConfig(selectedTable.status).label}
            </DialogDescription>
          </DialogHeader>

          {selectedTable && (
            <div className="space-y-4">
              {/* Table Info */}
              <Card>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Status</span>
                    <Badge className={getStatusConfig(selectedTable.status).bgColor}>
                      {getStatusConfig(selectedTable.status).label}
                    </Badge>
                  </div>
                  {selectedTable.capacity && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Capacity</span>
                      <span className="text-sm font-medium">{selectedTable.capacity} seats</span>
                    </div>
                  )}
                  {selectedTable.customer && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Customer</span>
                      <span className="text-sm font-medium">{selectedTable.customer.name}</span>
                    </div>
                  )}
                  {selectedTable.openedAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Opened</span>
                      <span className="text-sm font-medium">
                        {new Date(selectedTable.openedAt).toLocaleTimeString()}
                      </span>
                    </div>
                  )}
                  {selectedTable.totalAmount > 0 && (
                    <div className="flex items-center justify-between pt-2 border-t">
                      <span className="text-sm text-slate-600 font-medium">Total</span>
                      <span className="text-lg font-bold text-emerald-600">
                        {formatCurrency(selectedTable.totalAmount)}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Cart Items */}
              {loadingCart ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin h-6 w-6 border-3 border-emerald-600 border-t-transparent rounded-full" />
                </div>
              ) : tableCart.length > 0 ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Order Items ({tableCart.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <ScrollArea className="h-48">
                      <div className="space-y-3">
                        {tableCart.map((item) => (
                          <div key={item.id} className="flex items-start justify-between gap-2 pb-2 border-b last:border-0">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm line-clamp-1">{item.name}</p>
                              {formatVariantDisplay(item) && (
                                <p className="text-xs text-slate-500">{formatVariantDisplay(item)}</p>
                              )}
                              {item.note && (
                                <p className="text-xs text-slate-500 italic">Note: {item.note}</p>
                              )}
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="font-medium text-sm">{item.quantity}x</p>
                              <p className="text-xs text-slate-600">
                                {formatCurrency(item.price * item.quantity)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                    <div className="mt-3 pt-3 border-t flex items-center justify-between">
                      <span className="font-semibold">Total</span>
                      <span className="text-lg font-bold text-emerald-600">
                        {formatCurrency(getCartTotal())}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-6 text-center text-slate-500">
                    <Utensils className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    <p>No items added yet</p>
                  </CardContent>
                </Card>
              )}

              {/* Actions */}
              <div className="space-y-2">
                {tableCart.length > 0 && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleOpenTransferDialog}
                    disabled={tables.filter(t => t.status === 'OCCUPIED' && t.id !== selectedTable.id).length === 0}
                  >
                    <ArrowRight className="h-4 w-4 mr-2" />
                    Transfer Items
                  </Button>
                )}
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => setCloseTableDialogOpen(true)}
                >
                  <X className="h-4 w-4 mr-2" />
                  Close Table
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Close Table Confirmation Dialog */}
      <Dialog open={closeTableDialogOpen} onOpenChange={setCloseTableDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close Table {selectedTable?.tableNumber}?</DialogTitle>
            <DialogDescription>
              {tableCart.length > 0
                ? `This table has ${tableCart.length} item(s) with total ${formatCurrency(getCartTotal())}. Are you sure you want to close it?`
                : 'This table has no items. Close it anyway?'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setCloseTableDialogOpen(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleCloseTable}
              disabled={closeTableLoading}
              className="w-full sm:w-auto"
            >
              {closeTableLoading ? 'Closing...' : 'Close Table'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Items Dialog */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Transfer Items</DialogTitle>
            <DialogDescription>Select items to transfer to another table</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Target Table Selection */}
            <div className="space-y-2">
              <Label>Target Table</Label>
              <Select value={targetTableId} onValueChange={setTargetTableId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select table" />
                </SelectTrigger>
                <SelectContent>
                  {availableTables.map((table) => (
                    <SelectItem key={table.id} value={table.id}>
                      Table {table.tableNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Items to Transfer */}
            <div className="space-y-2">
              <Label>Items to Transfer</Label>
              <ScrollArea className="h-64">
                <div className="space-y-3 pr-2">
                  {tableCart.map((item) => {
                    const transferQty = transferItems[item.id] || 0;
                    return (
                      <div key={item.id} className="flex items-center gap-2 p-3 border rounded-lg">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm line-clamp-1">{item.name}</p>
                          {formatVariantDisplay(item) && (
                            <p className="text-xs text-slate-500">{formatVariantDisplay(item)}</p>
                          )}
                          <p className="text-xs text-slate-600">
                            Available: {item.quantity}x • {formatCurrency(item.price)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleTransferQuantityChange(item.id, transferQty - 1)}
                            disabled={transferQty <= 0}
                          >
                            -
                          </Button>
                          <Input
                            type="number"
                            value={transferQty}
                            onChange={(e) => handleTransferQuantityChange(item.id, parseInt(e.target.value) || 0)}
                            className="w-16 h-8 text-center"
                            min={0}
                            max={item.quantity}
                          />
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleTransferQuantityChange(item.id, transferQty + 1)}
                            disabled={transferQty >= item.quantity}
                          >
                            +
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleSetMaxQuantity(item.id)}
                            title="Set to max"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setTransferDialogOpen(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleTransferItems}
              disabled={!targetTableId || transferLoading || Object.values(transferItems).every(qty => qty === 0)}
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700"
            >
              {transferLoading ? 'Transferring...' : 'Transfer Items'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
