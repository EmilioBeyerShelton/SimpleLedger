// Platform detection + adapter selection. This is the one place that
// decides "which persistence backend are we on" — everything else
// (the store, the UI) codes against the shared PersistenceAdapter
// interface and never branches on platform itself.
import { Capacitor } from '@capacitor/core';
import type { PersistenceAdapter, Platform } from './types';

export function detectPlatform(): Platform {
  if (typeof window !== 'undefined' && window.electronLedger) return 'macos';
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios') return 'ios';
  return 'web';
}

let cached: PersistenceAdapter | null = null;

export async function getPersistenceAdapter(): Promise<PersistenceAdapter> {
  if (cached) return cached;
  const platform = detectPlatform();
  if (platform === 'macos') {
    const { ElectronPersistenceAdapter } = await import('./electron');
    cached = new ElectronPersistenceAdapter();
  } else if (platform === 'ios') {
    const { CapacitorPersistenceAdapter } = await import('./capacitor');
    cached = new CapacitorPersistenceAdapter();
  } else {
    const { WebPersistenceAdapter } = await import('./web');
    cached = new WebPersistenceAdapter();
  }
  return cached;
}

export type { PersistenceAdapter, FileLinkStatus, Platform, LoadResult } from './types';
