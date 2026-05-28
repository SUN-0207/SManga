import { registerAdapter } from './registry.js';
import { truyenfullAdapter } from './sources/truyenfull/index.js';

registerAdapter(truyenfullAdapter);

export * from './registry.js';
export * from './fetcher.js';
export { truyenfullAdapter };
