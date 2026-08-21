'use client';

import { useState, useCallback } from 'react';
import { CalendarIcon, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  PRESETS,
  getDateRangeFromPreset,
  formatDateShort,
  type PresetKey,
  type DateRange,
} from '@/lib/date-range';

// ---------------------------------------------------------------------------
// Quick-preset groups for the popover
// ---------------------------------------------------------------------------

const QUICK: PresetKey[] = ['today', 'yesterday', 'thisWeek', 'last7Days', 'lastWeek'];
const MONTHLY: PresetKey[] = ['thisMonth', 'last30Days', 'lastMonth'];
const LARGER: PresetKey[] = ['thisQuarter', 'lastQuarter', 'thisYear', 'lastYear', 'allTime'];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DateRangeFilterProps {
  /** Currently selected preset. Pass "custom" when using custom dates. */
  value: PresetKey | 'custom';
  /** Callback when a preset is picked or custom range is applied. */
  onChange: (key: PresetKey | 'custom', range: DateRange) => void;
  /** External custom date range (only relevant when value === 'custom'). */
  customRange?: { from: Date; to: Date };
  className?: string;
  /** Show "All Time" preset (default true). Set false for tabs where it doesn't make sense. */
  showAllTime?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DateRangeFilter({
  value,
  onChange,
  customRange,
  className,
  showAllTime = true,
}: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState<Date | undefined>(
    customRange?.from
  );
  const [customTo, setCustomTo] = useState<Date | undefined>(customRange?.to);
  const [pickerMode, setPickerMode] = useState<'from' | 'to'>('from');

  // Resolve display label
  const getDisplayLabel = useCallback((): string => {
    if (value === 'custom' && customRange) {
      return `${formatDateShort(customRange.from)} → ${formatDateShort(customRange.to)}`;
    }
    if (value !== 'custom') {
      return getDateRangeFromPreset(value).label;
    }
    return 'Custom Range';
  }, [value, customRange]);

  const handlePreset = (key: PresetKey) => {
    if (!showAllTime && key === 'allTime') return;
    const range = getDateRangeFromPreset(key);
    onChange(key, range);
    setOpen(false);
  };

  const handleApplyCustom = () => {
    if (!customFrom || !customTo) return;
    // Ensure from <= to
    const from = customFrom <= customTo ? customFrom : customTo;
    const to = customFrom <= customTo ? customTo : customFrom;
    onChange('custom', {
      startDate: from,
      endDate: to,
      label: `${formatDateShort(from)} → ${formatDateShort(to)}`,
    });
    setOpen(false);
  };

  const handleReset = () => {
    setCustomFrom(undefined);
    setCustomTo(undefined);
    setPickerMode('from');
  };

  const isCustomActive = value === 'custom';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'justify-between gap-2 text-sm font-normal h-9 min-w-[200px]',
            isCustomActive && 'border-primary/50 bg-primary/5',
            className
          )}
        >
          <span className="truncate">{getDisplayLabel()}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-auto p-0" align="start">
        {/* Presets */}
        <div className="p-3 space-y-3 max-h-[340px] overflow-y-auto">
          {/* Quick */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-1">
              Quick
            </p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK.filter(k => showAllTime || k !== 'allTime').map(k => (
                <PresetBtn
                  key={k}
                  label={PRESETS.find(p => p.value === k)!.label}
                  active={value === k}
                  onClick={() => handlePreset(k)}
                />
              ))}
            </div>
          </div>

          <Separator />

          {/* Monthly */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-1">
              Monthly
            </p>
            <div className="flex flex-wrap gap-1.5">
              {MONTHLY.map(k => (
                <PresetBtn
                  key={k}
                  label={PRESETS.find(p => p.value === k)!.label}
                  active={value === k}
                  onClick={() => handlePreset(k)}
                />
              ))}
            </div>
          </div>

          <Separator />

          {/* Quarterly / Yearly */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-1">
              Quarterly &amp; Yearly
            </p>
            <div className="flex flex-wrap gap-1.5">
              {LARGER.filter(k => showAllTime || k !== 'allTime').map(k => (
                <PresetBtn
                  key={k}
                  label={PRESETS.find(p => p.value === k)!.label}
                  active={value === k}
                  onClick={() => handlePreset(k)}
                />
              ))}
            </div>
          </div>

          <Separator />

          {/* Custom Range */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-1">
              Custom Range
            </p>
            <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
              {/* From / To display */}
              <div className="flex items-center gap-2 text-sm">
                <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span
                  className={cn(
                    'cursor-pointer px-2 py-0.5 rounded transition-colors',
                    pickerMode === 'from' && 'bg-primary/10 text-primary font-medium',
                    pickerMode !== 'from' && 'hover:bg-muted'
                  )}
                  onClick={() => setPickerMode('from')}
                >
                  {customFrom ? formatDateShort(customFrom) : 'From'}
                </span>
                <span className="text-muted-foreground">→</span>
                <span
                  className={cn(
                    'cursor-pointer px-2 py-0.5 rounded transition-colors',
                    pickerMode === 'to' && 'bg-primary/10 text-primary font-medium',
                    pickerMode !== 'to' && 'hover:bg-muted'
                  )}
                  onClick={() => setPickerMode('to')}
                >
                  {customTo ? formatDateShort(customTo) : 'To'}
                </span>
                {(customFrom || customTo) && (
                  <button
                    onClick={handleReset}
                    className="ml-auto p-0.5 rounded hover:bg-muted"
                    type="button"
                  >
                    <X className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
              </div>

              {/* Calendar */}
              <Calendar
                mode="single"
                selected={pickerMode === 'from' ? customFrom : customTo}
                onSelect={(d) => {
                  if (pickerMode === 'from') {
                    setCustomFrom(d);
                    if (d) setPickerMode('to'); // auto-advance to "to"
                  } else {
                    setCustomTo(d);
                  }
                }}
                defaultMonth={
                  pickerMode === 'from'
                    ? customFrom ?? new Date()
                    : customTo ?? customFrom ?? new Date()
                }
                className="rounded-md border"
              />

              {/* Apply */}
              <Button
                size="sm"
                className="w-full"
                disabled={!customFrom || !customTo}
                onClick={handleApplyCustom}
              >
                Apply Range
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Tiny preset button
// ---------------------------------------------------------------------------

function PresetBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {label}
    </button>
  );
}