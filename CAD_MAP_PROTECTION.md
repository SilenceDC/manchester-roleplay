# CAD MAP PROTECTION — TEXAS STATE ROLEPLAY

**Status: OWNER-PROTECTED / DO NOT MODIFY WITHOUT EXPLICIT OWNER APPROVAL**

This document is a mandatory project rule for every developer, contributor, automation, and AI assistant working in this repository.

## Absolute rule

Do not change, replace, recalibrate, restyle, resize, reposition, or otherwise modify the CAD map or its coordinate/rendering system unless the project owner explicitly authorizes that specific map change.

If a requested task appears to require touching a protected map component, stop and ask the owner first. Do not make a best-guess adjustment, workaround, offset, or "small cleanup" to the map.

## Protected components

The following are protected:

- Map image assets, tiles, tile selection, zoom levels, and map data sources.
- The Fall 2026 map dataset and its coordinate reference assumptions.
- The verified API coordinate conversion formula.
- `worldPoint()` and its map coordinate conversion behavior.
- The `/128` map scaling divisor in the map rendering path.
- `MAP_BACKGROUND_OFFSET_X` and `MAP_BACKGROUND_OFFSET_Y` (both must remain `0`).
- The map image CSS transform (must remain `translate(0px,0px)`).
- Map dimensions, aspect ratio, scale, alignment, bounds, and positioning.
- Postal/map marker geometry and any code whose purpose is to recalibrate the map background or coordinate plane.

## Verified production baseline — do not alter

The current map uses the Fall 2026 z0 tile at 1000px. Its tile coverage is 128,000 map pixels while the map content is 120,000px wide. The verified rendering divisor is therefore `128`, not `120`.

Required baseline:

- Both map-axis divisions in `worldPoint()` use `/128`.
- `MAP_BACKGROUND_OFFSET_X = 0`.
- `MAP_BACKGROUND_OFFSET_Y = 0`.
- Map image transform remains `translate(0px,0px)`.
- Do not introduce offsets, fudge factors, or single-location calibration patches.
- Do not change the verified API coordinate conversion formula.

For alignment checks, use exact ATM and bus-stop world positions. Postal labels are approximate and must not be used as precision calibration points.

## Work that remains allowed

Work may continue on unrelated CAD and application functionality, including:

- Call creation, dispatch workflows, and call metadata.
- Typed postal lookup and call-location resolution.
- Unit registration, status, and non-map workflow logic.
- Authentication, APIs, database logic, moderation, and other site features.
- CAD interface elements that do not alter the protected map, its dimensions, rendering, coordinates, or alignment.

Even when working on an allowed feature, do not change protected map code as a side effect.

## Required checks before committing or deploying

1. Review the diff for any changes to protected files, functions, constants, CSS, map assets, or map data.
2. If a protected component changed, do not commit or deploy it without explicit owner approval.
3. Preserve all verified CAD fixes, including player positioning and typed-postal call positioning.
4. Never deploy stale `main` over a newer working production version. Synchronize and verify the production fixes in source before deploying from `main`.
5. Verify live CAD behavior after an authorized deployment; a successful deployment alone is not proof of correct behavior.

## Authorization

Only explicit, direct approval from the project owner for the specific proposed map change overrides this protection rule. General requests to improve, fix, refactor, or deploy the CAD do not grant permission to modify the map.

When in doubt: leave the map untouched and ask first.
