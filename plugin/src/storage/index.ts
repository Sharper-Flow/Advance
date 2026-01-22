/**
 * Storage Module Exports
 */

export { createStore, type Store, type SearchResult } from "./store";
export { createSQLiteStore, type SQLiteStore } from "./sqlite";
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
  type ProjectPaths,
} from "./json";
