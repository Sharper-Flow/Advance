// T3/T7 ambient declaration for @opencode-ai/sdk.
//
// Resolves transitive type imports used by the relocated worktree
// plugin code (plugin/src/tools/worktree/) when the SDK is not a
// direct dep of the ADV plugin. The shape is intentionally permissive
// so the relocation phase compiles; behavioral rewrites in T9/T10/T12
// will tighten typing as those flows mature.
declare module "@opencode-ai/sdk" {
	// Minimal surface used by the relocated worktree code. The real SDK
	// returns a richer client; we only need the shape callers actually
	// reach into during relocation. Permissive `any` is intentional —
	// behavioral rewrites (T9/T10/T12) tighten typing as those flows
	// mature and the SDK becomes a direct ADV dep.
	export interface OpencodeClientLike {
		app: {
			log: (args: { body: { service: string; level: string; message: string } }) => Promise<unknown>
			[key: string]: any
		}
		session: {
			list: (...args: any[]) => any
			[key: string]: any
		}
		[key: string]: any
	}
	export function createOpencodeClient(...args: unknown[]): OpencodeClientLike
	// Event payload used by hooks dispatch and ADV index.ts.
	export type Event = {
		type: string
		properties: Record<string, any>
		[key: string]: any
	}
}
