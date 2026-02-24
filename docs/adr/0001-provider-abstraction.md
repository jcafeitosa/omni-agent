# ADR-0001: Unified Provider Abstraction

## Status
Accepted

## Context
Omni Agent integrates many model vendors with different capabilities and auth patterns.

## Decision
Use a common `Provider` contract with standardized methods for generation, embeddings, limits, and optional model listing.

## Consequences
- Easier provider swapping and fallback routing.
- Consistent loop behavior across vendors.
- Requires adapter maintenance when upstream SDKs evolve.
