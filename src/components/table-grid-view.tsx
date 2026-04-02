'use client';
import { useAuth } from '@/lib/auth-context';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Users, Clock, Utensils, CheckCircle, AlertCircle, Plus, X, Info } from 'lucide-react';

interface TableData {
  id: string;
  tableNumber: number;
  status: 'AVAILABLE' | 'OCCUPIED' | 'READY_TO_PAY' | 'RESERVED' | 'CLEANING';
  capacity: number | null;
  totalAmount: number;
  customer?: {
    id: string;
    name: string;
    phone: string;
  } | null;
  openedAt: string | null;
}

interface TableGridViewProps {
  branchId: string;
  onTableSelect: (table: TableData) => void;
  selectedTableId: string | null;
  refreshTrigger?: number; // Force refresh when this changes
}

export default function TableGridView({ branchId, onTableSelect, selectedTableId, refreshTrigger }: TableGridViewProps) {
  const { user } = useAuth();
  const [tables, setTables] = useState<TableData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'available' | 'occupied'>('all');
  const [tableWithOpenButton, setTableWithOpenButton] = useState<string | null>(null);

  useEffect(() => {
    fetchTables();
  }, [branchId, refreshTrigger]); // Refresh when branchId or refreshTrigger changes

  const fetchTables = async () => {
    try {
      setLoading(true);

      // First, always try to load from IndexedDB to get latest offline state
      let offlineTables: any[] = [];
      try {
        const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
        const indexedDBStorage = getIndexedDBStorage();
        await indexedDBStorage.init();
        offlineTables = await indexedDBStorage.getAllTables();
        console.log('[TableGridView] Loaded tables from IndexedDB:', offlineTables.length);
      } catch (dbError) {
        console.error('[TableGridView] Failed to load from IndexedDB:', dbError);
      }

      // Try to fetch from API
      try {
        const response = await fetch(`/api/tables?branchId=${branchId}`);
        if (response.ok) {
          const data = await response.json();
          const apiTables = data.tables || [];

          // Merge API tables with offline modifications
          const mergedTables = apiTables.map((apiTable: any) => {
            // Find if this table was modified offline
            const offlineModified = offlineTables.find((t: any) => t.id === apiTable.id && t._offlineModified);

            // If modified offline, use offline status
            if (offlineModified) {
              console.log(`[TableGridView] Table ${apiTable.tableNumber} was modified offline, using offline status: ${offlineModified.status}`);
              return {
                ...apiTable,
                status: offlineModified.status,
                openedAt: offlineModified.openedAt,
              };
            }

            return apiTable;
          });

          setTables(mergedTables);

          // Cache tables to IndexedDB (but don't overwrite offline modifications)
          try {
            const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
            const indexedDBStorage = getIndexedDBStorage();
            await indexedDBStorage.init();

            // Only update tables that weren't modified offline
            const tablesToCache = apiTables.filter((apiTable: any) => {
              return !offlineTables.find((t: any) => t.id === apiTable.id && t._offlineModified);
            });

            if (tablesToCache.length > 0) {
              await indexedDBStorage.batchSaveTables(mergedTables);
              console.log('[TableGridView] Tables cached to IndexedDB:', mergedTables.length);
            }
          } catch (cacheError) {
            console.error('[TableGridView] Failed to cache tables:', cacheError);
          }
        } else {
          // API failed, use offline tables
          console.log('[TableGridView] API failed, using offline tables');
          setTables(offlineTables);
        }
      } catch (apiError) {
        console.log('[TableGridView] API error, using offline tables:', apiError);
        setTables(offlineTables);
      }
    } catch (error) {
      console.error('Failed to fetch tables:', error);

      // Final fallback - try to load from IndexedDB
      try {
        const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
        const indexedDBStorage = getIndexedDBStorage();
        await indexedDBStorage.init();
        const cachedTables = await indexedDBStorage.getAllTables();
        setTables(cachedTables);
        console.log('[TableGridView] Loaded tables from IndexedDB (final fallback):', cachedTables.length);
      } catch (dbError) {
        console.error('[TableGridView] Failed to load from IndexedDB:', dbError);
      }
    } finally {
      setLoading(false);
    }
  };

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { color: string; bgColor: string; borderColor: string; icon: any }> = {
      AVAILABLE: {
        color: 'text-emerald-700',
        bgColor: 'bg-emerald-50 hover:bg-emerald-100',
        borderColor: 'border-emerald-200 hover:border-emerald-400',
        icon: CheckCircle,
      },
      OCCUPIED: {
        color: 'text-blue-700',
        bgColor: 'bg-blue-50 hover:bg-blue-100',
        borderColor: 'border-blue-200 hover:border-blue-400',
        icon: Users,
      },
      READY_TO_PAY: {
        color: 'text-orange-700',
        bgColor: 'bg-orange-50 hover:bg-orange-100',
        borderColor: 'border-orange-200 hover:border-orange-400',
        icon: Clock,
      },
      RESERVED: {
        color: 'text-purple-700',
        bgColor: 'bg-purple-50 hover:bg-purple-100',
        borderColor: 'border-purple-200 hover:border-purple-400',
        icon: Utensils,
      },
      CLEANING: {
        color: 'text-slate-700',
        bgColor: 'bg-slate-50 hover:bg-slate-100',
        borderColor: 'border-slate-200 hover:border-slate-400',
        icon: AlertCircle,
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

  const handleTableClick = (table: TableData) => {
    if (table.status === 'AVAILABLE') {
      // Show "Open" button for available tables
      setTableWithOpenButton(table.id);
    } else {
      // Select occupied tables directly
      onTableSelect(table);
    }
  };

  const handleOpenTable = async (table: TableData) => {
    try {
      if (!user) {
        alert('User not logged in');
        return;
      }

      let tableData: TableData;

      // Try to open table via API (online)
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
      } else {
        throw new Error('API request failed');
      }

      // Select the table and notify parent
      onTableSelect(tableData);
    } catch (error) {
      console.error('Failed to open table via API (likely offline), trying offline fallback:', error);

      // OFFLINE FALLBACK: Open table locally and queue for sync
      try {
        const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
        const indexedDBStorage = getIndexedDBStorage();
        await indexedDBStorage.init();

        // Create updated table with OCCUPIED status
        const offlineOpenedTable: TableData = {
          ...table,
          status: 'OCCUPIED',
          openedAt: new Date().toISOString(),
        };

        // Update table in IndexedDB
        await indexedDBStorage.put('tables', {
          ...offlineOpenedTable,
          _offlineModified: true, // Mark as modified offline
        });

        // Queue operation for sync
        await indexedDBStorage.addOperation({
          type: 'UPDATE_TABLE',
          data: {
            id: table.id,
            status: 'OCCUPIED',
            openedBy: user.id,
            openedAt: new Date().toISOString(),
          },
          branchId,
        });

        console.log('[TableGridView] Table opened offline:', offlineOpenedTable);

        // Select the table and notify parent
        onTableSelect({ ...offlineOpenedTable, totalAmount: 0 });

        // Update local tables state
        setTables(tables.map(t =>
          t.id === table.id ? offlineOpenedTable : t
        ));

        setTableWithOpenButton(null);
      } catch (offlineError) {
        console.error('Failed to open table offline:', offlineError);
        alert('Failed to open table. Please check your connection.');
      }
    }
  };

  const handleCancelOpen = () => {
    setTableWithOpenButton(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Tables</h3>
          <p className="text-sm text-slate-500">Select a table to start ordering</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
            className={filter === 'all' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
          >
            All
          </Button>
          <Button
            variant={filter === 'available' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('available')}
            className={filter === 'available' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
          >
            Available
          </Button>
          <Button
            variant={filter === 'occupied' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('occupied')}
            className={filter === 'occupied' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
          >
            Occupied
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchTables}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tables Grid - Small Boxes */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-emerald-500 border-t-transparent rounded-full"></div>
        </div>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
          {filteredTables.map((table) => {
            const config = getStatusConfig(table.status);
            const isSelected = selectedTableId === table.id;
            const showOpenButton = tableWithOpenButton === table.id;

            return (
              <div
                key={table.id}
                className="relative"
              >
                {/* Table Card - Small Box */}
                <button
                  className={`
                    w-full aspect-square rounded-lg border-2 flex flex-col items-center justify-center
                    transition-all duration-200 relative
                    ${config.bgColor} ${config.borderColor}
                    ${isSelected ? 'ring-2 ring-emerald-500 ring-offset-2' : ''}
                    ${showOpenButton ? 'opacity-50' : 'hover:scale-105'}
                  `}
                  onClick={() => !showOpenButton && handleTableClick(table)}
                  title={`Table ${table.tableNumber} - ${table.status}${table.customer ? ` (${table.customer.name})` : ''}`}
                >
                  {/* Table Number */}
                  <span className={`text-2xl font-bold ${config.color}`}>
                    {table.tableNumber}
                  </span>

                  {/* Status Dot */}
                  <div className={`mt-1 w-2 h-2 rounded-full ${config.color.replace('text', 'bg')}`} />

                  {/* Selected indicator */}
                  {isSelected && (
                    <div className="absolute top-1 right-1">
                      <div className="w-5 h-5 bg-emerald-600 rounded-full flex items-center justify-center">
                        <CheckCircle className="h-3 w-3 text-white" />
                      </div>
                    </div>
                  )}

                  {/* Info indicator for tables with extra data */}
                  {(table.customer || table.totalAmount > 0) && (
                    <div className="absolute top-1 left-1">
                      <Info className="h-3 w-3 text-slate-400" />
                    </div>
                  )}
                </button>

                {/* Open Button - Appears on click for available tables */}
                {showOpenButton && (
                  <div className="absolute inset-0 flex items-center justify-center z-10">
                    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl border-2 border-emerald-500 p-3 flex flex-col gap-2 animate-in fade-in zoom-in duration-200">
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
                          onClick={handleCancelOpen}
                          className="flex-1"
                        >
                          <X className="h-3 w-3 mr-1" />
                          Cancel
                        </Button>
                      </div>
                      {table.capacity && (
                        <p className="text-xs text-center text-slate-500">
                          {table.capacity} seats available
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Tooltip for occupied tables */}
                {table.status !== 'AVAILABLE' && !showOpenButton && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20">
                    <div className="bg-slate-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap">
                      <div className="font-semibold">Table {table.tableNumber}</div>
                      <div className="text-slate-300 capitalize">{table.status.toLowerCase()}</div>
                      {table.customer && <div>{table.customer.name}</div>}
                      {table.totalAmount > 0 && <div>EGP {table.totalAmount.toFixed(2)}</div>}
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Add New Table Button */}
          {filter === 'all' && (
            <button
              className="w-full aspect-square rounded-lg border-2 border-dashed border-slate-300 hover:border-emerald-500 hover:bg-emerald-50 transition-all duration-200 flex flex-col items-center justify-center text-slate-400 hover:text-emerald-600"
              onClick={() => alert('Please use Table Management in Settings to add new tables')}
            >
              <Plus className="h-6 w-6" />
              <span className="text-xs font-medium mt-1">Add</span>
            </button>
          )}
        </div>
      )}

      {tables.length === 0 && !loading && (
        <div className="text-center py-12">
          <Utensils className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h4 className="text-lg font-semibold text-slate-600 mb-2">No Tables Yet</h4>
          <p className="text-sm text-slate-500">
            Create tables in Settings to use the dine-in feature
          </p>
        </div>
      )}
    </div>
  );
}
