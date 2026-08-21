'use client';

import { useI18n } from '@/lib/i18n-context';
import { ReactNode } from 'react';

interface TTextProps {
  children?: ReactNode;
  className?: string;
  as?: keyof JSX.IntrinsicElements;
  [key: string]: any;
}

/**
 * TText - A component that automatically translates its content
 * Usage: <TText>btn.save</TText> or <TText>login.title</TText>
 */
export function TText({ children, className, as: Component = 'span', ...props }: TTextProps) {
  const { t, language } = useI18n();

  // If children is a string, try to translate it
  const content = typeof children === 'string' ? t(children) : children;

  return (
    <Component
      className={className}
      dir={language === 'ar' ? 'rtl' : 'ltr'}
      {...props}
    >
      {content}
    </Component>
  );
}

/**
 * TButton - A button component with automatic translation
 * Usage: <TButton>btn.save</TButton> or <TButton tKey="btn.save">Save</TButton>
 */
interface TButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tKey?: string;
  children?: ReactNode;
}

export function TButton({ tKey, children, ...props }: TButtonProps) {
  const { t } = useI18n();

  const content = tKey ? t(tKey) : (typeof children === 'string' ? t(children) : children);

  return (
    <button {...props}>
      {content}
    </button>
  );
}

/**
 * TLabel - A label component with automatic translation
 */
interface TLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  tKey?: string;
  children?: ReactNode;
}

export function TLabel({ tKey, children, ...props }: TLabelProps) {
  const { t } = useI18n();

  const content = tKey ? t(tKey) : (typeof children === 'string' ? t(children) : children);

  return (
    <label {...props}>
      {content}
    </label>
  );
}
