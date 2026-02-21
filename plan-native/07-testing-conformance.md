# 07 - Testing and Conformance Strategy

## Overview

The Go/WASM port must produce **bit-identical behavior** to the TypeScript reference implementation for all valid A0 programs. This document defines the testing strategy: the layers of testing, the conformance test suite that gates releases, Go-specific test tooling, and the cross-compilation verification matrix.

The TypeScript implementation currently has ~125 end-to-end scenario tests, per-module unit test suites (lexer, parser, validator, evaluator, formatter, diagnostics, capabilities, trace), golden tests for formatter idempotence and trace output, and stdlib/tools unit tests. The Go port must pass all of these plus Go-specific tests for concurrency, memory, and WASM bridging.

---

## 1. Test Layers

### 1.1 Unit Tests (per module)

Each Go package gets its own `*_test.go` file using the standard `testing` package. These mirror the TypeScript unit tests but are idiomatic Go.

| Module | What to test | Reference TS file |
|--------|-------------|-------------------|
| `lexer` | Token sequences for keywords, identifiers, literals (int, float, string), punctuation, comments, whitespace skipping, error tokens, edge cases (empty input, `call?` as single token, keyword prefixes like `capital`) | `core/src/lexer.test.ts` |
| `parser` | AST node shapes for all statement/expression types: `return`, `let`, `cap`, `call?`/`do`, `assert`/`check`, lists, records, `if`/`else`, `for`, `fn`, `match`, `try`/`catch`, `filter`, `loop`, arithmetic, spread, imports, comments. Parse error diagnostics with correct codes. | `core/src/parser.test.ts` |
| `validator` | All diagnostic codes: `E_NO_RETURN`, `E_RETURN_NOT_LAST`, `E_UNKNOWN_CAP`, `E_DUP_BINDING`, `E_UNBOUND`, `E_CALL_EFFECT`, `E_UNDECLARED_CAP`, `E_CAP_VALUE`, `E_IMPORT_UNSUPPORTED`, `E_UNKNOWN_BUDGET`, `E_FN_DUP`. Scoped binding validation for `fn`/`for`/`match`/`if-block`/`try-catch`/`filter-block`/`loop`. | `core/src/validator.test.ts` |
| `evaluator` | Simple returns, let bindings, string/list/record literals, stdlib calls, tool calls (`call?`/`do`), `assert`/`check` evidence, expression targets (`->`), `for` loops, `fn` definitions and closures, `match` arms, `if`/`else` blocks, `try`/`catch`, arithmetic operators, comparisons, `filter`/`loop`, budgets, capability enforcement. | `core/src/evaluator.test.ts` |
| `formatter` | Roundtrip: parse -> format -> parse produces identical AST. Idempotence: format(format(x)) == format(x). Known formatting fixtures. | `core/src/formatter.test.ts` |
| `diagnostics` | `makeDiag` field population, JSON formatting, pretty-print formatting with/without spans and hints. | `core/src/diagnostics.test.ts` |
| `capabilities` | Policy loading precedence (project -> user -> deny-all), `buildAllowedCaps`, `--unsafe-allow-all` override. | `core/src/capabilities.test.ts`, `capabilities.golden.test.ts` |
| `trace` | Event sequence verification, non-deterministic field sanitization, tool call enrichment. | `core/src/trace.golden.test.ts` |
| `stdlib` | Each function: `parse.json`, `get`, `put`, `patch`, `len`, `append`, `concat`, `sort`, `filter`, `find`, `range`, `join`, `unique`, `pluck`, `flat`, `keys`, `values`, `merge`, `entries`, `str.concat`, `str.split`, `str.starts`, `str.ends`, `str.replace`, `str.template`, `math.max`, `math.min`, `eq`, `contains`, `not`, `and`, `or`, `coalesce`, `typeof`. | `std/src/stdlib.test.ts`, `std/src/predicates.test.ts` |
| `tools` | `fs.read`, `fs.write`, `fs.list`, `fs.exists`, `sh.exec`, `http.get`. Tool metadata (name, mode, capabilityId). Input validation via Zod-equivalent schemas. | `tools/src/tools.test.ts`, `tools/src/registry.test.ts` |
| `cli` | Command dispatch for `run`, `check`, `fmt`, `trace`. Flag parsing. Evidence output. Pretty/JSON output modes. | `cli/src/cmd-*.test.ts` |

