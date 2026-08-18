/**
 * dsh-fold — HOST half.
 *
 * Deliberately minimal: all functionality lives in the browser half
 * (`src/client`). This row exists only as the bundle anchor so the profile
 * loader mounts the package and the client-modules scanner discovers the
 * `dsh.client.platform: "web"` manifest.
 */

export const name = 'fold'
export const inject: string[] = []

export function apply(_ctx: unknown): void {
  // Nothing to do host-side. Removing this plugin (or its row) unloads the
  // bundle; the browser half then restores the official tool-call UI.
}
