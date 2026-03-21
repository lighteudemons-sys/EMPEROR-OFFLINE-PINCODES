'use client';

import { Button } from '@/components/ui/button';
import { Delete, Eraser } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NumericKeypadProps {
  onDigitPress: (digit: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  disabled?: boolean;
  className?: string;
}

export function NumericKeypad({
  onDigitPress,
  onBackspace,
  onClear,
  disabled = false,
  className,
}: NumericKeypadProps) {
  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['clear', '0', 'backspace'],
  ] as const;

  return (
    <div className={cn('grid grid-cols-3 gap-2 w-full max-w-xs mx-auto', className)}>
      {keys.flat().map((key) => {
        const isAction = key === 'clear' || key === 'backspace';

        if (key === 'backspace') {
          return (
            <Button
              key={key}
              type="button"
              variant="outline"
              size="lg"
              onClick={onBackspace}
              disabled={disabled}
              className="h-16 min-h-[64px] text-xl font-semibold border-[#C7A35A]/30 hover:bg-[#C7A35A]/10 hover:border-[#C7A35A] active:bg-[#C7A35A]/20 transition-all"
            >
              <Delete className="h-6 w-6" />
            </Button>
          );
        }

        if (key === 'clear') {
          return (
            <Button
              key={key}
              type="button"
              variant="outline"
              size="lg"
              onClick={onClear}
              disabled={disabled}
              className="h-16 min-h-[64px] text-xl font-semibold border-red-300 hover:bg-red-50 hover:border-red-400 active:bg-red-100 text-red-600 transition-all"
            >
              <Eraser className="h-6 w-6" />
            </Button>
          );
        }

        return (
          <Button
            key={key}
            type="button"
            variant="outline"
            size="lg"
            onClick={() => onDigitPress(key)}
            disabled={disabled}
            className="h-16 min-h-[64px] text-3xl font-bold border-[#C7A35A]/30 hover:bg-[#C7A35A]/10 hover:border-[#C7A35A] active:bg-[#C7A35A]/20 transition-all text-[#0F3A2E]"
          >
            {key}
          </Button>
        );
      })}
    </div>
  );
}
