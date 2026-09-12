import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function formatRelativeAge(iso: string, nowIso: string): string {
  const days = Math.max(0, Math.round((Date.parse(nowIso) - Date.parse(iso)) / 86_400_000));
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.round(days / 30)} mo ago`;
  return `${(days / 365).toFixed(1)} yr ago`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}
