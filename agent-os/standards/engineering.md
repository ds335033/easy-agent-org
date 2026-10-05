# Engineering standard

Use Node.js ES modules and explicit interfaces. Keep runtime dependencies small.
Use the native test runner for provider contracts, ownership, file containment,
task recovery, and HTTP behavior. Validate containers separately against Docker.

All changes must be reviewable on a feature branch. Checkpoints preserve a
recoverable project snapshot; running checks must not hide the task's diff.
Tool failures, cancellations and interrupted runs are distinct terminal states.
Use bounded responses, output limits, execution deadlines, and concurrency limits.

The UI uses charcoal, orange and white, visible keyboard focus, named inputs,
loading and empty states, and truthful runtime/integration status.
