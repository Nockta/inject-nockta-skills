---
name: cost-shapes-architecture
description: Treat hosting, staffing, operational burden, licensing, and delivery time as first-class architecture constraints.
---

# Cost Shapes Architecture

## Doctrine

The technically strongest design is not automatically the correct design. Architecture must fit the organization that will build, pay for, operate, and support it.

## Apply This Skill When

- choosing platforms, managed services, commerce engines, databases, or deployment models
- proposing microservices, queues, search infrastructure, or multi-region systems
- writing estimates and technical proposals

## Rules

- Include engineering time and operational ownership in cost comparisons.
- Distinguish fixed, usage-based, and growth-sensitive costs.
- Account for vendor lock-in and migration cost.
- Prefer managed infrastructure when it removes work the team cannot justify owning.
- Do not hide cost assumptions behind vague scalability claims.

## Reject These Patterns

- selecting infrastructure only from benchmark performance
- ignoring the people required to operate a distributed design
- presenting a vendor as cheap without modeling realistic usage
- optimizing recurring spend by creating disproportionate maintenance cost

## Completion Criteria

- the chosen design has an explicit cost model
- operational ownership is realistic
- trade-offs are explained to technical and business stakeholders
