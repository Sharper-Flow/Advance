ADV lacks a frontend-focused worker. UI/component work currently routes through general `adv-engineer`, so frontend quality, component ownership, and delegation boundaries are less explicit than backend/implementation work.

Desired outcome: add `adv-designer` as a specialist sub-agent for frontend design and HTML/CSS/JS/component work, with ADV routing it for frontend files, visual quality, design review, and mixed UI/backend work where UI concerns are separable from backend/state/API logic.

Constraints: `adv-designer` must not own backend logic; implementation must extend the `addDelegationMatrix` source-plane model and follow its contract rather than adding independent prompt-only routing prose.