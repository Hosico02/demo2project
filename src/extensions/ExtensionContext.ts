import type { Capability } from '../security/capabilities/CapabilityScope.js';

export interface ExtensionContext {
  /** Capabilities the host has granted to this extension. */
  granted_capabilities: Capability[];
  /** System root path — extensions must NEVER assume they can write here. */
  system_root: string;
  /** Target project path, if any. */
  project_path?: string;
  /** Read-only access to the unified config. */
  config_snapshot: unknown;
}

export function hasCapability(ctx: ExtensionContext, c: Capability): boolean {
  return ctx.granted_capabilities.includes(c);
}
