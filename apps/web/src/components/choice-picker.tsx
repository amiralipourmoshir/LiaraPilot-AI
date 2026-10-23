import { useState } from 'react';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown, Search, Plus } from 'lucide-react';
export type ChoiceOption = { value: string; label: string; description?: string };
export function ChoicePicker({
  label,
  id,
  value,
  onChange,
  options,
  placeholder = 'انتخاب کنید',
  allowCustom = false,
  disabled = false,
  required = false,
}: {
  label: string;
  id?: string;
  value: string;
  onChange: (v: string) => void;
  options: ChoiceOption[];
  placeholder?: string;
  allowCustom?: boolean;
  disabled?: boolean;
  required?: boolean;
}) {
  const [search, setSearch] = useState(''),
    [open, setOpen] = useState(false);
  const rows = options.filter((o) =>
    (o.label + ' ' + o.value).toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const all =
    value && !options.some((o) => o.value === value)
      ? [{ value, label: value }, ...options]
      : options;
  const custom = allowCustom && search.trim() && !options.some((o) => o.value === search.trim());
  return (
    <Select.Root
      dir="rtl"
      value={value}
      onValueChange={onChange}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch('');
      }}
      disabled={disabled}
      required={required}
    >
      <Select.Trigger className="agent-choice-trigger" id={id} aria-label={label}>
        <span>
          <small>{label}</small>
          <Select.Value placeholder={placeholder} />
        </span>
        <Select.Icon>
          <ChevronDown size={17} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="agent-choice-menu"
          position="popper"
          sideOffset={8}
          collisionPadding={16}
          align="start"
        >
          <div className="agent-choice-search">
            <Search size={17} />
            <input
              maxLength={100}
              aria-label={`جستجو در ${label}`}
              placeholder={allowCustom ? 'جستجو یا نوشتن انتخاب دلخواه…' : 'جستجو بین گزینه‌ها…'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Escape' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp')
                  e.stopPropagation();
              }}
            />
          </div>
          <Select.Viewport className="agent-choice-viewport">
            {(search ? rows : all).map((o) => (
              <Select.Item key={o.value} value={o.value} className="agent-choice-option">
                <span>
                  <Select.ItemText>{o.label}</Select.ItemText>
                  {o.description && <small>{o.description}</small>}
                </span>
                <Select.ItemIndicator>
                  <Check size={17} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
            {!rows.length && search && !custom && (
              <p className="agent-choice-empty">گزینه‌ای با این نام پیدا نشد.</p>
            )}
          </Select.Viewport>
          {custom && (
            <button
              type="button"
              className="agent-choice-custom"
              onClick={() => {
                onChange(search.trim());
                setOpen(false);
                setSearch('');
              }}
            >
              <Plus size={16} /> استفاده از «{search.trim()}»
            </button>
          )}
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
