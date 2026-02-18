**Findings**  

1. **High**: `a0 run --trace <path>` can hard-crash on invalid/uncreatable trace paths instead of returning structured CLI error output.  
`packages/cli/src/cmd-run.ts:75`, `packages/cli/src/cmd-run.ts:76`, `packages/cli/src/cmd-run.ts:87`  
Repro: `node packages/cli/dist/main.js run examples/hello.a0 --trace no_such_dir/trace.jsonl` -> uncaught `ENOENT`, exit `1`.

2. **High**: Help docs describe a policy `deny` list, but runtime policy enforcement ignores `deny` entirely and uses only `allow`. This is a security/expectation mismatch.  
`packages/cli/src/help-content.ts:357`, `packages/core/src/capabilities.ts:11`, `packages/core/src/capabilities.ts:58`, `packages/core/src/capabilities.ts:79`  
Quick proof: `buildAllowedCaps({allow:["sh.exec"],deny:["sh.exec"]}, false)` still allows `sh.exec`.

3. **Medium**: Help stdlib reference is materially out of sync with implementation/tests (multiple signatures/semantics).  
Examples:  
`packages/cli/src/help-content.ts:282`, `packages/cli/src/help-content.ts:285`, `packages/cli/src/help-content.ts:288`, `packages/cli/src/help-content.ts:291`, `packages/cli/src/help-content.ts:295`, `packages/cli/src/help-content.ts:315`, `packages/cli/src/help-content.ts:319`, `packages/cli/src/help-content.ts:254`  
vs code/tests:  
`packages/std/src/list-ops.ts:58`, `packages/std/src/list-ops.ts:94`, `packages/std/src/list-ops.ts:116`, `packages/std/src/list-ops.ts:143`, `packages/std/src/list-ops.ts:144`, `packages/std/src/list-ops.ts:165`, `packages/std/src/string-ops.ts:49`, `packages/std/src/string-ops.ts:79`, `packages/std/src/predicates.ts:35`, `packages/std/src/stdlib.test.ts:379`, `packages/std/src/stdlib.test.ts:400`, `packages/std/src/stdlib.test.ts:419`, `packages/std/src/stdlib.test.ts:444`, `packages/std/src/stdlib.test.ts:483`, `packages/std/src/stdlib.test.ts:500`.

4. **Medium**: Help says `match expr ...`, but grammar only permits `match <identPath> ...`.  
`packages/cli/src/help-content.ts:40`, `packages/cli/src/help-content.ts:92`, `packages/cli/src/help-content.ts:453`, `packages/core/src/parser.ts:263`  
Repro from stdin with `match { ok: 1 } ...` returns `E_PARSE` (expected `Ident`, found `{`).

5. **Medium**: Arrow-binding accepts dotted targets syntactically, but runtime/validator only use the first segment. README examples use dotted targets, which silently do something different than they suggest.  
`packages/core/src/parser.ts:123`, `packages/core/src/evaluator.ts:270`, `packages/core/src/validator.ts:162`, `README.md:93`, `README.md:94`  
Observed behavior: `... -> ev.status` binds `ev`, not `ev.status`.

6. **Low**: `clean` scripts are not Windows-compatible (`rm -rf`) and fail in this environment.  
`packages/core/package.json:10`, `packages/std/package.json:10`, `packages/tools/package.json:10`, `packages/cli/package.json:13`  
Repro: `npm run clean -w packages/core` -> `'rm' is not recognized`.

7. **Low**: `a0 check --json` is effectively dead surface area; option is declared but not consumed, and CLI package has no tests.  
`packages/cli/src/main.ts:29`, `packages/cli/src/main.ts:30`, `packages/cli/src/cmd-check.ts:9`, `packages/cli/src/cmd-check.ts:37`, `packages/cli/src/cmd-check.ts:40`, `packages/cli/package.json:14`  
`npm test` currently reports `0` tests for `a0` (CLI workspace).

**Open Questions / Assumptions**

1. Should docs align to current stdlib behavior, or should stdlib be changed to match documented signatures?  YES!
2. Should `match` accept full expressions as documented, or should docs be narrowed to identifier paths?  YES!
3. Should `expr -> target` support nested targets (`a.b`) semantically, or should parser restrict target to a bare identifier? Nested!
