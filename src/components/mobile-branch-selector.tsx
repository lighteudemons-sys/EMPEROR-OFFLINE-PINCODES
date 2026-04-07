'use client';

import { useState, useEffect, useRef } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, ChevronDown } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useOfflineData, offlineDataFetchers } from '@/hooks/use-offline-data';

interface MobileBranchSelectorProps {
  className?: string;
  onBranchChange?: (branchId: string) => void;
}

export function MobileBranchSelector({ className = '', onBranchChange }: MobileBranchSelectorProps) {
  const { user } = useAuth();
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const hasInitialized = useRef(false);
  
  const { data: branchesData } = useOfflineData(
    '/api/branches',
    {
      fetchFromDB: offlineDataFetchers.branches,
    }
  );

  const branches = Array.isArray(branchesData)
    ? branchesData.map((branch: any) => ({
        id: branch.id,
        name: branch.branchName,
      }))
    : (branchesData?.branches || []).map((branch: any) => ({
        id: branch.id,
        name: branch.branchName,
      }));

  // Set default branch on mount (only once)
  useEffect(() => {
    if (user?.role === 'ADMIN' && branches.length > 0 && !hasInitialized.current) {
      const defaultBranchId = branches[0].id;
      // Use setTimeout to avoid synchronous setState in effect
      setTimeout(() => {
        setSelectedBranch(defaultBranchId);
        onBranchChange?.(defaultBranchId);
        hasInitialized.current = true;
      }, 0);
    }
  }, [user, branches, onBranchChange]);

  const handleBranchChange = (branchId: string) => {
    setSelectedBranch(branchId);
    onBranchChange?.(branchId);
  };

  // Only show branch selector for admin users
  if (user?.role !== 'ADMIN') {
    return null;
  }

  if (branches.length === 0) {
    return null;
  }

  return (
    <div className={`flex items-center gap-2 bg-white rounded-lg shadow-sm border border-slate-200 px-3 py-2 ${className}`}>
      <Building2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-500 font-medium">Working on</p>
        <Select value={selectedBranch} onValueChange={handleBranchChange}>
          <SelectTrigger className="h-6 border-0 p-0 bg-transparent text-sm font-semibold text-slate-900 focus:ring-0 shadow-none">
            <SelectValue placeholder="Select branch" />
          </SelectTrigger>
          <SelectContent>
            {branches.map((branch) => (
              <SelectItem key={branch.id} value={branch.id}>
                {branch.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
    </div>
  );
}
