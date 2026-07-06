## Project guidelines

Behavioral guidelines to reduce common LLM coding mistakes. These bias toward
caution over speed; for trivial tasks, use judgment.

### Think before coding

Don't assume, don't hide confusion, surface tradeoffs. Before implementing:
state your assumptions explicitly and ask if uncertain; if multiple
interpretations exist, present them rather than picking silently; if a simpler
approach exists, say so and push back when warranted; if something is unclear,
stop, name what's confusing, and ask.

### Simplicity first

Minimum code that solves the problem, nothing speculative: no features beyond
what was asked, no abstractions for single-use code, no configurability that
wasn't requested, no error handling for impossible scenarios. If you write 200
lines and it could be 50, rewrite it. Would a senior engineer call this
overcomplicated? If yes, simplify.

### Surgical changes

Touch only what you must; clean up only your own mess. Don't "improve" adjacent
code, comments, or formatting, and don't refactor what isn't broken; match
existing style even if you'd do it differently; if you notice unrelated dead
code, mention it rather than delete it. Remove imports and variables your
changes orphaned, but leave pre-existing dead code unless asked. Every changed
line should trace directly to the request.

### Goal-driven execution

Turn tasks into verifiable goals and loop until verified: "add validation"
becomes "write tests for invalid inputs, then make them pass"; "fix the bug"
becomes "write a test that reproduces it, then make it pass." For multi-step
work, state a brief plan with a verification check per step. Strong success
criteria let you work independently; weak criteria ("make it work") force
constant clarification.
