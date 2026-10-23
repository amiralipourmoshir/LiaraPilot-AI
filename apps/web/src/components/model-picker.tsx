import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
export type ChatModelOption = { id: string; label: string; description?: string };
export function ChatGptMark() {
  return <span className="chatgpt-mark" aria-hidden="true" />;
}
export function ModelPicker({
  value,
  models,
  disabled,
  onChange,
}: {
  value: string;
  models: ChatModelOption[];
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  return (
    <Select.Root
      dir="rtl"
      value={value}
      onValueChange={onChange}
      disabled={disabled || !models.length}
    >
      <Select.Trigger className="chat-model-picker" aria-label="انتخاب مدل گفتگو">
        <ChatGptMark />
        <span dir="ltr">
          <Select.Value placeholder="انتخاب مدل" />
        </span>
        <Select.Icon>
          <ChevronDown size={13} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="chat-model-menu"
          position="popper"
          side="top"
          align="start"
          sideOffset={10}
          collisionPadding={12}
        >
          <Select.Viewport>
            {models.map((model) => (
              <Select.Item className="chat-model-option" key={model.id} value={model.id}>
                <ChatGptMark />
                <span>
                  <Select.ItemText>
                    <span dir="ltr">{model.label}</span>
                  </Select.ItemText>
                  {model.description && (
                    <span className="chat-model-description">{model.description}</span>
                  )}
                </span>
                <Select.ItemIndicator className="chat-model-selected">
                  <Check size={16} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
