import type { InputHTMLAttributes } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

/** The one place the text-field look is defined. */
export function Input({ invalid, className = '', ...rest }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={[
        'w-full rounded-lg border bg-white text-sm outline-none transition',
        'focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20',
        'dark:bg-stone-900 dark:text-stone-100',
        invalid ? 'border-red-400 dark:border-red-500' : 'border-stone-300 dark:border-stone-700',
        className,
      ].join(' ')}
      {...rest}
    />
  )
}

export default Input
