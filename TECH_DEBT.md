# Current technical debt

This list contains verified current gaps, not completed work or architecture wish lists.

| Area | Current limitation | Sensible next step |
|---|---|---|
| Frontend regression coverage | The frontend has no automated test harness. Production TypeScript and Vite builds catch compilation/bundling failures but not browser behavior regressions. | Add focused tests when changing a user workflow; avoid a framework migration solely to satisfy a count. |
| Lint coverage | The configured workspace lint command runs the bot script only; backend and frontend expose no lint scripts. | Define package-local lint policies in a dedicated cleanup and then make CI coverage explicit. |
| Scheduler delivery | A claimed scheduled occurrence can be lost between the database update and Discord delivery; there is no exactly-once guarantee. | Specify retry/idempotency semantics before changing the claim or delivery protocol. |
| Multi-process bot operation | Checked-in deployments run one bot process; scheduler and interval work is not process-owned for replicas. | Keep one bot process or design guild-owned scheduling before adding shards/replicas. |
| Large route surfaces | Guild dashboard behavior remains concentrated in a large router with several domains. | Extract a domain only when a concrete change benefits from a tested boundary; file size alone is not a refactor requirement. |
| Token key rotation | OAuth tokens are encrypted at rest with one configured key and no key identifier/rotation workflow. | Design staged re-encryption and rollback before rotating a deployed key. |

Completed items that must not be reopened as debt: OAuth token encryption, Redis persistence in production Compose, memory limits and log rotation in standard production Compose, single-process non-overlapping scheduler polling, transactional/versioned migrations with checksums, and scheduler/status monitoring.
