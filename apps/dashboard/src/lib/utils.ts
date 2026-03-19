import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTime(dateString: string): string {
  if (!dateString) return "Just now";
  return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
