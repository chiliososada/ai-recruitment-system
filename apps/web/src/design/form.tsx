import * as RCheckbox from '@radix-ui/react-checkbox';
import * as RSwitch from '@radix-ui/react-switch';
import { Check } from 'lucide-react';
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { forwardRef } from 'react';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input(props, ref) {
    return <input ref={ref} {...props} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea(props, ref) {
  return <textarea ref={ref} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select(props, ref) {
    return <select ref={ref} {...props} />;
  },
);

export interface FormFieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}

export function FormField({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
}: FormFieldProps): JSX.Element {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>
        {label}
        {required ? (
          <span aria-hidden="true" style={{ color: 'var(--color-danger)' }}>
            {' '}
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint ? (
        <div id={`${htmlFor}-hint`} className="muted" style={{ fontSize: 'var(--text-sm)' }}>
          {hint}
        </div>
      ) : null}
      {error ? (
        <div id={`${htmlFor}-error`} className="ui-field-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

/** Convenience text field that wires id, aria-invalid and aria-describedby automatically. */
export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  error?: string;
  hint?: string;
}

export function TextField({
  id,
  label,
  error,
  hint,
  required,
  ...input
}: TextFieldProps): JSX.Element {
  const describedBy =
    [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <FormField label={label} htmlFor={id} error={error} hint={hint} required={required}>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        required={required}
        {...input}
      />
    </FormField>
  );
}

export function Switch({
  id,
  checked,
  onCheckedChange,
  label,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label?: string;
}): JSX.Element {
  return (
    <span className="row">
      <RSwitch.Root
        id={id}
        className="ui-switch"
        checked={checked}
        onCheckedChange={onCheckedChange}
      >
        <RSwitch.Thumb className="ui-switch-thumb" />
      </RSwitch.Root>
      {label ? (
        <label htmlFor={id} style={{ margin: 0 }}>
          {label}
        </label>
      ) : null}
    </span>
  );
}

export function Checkbox({
  id,
  checked,
  onCheckedChange,
  label,
  'aria-label': ariaLabel,
}: {
  id?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label?: string;
  'aria-label'?: string;
}): JSX.Element {
  return (
    <span className="row">
      <RCheckbox.Root
        id={id}
        className="ui-checkbox"
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        aria-label={ariaLabel}
      >
        <RCheckbox.Indicator>
          <Check size={14} aria-hidden="true" />
        </RCheckbox.Indicator>
      </RCheckbox.Root>
      {label ? (
        <label htmlFor={id} style={{ margin: 0 }}>
          {label}
        </label>
      ) : null}
    </span>
  );
}
