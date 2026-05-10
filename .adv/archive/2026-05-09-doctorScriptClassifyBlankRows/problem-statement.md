# Problem Statement

The OpenCode session doctor currently treats blank assistant rows as repairable if their age exceeds a threshold. Age is not proof of orphanhood: long-lived idle OpenCode sessions can own old blank rows, and deleting those rows truncates active session histories.

The repair decision needs structural liveness evidence. Rows should only be deleted when their owning session has no live process evidence; live or in-flight sessions must be reported but preserved.