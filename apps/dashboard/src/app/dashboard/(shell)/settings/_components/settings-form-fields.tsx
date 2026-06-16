import type { ComponentProps } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/ui/cn"
import { settingsSelectClassName } from "./settings-form-styles"

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <span className="block text-xs font-semibold text-foreground/60">
      {label}
      {hint && <span className="ml-1.5 font-normal text-foreground/30">· {hint}</span>}
    </span>
  )
}

const SETTINGS_INPUT_CLASS =
  "h-9 text-sm bg-foreground/[0.06] border-foreground/[0.12] text-foreground/80 placeholder:text-foreground/25"

type LabeledTextInputProps = Omit<ComponentProps<"input">, "className"> & {
  label: string
  hint?: string
  description?: string
  wrapperClassName?: string
  inputClassName?: string
  inputWidthClassName?: string
}

export function LabeledTextInput({
  label,
  hint,
  description,
  wrapperClassName,
  inputClassName,
  inputWidthClassName,
  ...inputProps
}: LabeledTextInputProps) {
  return (
    <div className={cn("space-y-1.5", wrapperClassName)}>
      <FieldLabel label={label} hint={hint} />
      <div className={inputWidthClassName}>
        <Input {...inputProps} className={cn(SETTINGS_INPUT_CLASS, inputClassName)} />
      </div>
      {description && <p className="text-xs text-foreground/30">{description}</p>}
    </div>
  )
}

type ControlledNumberInputProps = Omit<ComponentProps<"input">, "className" | "onChange" | "value"> & {
  label: string
  hint?: string
  description?: string
  value: string
  onValueChange: (value: string) => void
  wrapperClassName?: string
  inputClassName?: string
  inputWidthClassName?: string
  integerOnly?: boolean
}

export function NumberInput({
  label,
  hint,
  description,
  value,
  onValueChange,
  wrapperClassName,
  inputClassName,
  inputWidthClassName = "w-32",
  integerOnly = true,
  ...inputProps
}: ControlledNumberInputProps) {
  return (
    <div className={cn("space-y-1.5", wrapperClassName)}>
      <FieldLabel label={label} hint={hint} />
      <div className={inputWidthClassName}>
        <Input
          {...inputProps}
          type="number"
          value={value}
          onChange={event => onValueChange(event.target.value.replace(integerOnly ? /[^0-9]/g : /[^0-9.]/g, ""))}
          className={cn(SETTINGS_INPUT_CLASS, inputClassName)}
        />
      </div>
      {description && <p className="text-xs text-foreground/30">{description}</p>}
    </div>
  )
}

type MoneyInputProps = Omit<ComponentProps<"input">, "className" | "onChange" | "value"> & {
  label: string
  hint?: string
  description?: string
  value: string
  onValueChange: (value: string) => void
  wrapperClassName?: string
  inputClassName?: string
  inputWidthClassName?: string
}

export function MoneyInput({
  label,
  hint,
  description,
  value,
  onValueChange,
  wrapperClassName,
  inputClassName,
  inputWidthClassName = "w-48",
  ...inputProps
}: MoneyInputProps) {
  return (
    <div className={cn("space-y-1.5", wrapperClassName)}>
      <FieldLabel label={label} hint={hint} />
      <div className={cn("relative", inputWidthClassName)}>
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground/30">$</span>
        <Input
          {...inputProps}
          value={value}
          onChange={event => onValueChange(event.target.value.replace(/[^0-9.]/g, ""))}
          className={cn(SETTINGS_INPUT_CLASS, "pl-7", inputClassName)}
        />
      </div>
      {description && <p className="text-xs text-foreground/30">{description}</p>}
    </div>
  )
}

interface SelectOption<TValue extends string> {
  value: TValue
  label: string
}

export function SelectField<TValue extends string>({
  label,
  hint,
  description,
  value,
  onChange,
  options,
  ariaLabel,
  wrapperClassName,
  selectClassName,
  widthClassName = "w-56",
}: {
  label: string
  hint?: string
  description?: string
  value: TValue
  onChange: (value: TValue) => void
  options: readonly SelectOption<TValue>[]
  ariaLabel?: string
  wrapperClassName?: string
  selectClassName?: string
  widthClassName?: string
}) {
  return (
    <div className={cn("space-y-1.5", wrapperClassName)}>
      <FieldLabel label={label} hint={hint} />
      <select
        aria-label={ariaLabel ?? label}
        value={value}
        onChange={event => onChange(event.target.value as TValue)}
        className={settingsSelectClassName(widthClassName, selectClassName)}
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {description && <p className="text-xs text-foreground/30">{description}</p>}
    </div>
  )
}

type CharacterCountTextareaProps = Omit<ComponentProps<"textarea">, "className" | "onChange" | "value" | "maxLength"> & {
  label?: string
  hint?: string
  value: string
  onValueChange: (value: string) => void
  maxLength: number
  wrapperClassName?: string
  textareaClassName?: string
}

export function CharacterCountTextarea({
  label,
  hint,
  value,
  onValueChange,
  maxLength,
  wrapperClassName,
  textareaClassName,
  ...textareaProps
}: CharacterCountTextareaProps) {
  return (
    <div className={cn("space-y-1.5", wrapperClassName)}>
      {label && <FieldLabel label={label} hint={hint} />}
      <Textarea
        {...textareaProps}
        value={value}
        onChange={event => onValueChange(event.target.value)}
        maxLength={maxLength}
        className={textareaClassName}
      />
      <p className="text-xs text-foreground/30 text-right">{value.length}/{maxLength}</p>
    </div>
  )
}
