/**
 * Storage Module Exports
 */

export { createStore, type Store, type SearchResult } from "./store";
export {
  loadProjectConfig,
  saveProjectConfig,
  loadSpec,
  saveSpec,
  loadAllSpecs,
  loadChange,
  saveChange,
  loadAllChanges,
  createChangeScaffold,
  getProjectPaths,
  resolveChangeId,
  type ProjectPaths,
} from "./json";