**Go test patterns:**

```go
func TestLexer_Keywords(t *testing.T) {
    tokens, err := Tokenize("cap budget import as let return do assert check true false null")
    if err != nil {
        t.Fatal(err)
    }
    expected := []TokenKind{Cap, Budget, Import, As, Let, Return, Do, Assert, Check, True, False, Null}
    if len(tokens) != len(expected) {
        t.Fatalf("expected %d tokens, got %d", len(expected), len(tokens))
    }
    for i, tok := range tokens {
        if tok.Kind != expected[i] {
            t.Errorf("token[%d]: expected %v, got %v", i, expected[i], tok.Kind)
        }
    }
}
```

### 1.2 Table-Driven Tests

Go's testing idiom favors table-driven tests. Each test case is a struct with input, expected output, and optional description. This maps well to A0's test patterns where many tests follow the same parse-validate-execute flow.

```go
func TestEvaluator_Literals(t *testing.T) {
    cases := []struct {
        name   string
        src    string
        expect A0Value
    }{
        {"int literal", `return 42`, int64(42)},
        {"float literal", `return 3.14`, 3.14},
        {"string literal", `return "hello"`, "hello"},
        {"bool true", `return true`, true},
        {"bool false", `return false`, false},
        {"null", `return null`, nil},
    }
    for _, tc := range cases {
        t.Run(tc.name, func(t *testing.T) {
            result, err := Execute(MustParse(tc.src), DefaultOpts())
            if err != nil {
                t.Fatal(err)
            }
            if !DeepEqual(result.Value, tc.expect) {
                t.Errorf("expected %v, got %v", tc.expect, result.Value)
            }
        })
    }
}
```

### 1.3 Golden Tests

Golden tests compare output against committed reference files. Used for:

- **Formatter**: `input.a0` -> format -> compare to `input.formatted.a0` (7 fixture pairs in the TS impl)
- **Trace**: Program execution -> trace event sequence -> compare to sanitized golden JSON
- **Capabilities**: Policy file + program -> expected outcome (deny/allow/override)

```go
func TestFormatter_Golden(t *testing.T) {
    fixtures, _ := filepath.Glob("testdata/formatter/*.a0")
    for _, input := range fixtures {
        if strings.HasSuffix(input, ".formatted.a0") {
            continue
        }
        name := strings.TrimSuffix(filepath.Base(input), ".a0")
        t.Run(name, func(t *testing.T) {
            src := mustReadFile(input)
            expected := mustReadFile(strings.Replace(input, ".a0", ".formatted.a0", 1))
            prog := MustParse(src)
            formatted := Format(prog)
            if formatted != expected {
                t.Errorf("mismatch:\n--- expected ---\n%s\n--- got ---\n%s", expected, formatted)
            }
            // Idempotence check
            prog2 := MustParse(formatted)
            formatted2 := Format(prog2)
            if formatted2 != formatted {
                t.Error("formatting is not idempotent")
            }
        })
    }
}
```

### 1.4 Fuzz Tests

Go's built-in fuzz testing (`go test -fuzz`) is valuable for parser robustness. Fuzz targets:

| Target | What it fuzzes | Invariant |
|--------|---------------|-----------|
| `FuzzLexer` | Arbitrary byte strings | Must not panic; returns tokens + errors |
| `FuzzParser` | Arbitrary byte strings | Must not panic; returns AST or diagnostics |
| `FuzzFormatter` | Valid programs from corpus | format(format(x)) == format(x) (idempotence) |
| `FuzzEvaluator` | Valid programs from corpus | Must not panic; returns value or error with valid diagnostic code |

```go
func FuzzParser(f *testing.F) {
    // Seed corpus from scenario .a0 files
    seeds, _ := filepath.Glob("testdata/scenarios/*/*.a0")
    for _, s := range seeds {
        data, _ := os.ReadFile(s)
        f.Add(data)
    }
    f.Fuzz(func(t *testing.T, data []byte) {
        result := Parse(string(data), "fuzz.a0")
        // Must never panic; either program or diagnostics
        if result.Program == nil && len(result.Diagnostics) == 0 {
            t.Error("no program and no diagnostics")
        }
    })
}
```

