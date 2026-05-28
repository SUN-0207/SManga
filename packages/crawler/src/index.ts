import { registerAdapter } from './registry.ts';
import { truyenfullAdapter } from './sources/truyenfull/index.ts';

registerAdapter(truyenfullAdapter);

export * from './registry.ts';
export * from './fetcher.ts';
export * from './engine.ts';
export { truyenfullAdapter };
