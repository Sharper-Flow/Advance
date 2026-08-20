/**
 * Standalone summary-candidate classifier bundle entry point.
 *
 * The classifier is implemented by the storage projection reader. This module
 * only exposes that implementation to generated CLI consumers.
 */

export { classifySummaryCandidates } from "./storage/change-projection-reader";
export type {
  SummaryCandidateClassification,
  SummaryCandidateExclusion,
} from "./storage/change-projection-reader";
