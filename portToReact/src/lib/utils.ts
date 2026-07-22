import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn/ui's standard className combinator. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