---

## 2. Conformance Test Suite

### 2.1 Scenario-Based Conformance

The TypeScript implementation has ~125 end-to-end scenarios in `packages/scenarios/scenarios/`. Each scenario is a directory containing:

- **`scenario.json`** -- Test specification:
  ```json
  {
    "cmd": ["run", "program.a0"],
    "policy": { "allow": ["fs.read"] },
    "expect": {
      "exitCode": 0,
      "stdoutJson": { "key": "value" },
      "stderrContains": "E_SOME_CODE"
    }
  }
  ```
- **`program.a0`** -- The A0 source program
- **`setup/`** (optional) -- Fixture files (e.g., input.txt for fs.read tests)

**Scenario categories** (from the existing TS suite):

| Category | Count (approx) | Examples |
|----------|----------------|---------|
| Happy path (run) | ~15 | `hello`, `arithmetic`, `for-loop`, `fn-basic`, `fn-recursive`, `map-fn`, `if-then-else`, `match-ok` |
| Stdlib | ~15 | `stdlib-lists`, `stdlib-strings`, `stdlib-records`, `stdlib-predicates`, `stdlib-parse-json`, `stdlib-filter-find-sort`, `stdlib-put-patch`, `stdlib-nested-get`, `stdlib-error-parse` |
| Tool integration | ~10 | `fs-read`, `file-write-json`, `file-write-text`, `file-write-sha256`, `file-write-multiformat`, `trace-with-tools` |
| Error/diagnostic | ~15 | `check-no-return`, `check-return-not-last`, `check-unbound`, `check-dup-binding`, `check-call-effect`, `check-undeclared-cap`, `parse-error`, `pretty-error` |
| Capability enforcement | ~5 | `cap-denied`, `unsafe-allow-all` |
| Budget enforcement | ~5 | `budget-max-iterations`, `budget-max-tool-calls`, `budget-time`, `budget-max-bytes` |
| Evidence/assertions | ~10 | `assert-pass`, `assert-fail`, `assert-halts`, `check-pass`, `evidence-pass`, `evidence-fail`, `mixed-checks` |
| Runtime errors | ~5 | `runtime-for-not-list`, `runtime-type-error`, `runtime-match-no-arm`, `tool-error`, `match-err` |
| Formatter | ~5 | `fmt-idempotence`, `fmt-write` |
| Trace | ~5 | `trace-basic`, `trace-command`, `trace-command-text`, `trace-command-error` |
| I/O | ~5 | `stdin-input`, `cmd-io` |

### 2.2 Shared Scenario Runner

The scenario test suite must be **shared between TS and Go implementations**. The scenario files (`.a0` programs and `scenario.json` specs) are the single source of truth. Both implementations run the same scenarios and must produce identical results.

**Go scenario runner design:**

```go
// scenario_test.go
type Scenario struct {
    Cmd    []string       `json:"cmd"`
    Policy PolicySpec     `json:"policy"`
    Expect ExpectSpec     `json:"expect"`
}

type ExpectSpec struct {
    ExitCode       int              `json:"exitCode"`
    StdoutJson     any              `json:"stdoutJson,omitempty"`
    StdoutText     string           `json:"stdoutText,omitempty"`
    StderrContains string           `json:"stderrContains,omitempty"`
}

func TestConformance(t *testing.T) {
    dirs, _ := filepath.Glob("testdata/scenarios/*/scenario.json")
    for _, specFile := range dirs {
        dir := filepath.Dir(specFile)
        name := filepath.Base(dir)
        t.Run(name, func(t *testing.T) {
            var spec Scenario
            mustUnmarshal(specFile, &spec)

            result := runA0(dir, spec.Cmd, spec.Policy)

            if result.ExitCode != spec.Expect.ExitCode {
                t.Errorf("exit code: expected %d, got %d", spec.Expect.ExitCode, result.ExitCode)
            }
            if spec.Expect.StdoutJson != nil {
                assertJsonEqual(t, spec.Expect.StdoutJson, result.Stdout)
            }
            if spec.Expect.StderrContains != "" {
                if !strings.Contains(result.Stderr, spec.Expect.StderrContains) {
                    t.Errorf("stderr does not contain %q", spec.Expect.StderrContains)
                }
            }
        })
    }
}
```

