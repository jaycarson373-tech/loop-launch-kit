import { env } from 'cloudflare:workers';
import type { LoopEnv } from './env';

export function platformRuntime(): LoopEnv {
  // This adapter is selected only by the Sites build, behind its trusted dispatcher.
  return { ...env, AUTH_MODE: 'sites' } as unknown as LoopEnv;
}
