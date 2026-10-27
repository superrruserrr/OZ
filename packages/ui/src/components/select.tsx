import * as RadixSelect from '@radix-ui/react-select';
import { cn } from '../lib/cn.js';
import { controlClassName, FieldShell } from './field-shell.js';

export interface SelectOption {
  value: string;
  /** Libellé déjà traduit. */
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  id: string;
  label: string;
  options: readonly SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string | null;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  'data-testid'?: string;
  className?: string;
}

function Chevron() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4 shrink-0">
      <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function Check() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
      <path d="m3.5 8.5 3 3 6-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

/** Sélecteur (Radix Select) habillé comme le champ : clavier, lecteurs d'écran, liste en portail. */
export function Select({
  id,
  label,
  options,
  placeholder,
  hint,
  error,
  className,
  'data-testid': testId,
  ...root
}: SelectProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      {({ describedBy, invalid }) => (
        <RadixSelect.Root {...root}>
          <RadixSelect.Trigger
            id={id}
            className={cn(
              controlClassName,
              'flex items-center justify-between gap-3 text-left data-placeholder:text-oz-text-muted',
              className,
            )}
            {...(testId ? { 'data-testid': testId } : {})}
            {...(describedBy ? { 'aria-describedby': describedBy } : {})}
            {...(invalid ? { 'aria-invalid': true } : {})}
          >
            <RadixSelect.Value {...(placeholder ? { placeholder } : {})} />
            <RadixSelect.Icon className="text-oz-text-muted">
              <Chevron />
            </RadixSelect.Icon>
          </RadixSelect.Trigger>
          <RadixSelect.Portal>
            <RadixSelect.Content
              position="popper"
              sideOffset={6}
              className="z-50 max-h-(--radix-select-content-available-height) w-(--radix-select-trigger-width) overflow-hidden rounded-xl border border-oz-border bg-oz-surface-2 p-1"
            >
              <RadixSelect.Viewport>
                {options.map((option) => (
                  <RadixSelect.Item
                    key={option.value}
                    value={option.value}
                    {...(option.disabled ? { disabled: true } : {})}
                    className="relative flex h-10 cursor-default items-center rounded-lg pr-3 pl-9 text-oz-text outline-none select-none data-disabled:text-oz-text-disabled data-highlighted:bg-oz-surface-input"
                  >
                    <RadixSelect.ItemIndicator className="absolute left-3 text-oz-primary">
                      <Check />
                    </RadixSelect.ItemIndicator>
                    <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                  </RadixSelect.Item>
                ))}
              </RadixSelect.Viewport>
            </RadixSelect.Content>
          </RadixSelect.Portal>
        </RadixSelect.Root>
      )}
    </FieldShell>
  );
}
