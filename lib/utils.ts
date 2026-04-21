import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind class names with deduplication of conflicting utilities.
 * Used as the shadcn-style `cn` helper across the codebase.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
