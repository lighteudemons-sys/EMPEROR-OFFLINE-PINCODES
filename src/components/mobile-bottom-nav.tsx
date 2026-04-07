'use client';

import { Home, ShoppingCart, ClipboardList, Clock, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MobileBottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function MobileBottomNav({ activeTab, onTabChange }: MobileBottomNavProps) {
  const tabs = [
    { id: 'mobile-dashboard', label: 'Dash', icon: Home },
    { id: 'mobile-pos', label: 'POS', icon: ShoppingCart },
    { id: 'mobile-orders', label: 'Orders', icon: ClipboardList },
    { id: 'mobile-shifts', label: 'Shifts', icon: Clock },
    { id: 'mobile-more', label: 'More', icon: MoreHorizontal },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50 safe-area-inset-bottom">
      <div className="flex items-center justify-around h-16 pb-safe">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id || (activeTab === 'pos' && tab.id === 'mobile-pos');

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'flex flex-col items-center justify-center w-full h-full space-y-1 transition-all duration-200',
                'active:scale-95',
                isActive
                  ? 'text-emerald-600'
                  : 'text-slate-500 hover:text-slate-700'
              )}
            >
              <Icon className={cn(
                'w-6 h-6 transition-transform duration-200',
                isActive ? 'scale-110' : ''
              )} />
              <span className={cn(
                'text-xs font-medium transition-all duration-200',
                isActive ? 'font-semibold' : ''
              )}>
                {tab.label}
              </span>
              {isActive && (
                <div className="absolute bottom-0 w-12 h-0.5 bg-emerald-600 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