### 2.3 Conformance Gating

The conformance test suite is a **release gate**. No release of the Go port is permitted unless:

1. All ~125 scenario tests pass on all target platforms
2. All golden tests (formatter, trace, capabilities) pass
3. All unit tests pass
4. No fuzz test regressions (fuzz corpus must be maintained)
5. WASM targets pass the same conformance suite via a Node.js or browser harness

### 2.4 Conformance Versioning

Conformance is tracked per A0 language version. When the TS implementation adds new features (e.g., v0.5 added `filter`, `loop`, bare returns), the conformance suite grows. The Go port tracks which language version it conforms to:

```
a0-go version
# a0-go 0.5.0 (conformance: a0-spec-0.5)
```

---

## 3. Cross-Platform Testing Matrix

### 3.1 Compilation Targets

| Target | GOOS/GOARCH | Build Cmd | Notes |
|--------|-------------|-----------|-------|
| Linux amd64 | `linux/amd64` | `GOOS=linux GOARCH=amd64 go build` | Primary CI target |
| Linux arm64 | `linux/arm64` | `GOOS=linux GOARCH=arm64 go build` | ARM servers, Raspberry Pi |
| macOS amd64 | `darwin/amd64` | `GOOS=darwin GOARCH=amd64 go build` | Intel Macs |
| macOS arm64 | `darwin/arm64` | `GOOS=darwin GOARCH=arm64 go build` | Apple Silicon |
| Windows amd64 | `windows/amd64` | `GOOS=windows GOARCH=amd64 go build` | Windows desktop |
| WASM/js | `js/wasm` | `GOOS=js GOARCH=wasm go build` | Browser target |
| WASI Preview 1 | `wasip1/wasm` | `GOOS=wasip1 GOARCH=wasm go build` | WASI runtimes (Wasmtime, WasmEdge) |
| TinyGo WASM | - | `tinygo build -target=wasm` | Smaller binary, subset of stdlib |

### 3.2 CI Matrix

```yaml
# .github/workflows/ci.yml
strategy:
  matrix:
    os: [ubuntu-latest, macos-latest, windows-latest]
    go: ['1.22', '1.23']
    include:
      - os: ubuntu-latest
        go: '1.23'
        wasm: true          # Also run WASM tests
      - os: ubuntu-latest
        go: '1.23'
        tinygo: true         # TinyGo build + size check
```

### 3.3 WASM Test Harness

WASM targets cannot run `go test` directly. Instead:

**js/wasm target** (browser/Node.js):
```javascript
// test-wasm-harness.mjs
import { readFileSync } from 'fs';
import { WASI } from 'wasi';

const go = new Go();  // from wasm_exec.js
const wasm = readFileSync('./a0.wasm');
const result = await WebAssembly.instantiate(wasm, go.importObject);
go.run(result.instance);

// Call exported functions and compare results
const output = globalThis.a0Run(scenarioSource, scenarioPolicy);
assert.deepStrictEqual(JSON.parse(output), expectedResult);
```

**wasip1 target** (Wasmtime/WasmEdge):
```bash
wasmtime run --dir=. a0.wasm -- run program.a0
```

### 3.4 Platform-Specific Test Considerations

