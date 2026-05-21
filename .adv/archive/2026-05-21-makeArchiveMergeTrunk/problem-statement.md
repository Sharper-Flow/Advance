# Problem: /adv-archive completes release without structurally proving shipment

`/adv-archive` and direct tool flows could write/archive a change and mark release complete while the change branch had not reached the default branch. A bundle on a change branch is not shipped. This created an operational gap where work could be archived, issue closure could run, and cleanup could proceed while trunk never received the implementation.

The desired end state is structural enforcement: archive/release finalization must verify direct-mode merge/push evidence or PR-mode handoff evidence before the change can be considered released.