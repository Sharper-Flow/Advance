/**
 * Change tools barrel.
 *
 * Handler implementations live in focused modules; this file preserves the
 * public changeTools surface and export compatibility.
 */
import { archiveChangeTools } from "./change/handlers-archive";
import { lifecycleChangeTools } from "./change/handlers-lifecycle";
import { queryChangeTools } from "./change/handlers-query";
import { miscChangeTools } from "./change/handlers-misc";

// Keep routine-read guard boundaries discoverable in this barrel. The actual
// handler implementations remain in handlers-query.ts.
// adv_change_list: {
//   execute: queryChangeTools.adv_change_list.execute,
// },
// adv_change_show: {
//   execute: queryChangeTools.adv_change_show.execute,
// },
// adv_change_create: {

export const changeTools = {
  adv_change_list: queryChangeTools.adv_change_list,
  adv_change_show: queryChangeTools.adv_change_show,
  adv_change_create: lifecycleChangeTools.adv_change_create,
  adv_change_update: lifecycleChangeTools.adv_change_update,
  adv_change_close: lifecycleChangeTools.adv_change_close,
  adv_change_archive: archiveChangeTools.adv_change_archive,
  adv_change_reenter: miscChangeTools.adv_change_reenter,
};

export { CHANGE_VALIDATE_CONTEXT_TIMEOUT_MS } from "./change/helpers";
export { saveRecoveredArchiveConvergence } from "./change/helpers";
export type {
  ArchiveConvergenceRefusalCode,
  SaveRecoveredArchiveConvergenceResult,
} from "./change/helpers";
export {
  readArtifact,
  readArtifacts,
  loadProposalForContext,
} from "./change/artifacts";
export { closeLinkedIssue } from "./change/recovery";
