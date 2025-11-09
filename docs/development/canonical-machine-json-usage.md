# Canonical Machine JSON Adoption Review

This note captures the areas that still bypass the shared `serializeMachineToJSON` helper and therefore lose data that now exists in the canonical Machine JSON schema.

## Runtime executors (`MachineData`)

* File: `src/language/base-executor.ts`
* Issue: The `MachineData` interface only exposes `title`, `nodes` (with flat attributes) and `edges` (with `source`, `target`, `type`, `label`). The interface omits machine-level annotations/attributes, node annotations, nested node structure, edge metadata (`value`, `attributes`, multiplicities, ports, styles) and inferred dependencies.
* Impact: Every executor (`BaseExecutor`, `MachineExecutor`, `RailsExecutor`, etc.) operates on this truncated structure, so the runtime cannot observe annotations, metadata or dependency analysis results that the canonical serializer already produces.
* Opportunity: Expand `MachineData` so it reuses `MachineJSON`, `MachineNodeJSON`, and `MachineEdgeJSON` types. This will let runtime features leverage annotations, edge metadata and inferred dependency output without bespoke conversions.

## Playground conversions

* File: `src/components/CodeMirrorPlayground.tsx`
* Issue: `convertToMachineData` manually maps the Langium AST into `MachineData`, duplicating the logic that `serializeMachineToJSON` already handles. The manual mapper strips annotations, machine-level attributes, inferred dependencies and any future canonical fields.
* Opportunity: Replace the custom mapper with a call to `serializeMachineToJSON` (or the generator wrapper) and feed the resulting structure directly into the executor.

## Meta tool responses

* File: `src/language/meta-tool-manager.ts`
* Issue: `getMachineDefinition` reconstructs a JSON payload from the simplified `MachineData`. As a result, downstream consumers never receive canonical fields such as annotations, machine attributes, edge metadata or inferred dependencies.
* Opportunity: When returning JSON/DSL definitions, invoke `serializeMachineToJSON` (potentially caching the result) so the bridge exposes the full schema consistently.

## Test helpers

* Files: `test/scripts/test-with-env.ts`, `test/integration/runtime-visualization.test.ts`
* Issue: Each test defines its own `convertToMachineData` helper that mirrors the production shortcuts. These helpers omit canonical fields, making it harder to introduce richer runtime data without touching many locations.
* Opportunity: Share a single helper that simply calls `serializeMachineToJSON` so the tests evolve automatically alongside the serializer.

By consolidating every AST → JSON conversion on the canonical serializer we ensure new schema features (annotations, metadata, inferred dependencies, styling hints, etc.) flow to every consumer without bespoke plumbing.
