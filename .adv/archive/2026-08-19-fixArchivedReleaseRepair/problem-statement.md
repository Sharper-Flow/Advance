## Confirmed Problem

A shipped change can be moved into the archive bundle before its release gate is durably represented there. The existing-bundle retry proves the PR merge but still writes only through the deleted active-change path, so archive readback remains `release=pending` forever.

## Root Cause Analysis

`completeReleaseGateAfterFinalization` hardcodes `store.paths.changes` for load, coordinated mutation, and verification. `existingBundlePath` is accepted but not used as mutation authority. After active state retirement, no projection exists at the expected active location. The archived bundle remains the only durable projection, yet no supported mutation path updates it and its derived files.

## Success Signal

Given a terminal archive bundle with release pending and canonical shipped PR proof, retry completes release in that archive bundle, regenerates its derived files consistently, returns success, and reads back all seven gates done without recreating active state.