| Platform | Concern | Mitigation |
|----------|---------|------------|
| Windows | Path separators (`\` vs `/`) | Use `filepath.ToSlash` for A0 paths; test with both separators |
| Windows | Line endings (CRLF vs LF) | Normalize to LF in formatter output; test CRLF input handling |
| WASM/js | No filesystem access | Mock `fs.read`/`fs.write` tools; test via virtual FS |
| WASM/js | No `sh.exec` | Return `E_CAP_DENIED` or `E_TOOL` for shell tool in WASM; document limitation |
| wasip1 | Limited filesystem (WASI Preview 1) | Pre-opened dirs only; test with `--dir` flag |
| TinyGo | Missing `reflect`, limited `regexp` | Avoid reflection-heavy patterns; test for compile errors early |
| TinyGo | No goroutine scheduling guarantees | Avoid concurrent evaluation paths in TinyGo builds |

---

## 4. Diagnostic and Error Testing

### 4.1 Diagnostic Code Coverage

Every diagnostic code must have at least one test that triggers it and verifies:
1. The correct code string (e.g., `"E_UNBOUND"`)
2. A meaningful message
3. A correct span (file, line, column) when applicable
4. The correct exit code

**Complete diagnostic code inventory:**

| Code | Phase | Exit Code | Test Strategy |
|------|-------|-----------|---------------|
| `E_LEX` | Lex | 2 | Invalid character input |
| `E_PARSE` | Parse | 2 | Malformed syntax (missing braces, incomplete let) |
| `E_AST` | Parse | 2 | CST-to-AST conversion failures |
| `E_NO_RETURN` | Validate | 2 | Program without return statement |
| `E_RETURN_NOT_LAST` | Validate | 2 | Return followed by more statements |
| `E_UNKNOWN_CAP` | Validate | 2 | `cap { unknown.thing: true }` |
| `E_DUP_BINDING` | Validate | 2 | `let x = 1; let x = 2` in same scope |
| `E_UNBOUND` | Validate | 2 | Reference to undeclared variable |
| `E_CALL_EFFECT` | Validate | 2 | `call?` on effect tool (compile-time) |
| `E_UNDECLARED_CAP` | Validate | 2 | Tool use without matching `cap` declaration |
| `E_CAP_DENIED` | Runtime | 3 | Policy denies requested capability |
| `E_TOOL_ARGS` | Runtime | 4 | Invalid arguments to tool |
| `E_UNKNOWN_TOOL` | Runtime | 4 | Call to non-existent tool |
| `E_TOOL` | Runtime | 4 | Tool execution failure |
| `E_UNKNOWN_FN` | Runtime | 4 | Call to non-existent stdlib/user fn |
| `E_FN` | Runtime | 4 | Stdlib function throws |
| `E_FN_DUP` | Validate | 2 | Duplicate function definition |
| `E_ASSERT` | Runtime | 5 | `assert { that: false }` |
| `E_CHECK` | Runtime | 5 | `check { that: false }` (non-fatal, exit 5 after run) |
| `E_PATH` | Runtime | 4 | Invalid path in `get`/`put` |
| `E_BUDGET` | Runtime | 4 | Budget limit exceeded |
| `E_UNKNOWN_BUDGET` | Validate | 2 | Unknown budget field |
| `E_FOR_NOT_LIST` | Runtime | 4 | `for` on non-list value |
| `E_MATCH_NOT_RECORD` | Runtime | 4 | `match` on non-record |
| `E_MATCH_NO_ARM` | Runtime | 4 | No matching arm in `match` |
| `E_TYPE` | Runtime | 4 | Type error in expression |

### 4.2 Error Message Conformance

Error messages need not be character-identical between TS and Go, but they must:
1. Contain the same diagnostic code
2. Reference the same source location (line:col)
3. Convey the same information (e.g., which variable is unbound)

Test with `stderrContains` assertions rather than exact string matching.

---

## 5. Performance and Benchmark Tests

### 5.1 Go Benchmarks

```go
func BenchmarkParse_HelloWorld(b *testing.B) {
    src := `let greeting = "Hello, A0!"\nlet data = { name: "world", version: 1 }\nreturn { greeting: greeting, data: data }`
    for i := 0; i < b.N; i++ {
        Parse(src, "bench.a0")
    }
}

func BenchmarkExecute_ForLoop100(b *testing.B) {
    src := `let items = range { start: 0, end: 100 }\nlet result = for { in: items, as: "i" } {\n  return i\n}\nreturn { count: len { in: result } }`
    prog := MustParse(src)
    opts := DefaultOpts()
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        Execute(prog, opts)
    }
}

func BenchmarkFormat_LargeProgram(b *testing.B) {
    src := generateLargeProgram(100) // 100 let bindings
    prog := MustParse(src)
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        Format(prog)
    }
}
```

### 5.2 WASM Binary Size Tracking

Track binary size across commits to prevent regression:

| Build | Target Size | Notes |
|-------|-------------|-------|
| Standard Go `js/wasm` | < 5 MB (gzipped < 1.5 MB) | Acceptable for server-side Node.js |
| TinyGo `wasm` | < 500 KB (gzipped < 200 KB) | Target for browser embedding |
| Standard Go native | < 15 MB | Typical for Go CLI binaries |

```bash
# CI step: track binary sizes
go build -o a0-native ./cmd/a0
GOOS=js GOARCH=wasm go build -o a0-std.wasm ./cmd/a0-wasm
tinygo build -o a0-tiny.wasm -target=wasm ./cmd/a0-wasm

