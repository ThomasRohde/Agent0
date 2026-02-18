**Findings (website excluded)**

1. **High**: `patch` `"replace"` on arrays is implemented as insert, so it corrupts array shape.  
`packages/std/src/patch.ts:48` uses `arr.splice(idx, 0, value)` for array leaf writes, and `packages/std/src/patch.ts:106` routes `"replace"` through the same path.  
Repro I ran: replacing `/1` in `[1,2,3]` returned `[1,9,2,3]` (expected `[1,9,3]`).

2. **High**: `a0 check` misses self-referential `let` bindings (`let x = x`), which then fail at runtime.  
`packages/core/src/validator.ts:157` adds the binding before validating RHS at `packages/core/src/validator.ts:158`.  
Repro I ran: `check` returned success, `run` failed with `E_UNBOUND`.

3. **High**: `timeMs` budget can be bypassed by long work inside the final statement expression (including tool calls).  
Time budget is checked only at statement entry (`packages/core/src/evaluator.ts:249`), and `ReturnStmt` exits immediately after expression eval (`packages/core/src/evaluator.ts:279`).  
Repro I ran: `budget { timeMs: 10 }` with `do sh.exec` sleep inside `return { ... }` finished after ~948ms and exited `0` (no `E_BUDGET`).

4. **Medium**: `fn map { ... }` is allowed by validator but effectively uncallable due runtime precedence.  
Built-in `map` is hard-special-cased before user functions at `packages/core/src/evaluator.ts:521`; user fn dispatch starts later at `packages/core/src/evaluator.ts:596`.  
Validator does not block stdlib name collisions (`packages/core/src/validator.ts:133`, `packages/core/src/validator.ts:376`).  
Repro I ran: `check` passes, `run` fails with `E_TYPE` (`map 'in' must be a list`).

5. **Medium**: Rebinding via `expr -> name` is currently allowed, contradicting documented semantics.  
Docs say no reassignment at `packages/cli/src/help-content.ts:113`.  
Validator does not duplicate-check `ExprStmt.target` (`packages/core/src/validator.ts:160`, `packages/core/src/validator.ts:162`), and runtime overwrites with `env.set` (`packages/core/src/evaluator.ts:275`).  
Repro I ran: `let x = 1` then `2 -> x` passes and returns `x = 2`.

6. **Low (consistency)**: Help/docs drift from implementation.  
`packages/cli/src/help-content.ts:7` says `v0.3`, while repo version is `0.5.0` at `package.json:3`.  
`packages/cli/src/help-content.ts:124` says ints are arbitrary precision, but runtime numeric type is JS `number` (`packages/core/src/evaluator.ts:13`; parse at `packages/core/src/parser.ts:888`).  
`packages/cli/src/help-content.ts:255` and `packages/cli/src/help-content.ts:257` say `contains` coerces to string, but implementation requires string (`packages/std/src/predicates.ts:35`, `packages/std/src/predicates.ts:47`).  
`README.md:234` says `maxIterations` is per `for` loop, but runtime is cumulative across for/map (`packages/core/src/evaluator.ts:559`, `packages/core/src/evaluator.ts:669`).  
`README.md:245` omits `map_start`/`map_end`, which are emitted (`packages/core/src/evaluator.ts:30`).

7. **Low (testing gap)**: CLI/help surface is effectively untested.  
`packages/cli/package.json:14` defines tests, but there are no CLI test files under `packages/cli/src`, and `npm test` reported `0` tests for workspace `a0`.

**Open questions**

1. Should `timeMs` be a hard runtime limit (including mid-expression/tool), or statement-boundary best-effort?  
2. Should `->` rebinding be legal, or should it raise `E_DUP_BINDING` like `let` duplicates?  
3. Should `map` be reserved/un-overridable (validator error), or should user-defined `map` take precedence?

**Review coverage**

1. Ran full non-website build/test: `npm run build`, `npm test` (all passing; CLI had 0 tests).  
2. Ran `a0 check` across all `examples/*.a0` (all passed).  
3. Executed targeted repros for each issue above.  
4. No code changes made.