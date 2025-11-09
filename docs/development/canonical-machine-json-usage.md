# Canonical Machine JSON Adoption Review

This note tracks adoption of the shared `serializeMachineToJSON` helper so every consumer receives the canonical Machine JSON schema.

## Runtime executors (`MachineData`)

* ✅ `MachineData` is now an alias of the canonical `MachineJSON` type so executors can access annotations, metadata, inferred dependencies and future schema additions without custom projections.
* Next: audit executor logic to take advantage of the richer data (e.g., annotations and metadata) now available at runtime.

## Playground conversions

* ✅ Playground AST → JSON conversion now calls `serializeMachineToJSON`, ensuring runtime previews and executions reuse the shared serializer.
* Next: monitor playground-specific extensions for opportunities to rely directly on canonical fields instead of bespoke metadata.

## Meta tool responses

* ✅ Meta tool responses clone the canonical machine state instead of rebuilding ad-hoc structures, so callers receive the complete schema.
* Next: extend update flows to recompute inferred data (dependencies, metadata) when mutations demand it.

## Test helpers

* ✅ Shared `convertAstToMachineData` and `cloneMachineData` helpers ensure tests exercise the canonical JSON structure without duplicating conversion logic.
* Next: migrate any remaining fixtures that hard-code truncated machine JSON to the shared helpers for consistency.

With AST → JSON conversion centralized on the canonical serializer, new schema features (annotations, metadata, inferred dependencies, styling hints, etc.) flow to every consumer without bespoke plumbing.