ls -la a0-native a0-std.wasm a0-tiny.wasm
gzip -k a0-std.wasm a0-tiny.wasm
ls -la a0-std.wasm.gz a0-tiny.wasm.gz
```

### 5.3 Performance Comparison Targets

The Go port should be competitive with or faster than the TS implementation for:
- Parse time (goal: 2-5x faster)
- Evaluation time (goal: 2-10x faster, especially for loops)
- Startup time (goal: < 50ms for native, < 200ms for WASM)

---

## 6. Integration and End-to-End Tests

### 6.1 CLI Integration Tests

Test the compiled binary as a black box, similar to the scenario runner:

```go
func TestCLI_RunHello(t *testing.T) {
    cmd := exec.Command("./a0", "run", "testdata/scenarios/hello/hello.a0")
    cmd.Env = append(os.Environ(), "A0_UNSAFE_ALLOW_ALL=1")
    out, err := cmd.CombinedOutput()
    if err != nil {
        t.Fatalf("exit error: %v\noutput: %s", err, out)
    }
    var result map[string]any
    json.Unmarshal(out, &result)
    if result["greeting"] != "Hello, A0!" {
        t.Errorf("unexpected greeting: %v", result["greeting"])
    }
}
```

### 6.2 Evidence and Trace File Tests

Verify that `--evidence` and `--trace` flags produce correct file output:

```go
func TestCLI_EvidenceOutput(t *testing.T) {
    tmpFile := filepath.Join(t.TempDir(), "evidence.json")
    cmd := exec.Command("./a0", "run", "--evidence", tmpFile, "--unsafe-allow-all", "testdata/assert-pass.a0")
    cmd.Run()

    data, _ := os.ReadFile(tmpFile)
    var evidence []map[string]any
    json.Unmarshal(data, &evidence)
    if len(evidence) != 1 || evidence[0]["ok"] != true {
        t.Errorf("unexpected evidence: %s", data)
    }
}
```

### 6.3 Stdin/Stdout Piping

```go
func TestCLI_StdinInput(t *testing.T) {
    cmd := exec.Command("./a0", "run", "--unsafe-allow-all", "testdata/stdin-input.a0")
    cmd.Stdin = strings.NewReader(`{"key": "value"}`)
    out, _ := cmd.Output()
    // Verify program processed stdin correctly
}

func TestCLI_FmtStdout(t *testing.T) {
    cmd := exec.Command("./a0", "fmt", "testdata/unformatted.a0")
    out, _ := cmd.Output()
    // Verify formatted output on stdout
}
```

---

## 7. WASM-Specific Testing

### 7.1 js/wasm Tests via Node.js

```javascript
// test/wasm_test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadA0Wasm } from './wasm-loader.mjs';

test('WASM: parse and execute hello world', async () => {
    const a0 = await loadA0Wasm();
    const result = a0.run(`return { greeting: "Hello" }`);
    assert.deepStrictEqual(JSON.parse(result), { greeting: "Hello" });
});

test('WASM: returns diagnostic on parse error', async () => {
    const a0 = await loadA0Wasm();
    const result = a0.check(`return {`);
    const diags = JSON.parse(result);
    assert.ok(diags.some(d => d.code === 'E_PARSE'));
});
```

### 7.2 wasip1 Tests via Wasmtime

```bash
#!/bin/bash
# test-wasip1.sh
WASM=./a0.wasm

# Test: hello world
OUTPUT=$(wasmtime run --dir=testdata $WASM -- run testdata/hello.a0 2>/dev/null)
EXPECTED='{"greeting":"Hello, A0!","data":{"name":"world","version":1}}'
[ "$OUTPUT" = "$EXPECTED" ] || echo "FAIL: hello world"

# Test: parse error exits with code 2
wasmtime run --dir=testdata $WASM -- check testdata/bad.a0 2>/dev/null
[ $? -eq 2 ] || echo "FAIL: parse error exit code"
```

### 7.3 Browser Tests via Playwright/Puppeteer

For the browser embedding target, run conformance in a real browser:

```javascript
// test/browser_test.mjs
import { test, expect } from '@playwright/test';

