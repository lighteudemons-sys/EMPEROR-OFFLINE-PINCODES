'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Coffee, FolderTree, CheckCircle2, XCircle, Building2, Layers, DollarSign, TrendingUp } from 'lucide-react';
import type { MenuItem, Category, Branch } from './menu-shared';

interface MenuOverviewProps {
  menuItems: MenuItem[];
  categories: Category[];
  branches: Branch[];
  onGoToItems: () => void;
  onGoToCategories: () => void;
  onGoToPricing: () => void;
  onAddItem: () => void;
}

export function MenuOverview({
  menuItems,
  categories,
  branches,
  onGoToItems,
  onGoToCategories,
  onGoToPricing,
  onAddItem,
}: MenuOverviewProps) {
  const totalItems = menuItems.length;
  const activeItems = menuItems.filter((i) => i.isActive && !i.deletedAt).length;
  const inactiveItems = menuItems.filter((i) => !i.isActive || i.deletedAt).length;
  const archivedItems = menuItems.filter((i) => i.deletedAt).length;
  const activeCategories = categories.filter((c) => c.isActive).length;
  const totalCategories = categories.length;

  // Branch coverage: how many items are available in each branch?
  const branchCoverage = branches.map((branch) => {
    const available = menuItems.filter((item) => {
      if (!item.isActive || item.deletedAt) return false;
      if (item.availabilityMode === 'GLOBAL') {
        const assignment = item.branchAssignments?.find((a) => a.branchId === branch.id);
        return !assignment || assignment.isActive;
      } else {
        const assignment = item.branchAssignments?.find((a) => a.branchId === branch.id);
        return !!assignment && assignment.isActive;
      }
    }).length;
    return {
      branch,
      available,
      total: totalItems,
      percentage: totalItems > 0 ? Math.round((available / totalItems) * 100) : 0,
    };
  });

  // Pricing overrides stats
  const itemsWithOverrides = menuItems.filter(
    (item) => item.branchAssignments?.some((a) => a.price !== null && a.price !== undefined),
  ).length;
  const itemsGlobalOnly = menuItems.filter(
    (item) => !item.branchAssignments || item.branchAssignments.every((a) => a.price === null || a.price === undefined),
  ).length;
  const itemsWithBranchOverrides = menuItems.filter(
    (item) => item.availabilityMode === 'EXPLICIT',
  ).length;

  const stats = [
    {
      title: 'Menu Items',
      value: totalItems,
      subtitle: `${activeItems} active · ${inactiveItems} inactive${archivedItems > 0 ? ` · ${archivedItems} archived` : ''}`,
      icon: Coffee,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      title: 'Categories',
      value: totalCategories,
      subtitle: `${activeCategories} active`,
      icon: FolderTree,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      title: 'Active Items',
      value: activeItems,
      subtitle: `${totalItems > 0 ? Math.round((activeItems / totalItems) * 100) : 0}% of total`,
      icon: CheckCircle2,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      title: 'Branches',
      value: branches.length,
      subtitle: `${branches.filter((b) => b.isActive).length} active`,
      icon: Building2,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="border-slate-200">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">{stat.title}</p>
                    <p className="text-3xl font-bold text-slate-900 mt-1">{stat.value}</p>
                    <p className="text-xs text-slate-500 mt-1">{stat.subtitle}</p>
                  </div>
                  <div className={`${stat.bg} ${stat.color} p-2.5 rounded-lg`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Branch coverage */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-slate-500" />
            Branch Coverage
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {branchCoverage.length === 0 ? (
            <p className="text-sm text-slate-500">No branches configured.</p>
          ) : (
            branchCoverage.map(({ branch, available, total, percentage }) => (
              <div key={branch.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{branch.branchName}</span>
                  <span className="text-slate-500">
                    {available}/{total} items ({percentage}%)
                  </span>
                </div>
                <Progress
                  value={percentage}
                  className="h-2"
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Pricing overrides summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-slate-200">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="bg-amber-50 text-amber-600 p-2.5 rounded-lg">
                <DollarSign className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{itemsWithOverrides}</p>
                <p className="text-xs text-slate-500">Items with branch price overrides</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="bg-slate-50 text-slate-600 p-2.5 rounded-lg">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{itemsGlobalOnly}</p>
                <p className="text-xs text-slate-500">Items using global price only</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="bg-purple-50 text-purple-600 p-2.5 rounded-lg">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{itemsWithBranchOverrides}</p>
                <p className="text-xs text-slate-500">Branch-specific items (EXPLICIT)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <Card className="border-slate-200 bg-slate-50/50">
        <CardContent className="p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Quick Actions</h3>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onAddItem} className="bg-emerald-600 hover:bg-emerald-700">
              <Coffee className="h-4 w-4 mr-2" />
              Add Menu Item
            </Button>
            <Button variant="outline" onClick={onGoToCategories}>
              <FolderTree className="h-4 w-4 mr-2" />
              Manage Categories
            </Button>
            <Button variant="outline" onClick={onGoToPricing}>
              <DollarSign className="h-4 w-4 mr-2" />
              Branch Pricing Matrix
            </Button>
            <Button variant="outline" onClick={onGoToItems}>
              <Layers className="h-4 w-4 mr-2" />
              View All Items
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
