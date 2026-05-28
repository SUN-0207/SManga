import { AdapterNotFoundError, type SourceAdapter } from '@smanga/shared';

const adapters = new Map<string, SourceAdapter>();
const hostnameIndex = new Map<string, string>();

export function registerAdapter(adapter: SourceAdapter): void {
  adapters.set(adapter.id, adapter);
  for (const host of adapter.hostnames) {
    hostnameIndex.set(host.toLowerCase(), adapter.id);
  }
}

export function getAdapter(id: string): SourceAdapter {
  const a = adapters.get(id);
  if (!a) throw new AdapterNotFoundError(`no adapter registered for id=${id}`);
  return a;
}

export function resolveAdapterForUrl(url: string): SourceAdapter {
  const host = new URL(url).hostname.toLowerCase();
  const id = hostnameIndex.get(host);
  if (!id) throw new AdapterNotFoundError(`no adapter registered for hostname=${host}`);
  return getAdapter(id);
}

export function listAdapters(): SourceAdapter[] {
  return Array.from(adapters.values());
}

export function _resetForTests(): void {
  adapters.clear();
  hostnameIndex.clear();
}