test('browser: A0 WASM runs hello world', async ({ page }) => {
    await page.goto('http://localhost:8080/test-harness.html');
    const result = await page.evaluate(async () => {
        const a0 = await window.loadA0();
        return a0.run('return { ok: true }');
    });
    expect(JSON.parse(result)).toEqual({ ok: true });
});
```

---

## 8. Test Data Management

### 8.1 Shared Scenario Files

The scenario `.a0` files and `scenario.json` specs live in a shared location accessible to both TS and Go implementations:

```
testdata/
  scenarios/           # Copied/symlinked from packages/scenarios/scenarios/
    hello/
      hello.a0
      scenario.json
    cap-denied/
      program.a0
      scenario.json
    ...
  fixtures/
    formatter/         # Copied from packages/core/src/__fixtures__/formatter/
      simple.a0
      simple.formatted.a0
      ...
  corpus/              # Fuzz corpus seeds
    valid/             # Known-valid programs
    invalid/           # Known-invalid programs (should produce diagnostics)
```

### 8.2 Scenario Sync Tooling

A script keeps Go's `testdata/scenarios/` in sync with the TS `packages/scenarios/scenarios/`:

```bash
#!/bin/bash
# sync-scenarios.sh
rsync -av --delete \
    ../packages/scenarios/scenarios/ \
    ./testdata/scenarios/
```

Or, if the Go port lives in the same monorepo:
```go
//go:embed testdata/scenarios
var scenarioFS embed.FS
```

---

## 9. Continuous Integration Pipeline

### 9.1 CI Stages

```
Stage 1: Lint + Format
  - go vet ./...
  - golangci-lint run
  - gofmt check (no formatting diff)

Stage 2: Unit Tests
  - go test ./... -race -count=1
  - Coverage report (target: >80%)

Stage 3: Conformance Tests
  - Run all ~125 scenario tests
  - Run golden tests (formatter, trace, capabilities)

Stage 4: Cross-Platform Build
  - Build for linux/amd64, darwin/arm64, windows/amd64
  - Build WASM targets (js/wasm, wasip1/wasm)
  - TinyGo build (if applicable)

Stage 5: WASM Conformance
  - Run scenario tests via Node.js WASM harness
  - Run scenario tests via wasmtime (wasip1)
  - Binary size check (fail if exceeds threshold)

Stage 6: Fuzz (nightly only)
  - go test -fuzz=. -fuzztime=5m ./pkg/parser
  - go test -fuzz=. -fuzztime=5m ./pkg/lexer

Stage 7: Benchmarks (nightly only)
  - go test -bench=. -benchmem ./...
  - Compare against baseline; flag regressions >10%
```

### 9.2 Coverage Requirements

| Package | Minimum Coverage |
|---------|-----------------|
| `lexer` | 90% |
| `parser` | 85% |
| `validator` | 90% |
| `evaluator` | 85% |
| `formatter` | 90% |
| `stdlib` | 95% |
| `tools` | 80% |
| `cli` | 75% |
| **Overall** | **85%** |

### 9.3 Race Detector

All tests run with `-race` flag on Linux to detect data races. This is especially important for:
- The evaluator's async tool execution paths
- Any concurrent scenario execution in tests
- Shared state in the stdlib or tool registry

---

## 10. Release Conformance Checklist

Before any release of the Go port:

- [ ] All unit tests pass on linux/amd64, darwin/arm64, windows/amd64
- [ ] All ~125 conformance scenarios pass
- [ ] All golden tests pass (formatter, trace, capabilities)
- [ ] Race detector reports no issues
- [ ] WASM (js/wasm) conformance passes via Node.js harness
- [ ] WASI (wasip1) conformance passes via wasmtime
- [ ] TinyGo build succeeds (if targeting small WASM)
- [ ] Binary sizes are within thresholds
- [ ] Benchmark results show no regression > 10%
- [ ] Coverage meets minimums
- [ ] All diagnostic codes have test coverage
- [ ] `a0-go version` reports correct conformance level
- [ ] CHANGELOG documents any known behavioral differences
