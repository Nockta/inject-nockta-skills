---
name: right-size-the-system
description: Choose architecture, data access, concurrency, and infrastructure for the known load and credible growth path rather than imaginary hyperscale or demo-scale assumptions.
---

# Right Size the System

## Doctrine

Do not over-distribute a system that needs delivery speed, and do not ignore known concurrency, isolation, or throughput requirements. Design for evidence-backed scale.

## Apply This Skill When

- sizing services, databases, queues, realtime gateways, or search systems
- choosing between modular monoliths and distributed services
- estimating infrastructure or performance requirements

## Rules

- State expected users, request rates, data volume, concurrency, and latency needs.
- Identify the first likely bottleneck.
- Prefer simple architecture with a clear scaling path.
- Separate independently scalable workloads only when useful.
- Measure before performing speculative optimization.

## Reject These Patterns

- claiming microservices are required because the product may grow
- ignoring a known high-volume export, search, or realtime workload
- optimizing low-risk code while leaving unbounded queries or fan-out
- using average traffic to dismiss burst behavior

## Completion Criteria

- assumptions are quantified
- the design handles the credible workload
- the next scaling step is identifiable without redesigning everything
