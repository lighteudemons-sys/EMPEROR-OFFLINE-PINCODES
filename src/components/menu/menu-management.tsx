'use client';

import { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, LayoutDashboard, FolderTree, Coffee, DollarSign } from 'lucide-react';
import { MenuOverview } from './menu-overview';
import { MenuCategories } from './menu-categories';
import { MenuItemsTable } from './menu-items-table';
import { MenuBranchPricingMatrix } from './menu-branch-pricing-matrix';
import { MenuItemDialog } from './menu-item-dialog';
import {
  type MenuItem,
  type Category,
  type Branch,
  fetchMenuItems,
  fetchCategories,
  fetchBranches,
} from './menu-shared';

interface MenuManagementProps {
  initialActiveTab?: string;
}

export default function MenuManagement({ initialActiveTab = 'overview' }: MenuManagementProps) {
  const [activeTab, setActiveTab] = useState(initialActiveTab);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [items, cats, brs] = await Promise.all([
        fetchMenuItems(true), // include inactive
        fetchCategories(),
        fetchBranches(),
      ]);
      setMenuItems(items);
      setCategories(cats);
      setBranches(brs);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function openAddItem() {
    setEditingItem(null);
    setItemDialogOpen(true);
  }

  function openEditItem(item: MenuItem) {
    setEditingItem(item);
    setItemDialogOpen(true);
  }

  function openViewItem(item: MenuItem) {
    // For "view", we open the dialog in edit mode (no separate read-only view)
    setEditingItem(item);
    setItemDialogOpen(true);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        <span className="ml-2 text-sm text-slate-500">Loading menu...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200">
        <CardContent className="p-8 text-center">
          <p className="text-sm text-red-600 font-medium">Failed to load menu data</p>
          <p className="text-xs text-slate-500 mt-1">{error}</p>
          <button
            onClick={refresh}
            className="mt-3 text-sm text-emerald-600 hover:underline"
          >
            Try again
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 max-w-2xl">
          <TabsTrigger value="overview" className="text-xs sm:text-sm">
            <LayoutDashboard className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="items" className="text-xs sm:text-sm">
            <Coffee className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Items</span>
          </TabsTrigger>
          <TabsTrigger value="categories" className="text-xs sm:text-sm">
            <FolderTree className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Categories</span>
          </TabsTrigger>
          <TabsTrigger value="pricing" className="text-xs sm:text-sm">
            <DollarSign className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Branch Pricing</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <MenuOverview
            menuItems={menuItems}
            categories={categories}
            branches={branches}
            onGoToItems={() => setActiveTab('items')}
            onGoToCategories={() => setActiveTab('categories')}
            onGoToPricing={() => setActiveTab('pricing')}
            onAddItem={openAddItem}
          />
        </TabsContent>

        <TabsContent value="items" className="mt-6">
          <MenuItemsTable
            menuItems={menuItems}
            categories={categories}
            branches={branches}
            onAddItem={openAddItem}
            onEditItem={openEditItem}
            onViewItem={openViewItem}
            onRefresh={refresh}
          />
        </TabsContent>

        <TabsContent value="categories" className="mt-6">
          <MenuCategories
            categories={categories}
            menuItems={menuItems}
            onRefresh={refresh}
          />
        </TabsContent>

        <TabsContent value="pricing" className="mt-6">
          <MenuBranchPricingMatrix
            menuItems={menuItems}
            branches={branches}
            categories={categories}
            onRefresh={refresh}
          />
        </TabsContent>
      </Tabs>

      {/* Add/Edit Item Dialog */}
      <MenuItemDialog
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
        editingItem={editingItem}
        categories={categories}
        branches={branches}
        onSaved={refresh}
      />
    </div>
  );
}
