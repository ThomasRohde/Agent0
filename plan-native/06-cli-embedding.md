# 06 - CLI Design and Embedding API

This document details the Go/WASM implementation plan for the A0 command-line interface and the embedding API that allows host applications to integrate the A0 runtime as a library.

---

## Table of Contents

1. [CLI Overview](#1-cli-overview)
2. [Command Architecture](#2-command-architecture)
3. [Command Specifications](#3-command-specifications)
4. [Exit Code Contract](#4-exit-code-contract)
5. [Capability Policy System](#5-capability-policy-system)
6. [CLI Implementation in Go](#6-cli-implementation-in-go)
7. [Embedding API Design](#7-embedding-api-design)
8. [Embedding API Usage Examples](#8-embedding-api-usage-examples)
9. [WASM Embedding](#9-wasm-embedding)
10. [TypeScript vs Go CLI Comparison](#10-typescript-vs-go-cli-comparison)
11. [Progressive Help System](#11-progressive-help-system)
12. [Testing Strategy](#12-testing-strategy)

---

## 1. CLI Overview

The A0 CLI (`a0`) is the primary user-facing interface for parsing, validating, executing, and formatting A0 programs. The Go port must replicate all commands with identical behavior, exit codes, and output formats.

### TypeScript CLI Stack

| Component | TypeScript | Go Equivalent |
|-----------|-----------|---------------|
| CLI framework | Commander.js | `cobra` or `flag` stdlib |
| Entry point | `packages/cli/src/main.ts` | `cmd/a0/main.go` |
| Version | From `package.json` | Build-time `ldflags` |
| Distribution | npm (`npm install -g`) | Single binary |

### Commands

| Command | Summary | Requires Runtime |
|---------|---------|-----------------|
| `a0 run <file>` | Execute an A0 program | Yes |
| `a0 check <file>` | Static validation without execution | No (parse + validate only) |
| `a0 fmt <file>` | Format A0 source code | No (parse + format only) |
| `a0 trace <file>` | Summarize a JSONL trace file | No (reads trace file) |
| `a0 policy` | Display effective capability policy | No (reads policy files) |
| `a0 help [topic]` | Language reference | No |

---

## 2. Command Architecture

### TypeScript Structure

```
packages/cli/src/
  main.ts           # Commander setup, command registration
  index.ts          # Re-exports
  cmd-run.ts        # runRun()   -> Promise<number>
  cmd-check.ts      # runCheck() -> Promise<number>
  cmd-fmt.ts        # runFmt()   -> Promise<number>
  cmd-trace.ts      # runTrace() -> Promise<number>
  cmd-policy.ts     # runPolicy() -> Promise<number>
  cmd-help.ts       # runHelp()  -> void
  help-content.ts   # QUICKREF, TOPICS constants
```

Each command function returns an exit code (`number`). The main entry calls `process.exit(code)`.

### Go Structure

```
cmd/
  a0/
    main.go         # Entry point, cobra root command
internal/
  cli/
    run.go          # RunCmd()
    check.go        # CheckCmd()
    fmt.go          # FmtCmd()
    trace.go        # TraceCmd()
    policy.go       # PolicyCmd()
    help.go         # HelpCmd()
    help_content.go # Quick reference and topic strings
    io.go           # Shared I/O helpers
```

---

## 3. Command Specifications

### 3.1 `a0 run <file>` - Execute an A0 Program

The most complex command. Wires together parsing, validation, policy loading, tool/stdlib registration, and execution.

#### Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `<file>` | positional | required | A0 source file (or `-` for stdin) |
| `--trace <path>` | string | none | Write JSONL trace events to file |
| `--evidence <path>` | string | none | Write evidence JSON to file |
| `--pretty` | bool | false | Human-readable error output |
| `--debug-parse` | bool | false | Show raw parser internals on parse errors |
| `--unsafe-allow-all` | bool | false | Bypass all capability restrictions (dev only) |

#### Execution Flow

```
1. Read source file (or stdin if "-")
2. Parse source -> AST + diagnostics
   - If parse errors: print diagnostics, exit 2
3. Validate AST
   - If validation errors: print diagnostics, exit 2
4. Load capability policy
5. Build allowed capabilities set
6. Register built-in tools
7. Get stdlib functions
8. Generate run ID (UUID)
9. Open trace file (if --trace)
10. Execute program
    - On success: write evidence file, print result JSON, exit 0 (or 5 if any check failed)
    - On A0RuntimeError: write evidence, print error, exit 3/4/5 based on error code
    - On I/O error: exit 4
11. Close trace file
```

#### Go Implementation

```go
package cli

import (
    "context"
    "encoding/json"
    "fmt"
    "os"

    "github.com/a0-lang/a0/pkg/a0"
    "github.com/a0-lang/a0/pkg/stdlib"
    "github.com/a0-lang/a0/pkg/tools"
    "github.com/google/uuid"
)

type RunOptions struct {
    File           string
    Trace          string
    Evidence       string
    Pretty         bool
    DebugParse     bool
    UnsafeAllowAll bool
}

func Run(ctx context.Context, opts RunOptions) int {
    // 1. Read source
    source, err := readSource(opts.File)
    if err != nil {
        emitError("E_IO", fmt.Sprintf("Error reading file: %s", err), opts.Pretty)
        return 4
    }

    // 2. Parse
    parseResult := a0.Parse(source, opts.File, a0.ParseOptions{
        DebugParse: opts.DebugParse,
    })
    if len(parseResult.Diagnostics) > 0 {
        printDiagnostics(parseResult.Diagnostics, opts.Pretty)
        return 2
    }
    if parseResult.Program == nil {
        emitError("E_PARSE", "Parse produced no program.", opts.Pretty)
        return 2
    }

    // 3. Validate
    validationDiags := a0.Validate(parseResult.Program)
    if len(validationDiags) > 0 {
        printDiagnostics(validationDiags, opts.Pretty)
        return 2
    }

    // 4-5. Policy
    policy := a0.LoadPolicy()
    allowedCaps := a0.BuildAllowedCaps(policy, opts.UnsafeAllowAll)

    // 6-7. Tools and stdlib
    registry := tools.NewRegistry()
    registry.RegisterBuiltin()
    stdlibFns := stdlib.GetAll()

    // 8. Run ID
    runID := uuid.New().String()

    // 9. Trace handler
    var traceHandler func(a0.TraceEvent)
    var traceFile *os.File
    if opts.Trace != "" {
        var err error
        traceFile, err = os.Create(opts.Trace)
        if err != nil {
            emitError("E_IO", fmt.Sprintf("Error opening trace file: %s", err), opts.Pretty)
            return 4
        }
        defer traceFile.Close()
        traceHandler = func(event a0.TraceEvent) {
            data, _ := json.Marshal(event)
            traceFile.Write(data)
            traceFile.Write([]byte("\n"))
        }
    }

    // 10. Execute
    result, err := a0.Execute(ctx, parseResult.Program, a0.ExecOptions{
        AllowedCapabilities: allowedCaps,
        Tools:               registry.All(),
        Stdlib:              stdlibFns,
        Trace:               traceHandler,
        RunID:               runID,
    })

    if err != nil {
        // Write evidence file
        writeEvidenceFile(opts.Evidence, nil)

        if runtimeErr, ok := err.(*a0.A0RuntimeError); ok {
            writeEvidenceFile(opts.Evidence, runtimeErr.Evidence)
            printRuntimeError(runtimeErr, opts.Pretty)
            switch runtimeErr.Code {
            case "E_CAP_DENIED":
                return 3
            case "E_ASSERT":
                return 5
            default:
                return 4
            }
        }
        emitError("E_RUNTIME", err.Error(), opts.Pretty)
        return 4
    }

    // Write evidence
    writeEvidenceFile(opts.Evidence, result.Evidence)

    // Output result
    output, _ := json.MarshalIndent(result.Value, "", "  ")
    fmt.Println(string(output))

    // Check for failed evidence
    for _, ev := range result.Evidence {
        if !ev.OK {
            return 5
        }
    }
    return 0
}
```

### 3.2 `a0 check <file>` - Static Validation

Parses and validates an A0 program without executing it. Catches compile-time errors.

#### Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `<file>` | positional | required | A0 source file |
| `--pretty` | bool | false | Human-readable output |
| `--stable-json` | bool | false | Stable machine-readable success output |
| `--debug-parse` | bool | false | Show raw parser internals on parse errors |

#### Output Behavior

| Scenario | `--pretty` | `--stable-json` | Default |
|----------|-----------|-----------------|---------|
| No errors | `"No errors found."` | `{"ok":true,"errors":[]}` | `[]` |
| Errors | Pretty diagnostics to stderr | JSON diagnostics to stderr | JSON diagnostics to stderr |

```go
func Check(opts CheckOptions) int {
    source, err := readFile(opts.File)
    if err != nil {
        emitError("E_IO", fmt.Sprintf("Error reading file: %s", err), opts.Pretty)
        return 4
    }

    parseResult := a0.Parse(source, opts.File, a0.ParseOptions{
        DebugParse: opts.DebugParse,
    })
    if len(parseResult.Diagnostics) > 0 {
        printDiagnostics(parseResult.Diagnostics, opts.Pretty)
        return 2
    }
    if parseResult.Program == nil {
        fmt.Fprintln(os.Stderr, "Parse produced no program.")
        return 2
    }

    validationDiags := a0.Validate(parseResult.Program)
    if len(validationDiags) > 0 {
        printDiagnostics(validationDiags, opts.Pretty)
        return 2
    }

    if opts.Pretty {
        fmt.Println("No errors found.")
    } else if opts.StableJSON {
        fmt.Println(`{"ok":true,"errors":[]}`)
    } else {
        fmt.Println("[]")
    }
    return 0
}
```

### 3.3 `a0 fmt <file>` - Format A0 Source

Parses and re-emits A0 source in canonical format.

#### Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `<file>` | positional | required | A0 source file |
| `--write` | bool | false | Overwrite file in place (otherwise print to stdout) |

#### Behavior

- Comments are stripped during formatting (warning emitted to stderr if comments detected)
- Format is canonical and deterministic
- Parse errors prevent formatting (exit 2)

```go
func Fmt(opts FmtOptions) int {
    source, err := readFile(opts.File)
    if err != nil {
        emitError("E_IO", fmt.Sprintf("Error reading file: %s", err), true)
        return 4
    }

    parseResult := a0.Parse(source, opts.File, a0.ParseOptions{})
    if len(parseResult.Diagnostics) > 0 {
        printDiagnostics(parseResult.Diagnostics, true)
        return 2
    }
    if parseResult.Program == nil {
        fmt.Fprintln(os.Stderr, "Parse produced no program.")
        return 2
    }

    // Warn about comments being stripped
    if hasComments(source) {
        fmt.Fprintln(os.Stderr, "warning: formatting will remove comments from the output.")
    }

    formatted := a0.Format(parseResult.Program)

    if opts.Write {
        if err := os.WriteFile(opts.File, []byte(formatted), 0644); err != nil {
            emitError("E_IO", fmt.Sprintf("Error writing file: %s", err), true)
            return 4
        }
    } else {
        fmt.Print(formatted)
    }
    return 0
}
```

### 3.4 `a0 trace <file>` - Summarize Trace Output

Reads a JSONL trace file produced by `a0 run --trace` and displays a summary.

#### Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `<file>` | positional | required | JSONL trace file |
| `--json` | bool | false | Output summary as JSON |

#### Trace Summary Fields

```go
type TraceSummary struct {
    RunID           string            `json:"runId"`
    TotalEvents     int               `json:"totalEvents"`
    ToolInvocations int               `json:"toolInvocations"`
    ToolsByName     map[string]int    `json:"toolsByName"`
    EvidenceCount   int               `json:"evidenceCount"`
    Failures        int               `json:"failures"`
    BudgetExceeded  int               `json:"budgetExceeded"`
    StartTime       string            `json:"startTime,omitempty"`
    EndTime         string            `json:"endTime,omitempty"`
    DurationMs      *int64            `json:"durationMs,omitempty"`
}
```

#### Known Trace Event Types

```go
var knownTraceEvents = map[string]bool{
    "run_start": true, "run_end": true,
    "stmt_start": true, "stmt_end": true,
    "tool_start": true, "tool_end": true,
    "evidence": true, "budget_exceeded": true,
    "for_start": true, "for_end": true,
    "fn_call_start": true, "fn_call_end": true,
    "match_start": true, "match_end": true,
    "map_start": true, "map_end": true,
    "reduce_start": true, "reduce_end": true,
    "filter_start": true, "filter_end": true,
    "loop_start": true, "loop_end": true,
}
```

#### Validation Rules

- File must contain at least one valid trace event (else `E_TRACE`, exit 4)
- All events must share the same `runId` (else `E_TRACE`, exit 4)
- Malformed JSON lines are silently skipped

#### Human-Readable Output Format

```
Trace Summary
  Run ID:           <uuid>
  Total events:     <N>
  Tool invocations: <N>
  Tools used:
    <name>: <count>
  Evidence events:  <N>
  Failures:         <N>
  Budget exceeded:  <N>
  Duration:         <N>ms
```

### 3.5 `a0 policy` - Show Effective Policy

Displays the capability policy resolution result.

#### Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--json` | bool | false | Output as JSON |

#### Policy Resolution Order

1. `.a0policy.json` (project directory - current working directory)
2. `~/.a0/policy.json` (user home directory)
3. deny-all default (no allow, no path)

#### Output

**Human-readable:**
```
Effective A0 policy
  Source:          project
  Path:            /path/to/.a0policy.json
  Allow:           fs.read, http.get
  Deny:            sh.exec
  Effective allow: fs.read, http.get
  Limits:          (none)
```

**JSON:**
```json
{
  "source": "project",
  "path": "/path/to/.a0policy.json",
  "policy": {
    "version": 1,
    "allow": ["fs.read", "http.get"],
    "deny": ["sh.exec"],
    "limits": {}
  },
  "effectiveAllow": ["fs.read", "http.get"]
}
```

### 3.6 `a0 help [topic]` - Language Reference

A progressive-discovery help system with a quick reference and topic-specific deep dives.

#### Topics

| Topic | Description |
|-------|-------------|
| `syntax` | Language syntax reference |
| `types` | Type system, truthiness, property access |
| `tools` | Tool reference (all 6 tools) |
| `stdlib` | Full stdlib reference (all functions) |
| `caps` | Capability system |
| `budget` | Budget system |
| `flow` | Control flow (if, for, filter, loop, fn, match, map, reduce) |
| `diagnostics` | All diagnostic codes with debugging workflow |
| `examples` | Example programs |

#### Special Flags

| Flag | Description |
|------|-------------|
| `--index` | Only valid with `stdlib` topic; prints compact index of all stdlib functions |

#### Behavior

- No topic: print quick reference
- Valid topic: print topic content
- Invalid topic: print error + available topics list
- Prefix matching: `"diag"` resolves to `"diagnostics"`, `"ex"` to `"examples"`
- `--index` without `stdlib`: error with usage hint

---

## 4. Exit Code Contract

The exit code contract must be identical between TypeScript and Go implementations.

| Code | Meaning | Triggered By |
|------|---------|-------------|
| 0 | Success | Normal execution, all checks passed |
| 1 | CLI usage error | Unknown command |
| 2 | Parse/validation error | `E_LEX`, `E_PARSE`, `E_AST`, `E_NO_RETURN`, `E_RETURN_NOT_LAST`, `E_UNKNOWN_CAP`, `E_DUP_BINDING`, `E_UNBOUND`, `E_CALL_EFFECT`, `E_FN_DUP`, `E_UNKNOWN_TOOL`, `E_UNDECLARED_CAP`, `E_DUP_BUDGET`, `E_UNKNOWN_BUDGET`, `E_BUDGET_TYPE` |
| 3 | Capability denied | `E_CAP_DENIED` |
| 4 | Runtime error | `E_TOOL`, `E_TOOL_ARGS`, `E_FN`, `E_BUDGET`, `E_PATH`, `E_TYPE`, `E_RUNTIME`, `E_IO`, `E_TRACE`, `E_FOR_NOT_LIST`, `E_MATCH_NOT_RECORD`, `E_MATCH_NO_ARM` |
| 5 | Assertion/check failure | `E_ASSERT` (fatal, halts), failed `check` evidence (non-fatal, exit 5 after completion) |

### Exit Code Mapping in Go

```go
func exitCodeForError(err *a0.A0RuntimeError) int {
    switch err.Code {
    case "E_CAP_DENIED":
        return 3
    case "E_ASSERT":
        return 5
    default:
        return 4
    }
}
```

---

## 5. Capability Policy System

### Policy File Format

```json
{
  "version": 1,
  "allow": ["fs.read", "http.get"],
  "deny": ["sh.exec"],
  "limits": {
    "maxToolCalls": 100
  }
}
```

### Go Policy Implementation

```go
package a0

import (
    "encoding/json"
    "os"
    "path/filepath"
)

type Policy struct {
    Version int               `json:"version"`
    Allow   []string          `json:"allow"`
    Deny    []string          `json:"deny,omitempty"`
    Limits  map[string]int    `json:"limits,omitempty"`
}

type ResolvedPolicy struct {
    Policy Policy
    Source string // "project", "user", "default"
    Path   string // file path, or empty for default
}

var knownCapabilities = map[string]bool{
    "fs.read":  true,
    "fs.write": true,
    "http.get": true,
    "sh.exec":  true,
}

func ResolvePolicy(cwd, homeDir string) ResolvedPolicy {
    if cwd == "" {
        cwd, _ = os.Getwd()
    }
    if homeDir == "" {
        homeDir, _ = os.UserHomeDir()
    }

    // 1. Project-local policy
    projectPath := filepath.Join(cwd, ".a0policy.json")
    if policy, err := loadPolicyFile(projectPath); err == nil {
        return ResolvedPolicy{Policy: *policy, Source: "project", Path: projectPath}
    }

    // 2. User-level policy
    userPath := filepath.Join(homeDir, ".a0", "policy.json")
    if policy, err := loadPolicyFile(userPath); err == nil {
        return ResolvedPolicy{Policy: *policy, Source: "user", Path: userPath}
    }

    // 3. Default: deny all
    return ResolvedPolicy{
        Policy: Policy{Version: 1, Allow: []string{}},
        Source: "default",
    }
}

func LoadPolicy() Policy {
    return ResolvePolicy("", "").Policy
}

func BuildAllowedCaps(policy Policy, unsafeAllowAll bool) map[string]bool {
    if unsafeAllowAll {
        result := make(map[string]bool)
        for cap := range knownCapabilities {
            result[cap] = true
        }
        return result
    }
    denySet := make(map[string]bool)
    for _, d := range policy.Deny {
        denySet[d] = true
    }
    result := make(map[string]bool)
    for _, a := range policy.Allow {
        if !denySet[a] {
            result[a] = true
        }
    }
    return result
}

func loadPolicyFile(path string) (*Policy, error) {
    data, err := os.ReadFile(path)
    if err != nil {
        return nil, err
    }
    var policy Policy
    if err := json.Unmarshal(data, &policy); err != nil {
        return nil, err
    }
    if policy.Version == 0 {
        policy.Version = 1
    }
    return &policy, nil
}
```

---

## 6. CLI Implementation in Go

### Framework Choice: Cobra

Use `github.com/spf13/cobra` for the CLI framework. It provides:

- Subcommand routing
- Flag parsing with types
- Built-in help/version
- Bash/Zsh/Fish completion generation
- Well-understood by Go developers

```go
package main

import (
    "fmt"
    "os"

    "github.com/spf13/cobra"
    "github.com/a0-lang/a0/internal/cli"
)

var version = "dev" // Set via ldflags at build time

func main() {
    root := &cobra.Command{
        Use:   "a0",
        Short: "A0: Agent-Optimized General-Purpose CLI Interpreter",
        Long:  "A0: Agent-Optimized General-Purpose CLI Interpreter",
    }
    root.Version = version
    root.SetOut(os.Stdout)
    root.SetErr(os.Stderr)

    // Register commands
    root.AddCommand(cli.NewRunCmd())
    root.AddCommand(cli.NewCheckCmd())
    root.AddCommand(cli.NewFmtCmd())
    root.AddCommand(cli.NewTraceCmd())
    root.AddCommand(cli.NewPolicyCmd())
    root.AddCommand(cli.NewHelpCmd())

    // Append quick reference to root help
    root.SetHelpTemplate(root.HelpTemplate() + "\n" + cli.QuickRef)

    if err := root.Execute(); err != nil {
        os.Exit(1)
    }
}
```

### Command Registration Pattern

```go
package cli

import (
    "context"

    "github.com/spf13/cobra"
)

func NewRunCmd() *cobra.Command {
    var opts RunOptions
    cmd := &cobra.Command{
        Use:   "run <file>",
        Short: "Run an A0 program",
        Args:  cobra.ExactArgs(1),
        RunE: func(cmd *cobra.Command, args []string) error {
            opts.File = args[0]
            ctx := context.Background()
            code := Run(ctx, opts)
            if code != 0 {
                cmd.SilenceUsage = true
                cmd.SilenceErrors = true
            }
            // Use os.Exit for non-zero to match TypeScript behavior
            if code != 0 {
                os.Exit(code)
            }
            return nil
        },
    }
    cmd.Flags().StringVar(&opts.Trace, "trace", "", "Write JSONL trace to file")
    cmd.Flags().StringVar(&opts.Evidence, "evidence", "", "Write evidence JSON to file")
    cmd.Flags().BoolVar(&opts.Pretty, "pretty", false, "Human-readable error output")
    cmd.Flags().BoolVar(&opts.DebugParse, "debug-parse", false, "Show raw parser internals on parse errors")
    cmd.Flags().BoolVar(&opts.UnsafeAllowAll, "unsafe-allow-all", false, "[DEV ONLY] Bypass all capability restrictions")
    return cmd
}

func NewCheckCmd() *cobra.Command {
    var opts CheckOptions
    cmd := &cobra.Command{
        Use:   "check <file>",
        Short: "Validate without execution",
        Args:  cobra.ExactArgs(1),
        RunE: func(cmd *cobra.Command, args []string) error {
            opts.File = args[0]
            code := Check(opts)
            if code != 0 {
                cmd.SilenceUsage = true
                cmd.SilenceErrors = true
                os.Exit(code)
            }
            return nil
        },
    }
    cmd.Flags().BoolVar(&opts.Pretty, "pretty", false, "Human-readable output")
    cmd.Flags().BoolVar(&opts.StableJSON, "stable-json", false, "Stable machine-readable success output")
    cmd.Flags().BoolVar(&opts.DebugParse, "debug-parse", false, "Show raw parser internals on parse errors")
    return cmd
}

func NewFmtCmd() *cobra.Command {
    var write bool
    cmd := &cobra.Command{
        Use:   "fmt <file>",
        Short: "Format A0 source",
        Args:  cobra.ExactArgs(1),
        RunE: func(cmd *cobra.Command, args []string) error {
            code := Fmt(FmtOptions{File: args[0], Write: write})
            if code != 0 {
                cmd.SilenceUsage = true
                cmd.SilenceErrors = true
                os.Exit(code)
            }
            return nil
        },
    }
    cmd.Flags().BoolVar(&write, "write", false, "Overwrite file in place")
    return cmd
}

func NewTraceCmd() *cobra.Command {
    var jsonOut bool
    cmd := &cobra.Command{
        Use:   "trace <file>",
        Short: "Summarize trace output",
        Args:  cobra.ExactArgs(1),
        RunE: func(cmd *cobra.Command, args []string) error {
            code := Trace(TraceOptions{File: args[0], JSON: jsonOut})
            if code != 0 {
                cmd.SilenceUsage = true
                cmd.SilenceErrors = true
                os.Exit(code)
            }
            return nil
        },
    }
    cmd.Flags().BoolVar(&jsonOut, "json", false, "Output as JSON")
    return cmd
}

func NewPolicyCmd() *cobra.Command {
    var jsonOut bool
    cmd := &cobra.Command{
        Use:   "policy",
        Short: "Show effective policy",
        RunE: func(cmd *cobra.Command, args []string) error {
            code := PolicyCmd(PolicyOptions{JSON: jsonOut})
            if code != 0 {
                os.Exit(code)
            }
            return nil
        },
    }
    cmd.Flags().BoolVar(&jsonOut, "json", false, "Output as JSON")
    return cmd
}

func NewHelpCmd() *cobra.Command {
    var index bool
    cmd := &cobra.Command{
        Use:   "help [topic]",
        Short: "Show reference topics",
        Long:  "Language reference - run 'a0 help <topic>' for details",
        Args:  cobra.MaximumNArgs(1),
        Run: func(cmd *cobra.Command, args []string) {
            var topic string
            if len(args) > 0 {
                topic = args[0]
            }
            HelpCmd(topic, HelpOptions{Index: index})
        },
    }
    cmd.Flags().BoolVar(&index, "index", false, "For stdlib topic, print a compact full stdlib index")
    return cmd
}
```

### Version Injection

Set the version at build time using Go ldflags:

```bash
go build -ldflags="-X main.version=0.5.0" -o a0 ./cmd/a0
```

### Stdin Support

The `run` command supports reading from stdin when the file argument is `-`:

```go
func readSource(file string) (string, error) {
    if file == "-" {
        data, err := io.ReadAll(os.Stdin)
        if err != nil {
            return "", err
        }
        return string(data), nil
    }
    data, err := os.ReadFile(file)
    if err != nil {
        return "", err
    }
    return string(data), nil
}
```

---

## 7. Embedding API Design

The embedding API allows Go applications to integrate the A0 runtime as a library, without the CLI layer. This is the primary integration point for applications that want to run A0 programs programmatically.

### Design Goals

1. **Simple default path** - One function call to run a program
2. **Full control available** - Configure every aspect: tools, stdlib, policies, traces
3. **Context-aware** - All operations respect `context.Context` for cancellation/timeouts
4. **No global state** - Multiple runtimes can coexist in one process
5. **Extensible** - Custom tools and stdlib functions can be registered

### API Surface

```go
package a0

import "context"

// ---- High-level API ----

// Run parses, validates, and executes an A0 program with default settings.
// This is the simplest way to run an A0 program.
func Run(ctx context.Context, source string, opts ...Option) (*ExecResult, error)

// RunFile reads a file and runs it.
func RunFile(ctx context.Context, path string, opts ...Option) (*ExecResult, error)

// Check parses and validates a program without executing it.
func Check(source string, filename string) ([]Diagnostic, error)

// Format parses and re-formats an A0 program.
func Format(source string, filename string) (string, error)

// ---- Low-level API (step-by-step) ----

// Parse tokenizes and parses A0 source into an AST.
func Parse(source string, filename string, opts ParseOptions) *ParseResult

// Validate performs semantic analysis on a parsed program.
func Validate(program *Program) []Diagnostic

// Execute runs a validated program with the given options.
func Execute(ctx context.Context, program *Program, opts ExecOptions) (*ExecResult, error)

// FormatProgram formats an already-parsed program to canonical source.
func FormatProgram(program *Program) string

// ---- Configuration ----

// Option configures the high-level Run/RunFile functions.
type Option func(*runConfig)

// WithPolicy sets the capability policy.
func WithPolicy(policy Policy) Option

// WithUnsafeAllowAll bypasses all capability restrictions.
func WithUnsafeAllowAll() Option

// WithTool registers a custom tool.
func WithTool(tool ToolDef) Option

// WithStdlib registers a custom stdlib function.
func WithStdlib(fn StdlibFn) Option

// WithTrace sets a trace event handler.
func WithTrace(handler func(TraceEvent)) Option

// WithTimeout sets a maximum execution time.
func WithTimeout(d time.Duration) Option

// WithoutBuiltinTools disables registration of default built-in tools.
func WithoutBuiltinTools() Option

// WithoutStdlib disables registration of default stdlib functions.
func WithoutStdlib() Option
```

### Result Types

```go
// ParseResult contains the output of parsing.
type ParseResult struct {
    Program     *Program
    Diagnostics []Diagnostic
}

// ExecResult contains the output of execution.
type ExecResult struct {
    Value       A0Value
    Evidence    []Evidence
    Diagnostics []Diagnostic
}

// Diagnostic represents a compile-time or runtime diagnostic.
type Diagnostic struct {
    Code    string `json:"code"`
    Message string `json:"message"`
    Span    *Span  `json:"span,omitempty"`
    Hint    string `json:"hint,omitempty"`
}

// Evidence represents an assert/check result.
type Evidence struct {
    Kind    string   `json:"kind"`    // "assert" or "check"
    OK      bool     `json:"ok"`
    Msg     string   `json:"msg"`
    Details A0Record `json:"details,omitempty"`
    Span    *Span    `json:"span,omitempty"`
}

// TraceEvent represents a single trace event.
type TraceEvent struct {
    TS    string         `json:"ts"`
    RunID string         `json:"runId"`
    Event TraceEventType `json:"event"`
    Span  *Span          `json:"span,omitempty"`
    Data  A0Record       `json:"data,omitempty"`
}
```

### Custom Tool Registration

```go
// ToolDef interface
type ToolDef interface {
    Name() string
    Mode() ToolMode
    CapabilityID() string
    InputSchema() *Schema
    Execute(ctx context.Context, args A0Record) (A0Value, error)
}

// SimpleToolDef provides a convenient way to create tools.
type SimpleToolDef struct {
    ToolName    string
    ToolMode    ToolMode
    CapID       string
    Schema      *Schema
    ExecuteFn   func(ctx context.Context, args A0Record) (A0Value, error)
}

func (t *SimpleToolDef) Name() string              { return t.ToolName }
func (t *SimpleToolDef) Mode() ToolMode            { return t.ToolMode }
func (t *SimpleToolDef) CapabilityID() string       { return t.CapID }
func (t *SimpleToolDef) InputSchema() *Schema        { return t.Schema }
func (t *SimpleToolDef) Execute(ctx context.Context, args A0Record) (A0Value, error) {
    return t.ExecuteFn(ctx, args)
}
```

---

## 8. Embedding API Usage Examples

### Example 1: Simplest Usage

```go
package main

import (
    "context"
    "fmt"
    "log"

    "github.com/a0-lang/a0/pkg/a0"
)

func main() {
    source := `
        let data = { name: "example", version: 1 }
        return { result: data }
    `
    result, err := a0.Run(context.Background(), source)
    if err != nil {
        log.Fatal(err)
    }
    fmt.Printf("Result: %v\n", result.Value)
}
```

### Example 2: With Policy and Trace

```go
result, err := a0.Run(ctx, source,
    a0.WithPolicy(a0.Policy{
        Version: 1,
        Allow:   []string{"fs.read", "http.get"},
    }),
    a0.WithTrace(func(event a0.TraceEvent) {
        log.Printf("[%s] %s", event.Event, event.TS)
    }),
    a0.WithTimeout(10 * time.Second),
)
```

### Example 3: Custom Tool

```go
// Define a custom tool that queries a database
dbTool := &a0.SimpleToolDef{
    ToolName: "db.query",
    ToolMode: a0.ToolModeRead,
    CapID:    "db.query",
    Schema: &a0.Schema{Fields: []a0.FieldSchema{
        {Name: "sql", Type: "string", Required: true},
    }},
    ExecuteFn: func(ctx context.Context, args a0.A0Record) (a0.A0Value, error) {
        sql, _ := a0.AsString(args["sql"])
        rows, err := db.QueryContext(ctx, sql)
        if err != nil {
            return nil, err
        }
        // Convert rows to A0Value...
        return results, nil
    },
}

result, err := a0.Run(ctx, source,
    a0.WithTool(dbTool),
    a0.WithPolicy(a0.Policy{
        Version: 1,
        Allow:   []string{"db.query"},
    }),
)
```

### Example 4: Step-by-Step Execution

```go
// Parse
parseResult := a0.Parse(source, "script.a0", a0.ParseOptions{})
if len(parseResult.Diagnostics) > 0 {
    for _, d := range parseResult.Diagnostics {
        fmt.Fprintf(os.Stderr, "%s: %s\n", d.Code, d.Message)
    }
    os.Exit(2)
}

// Validate
diags := a0.Validate(parseResult.Program)
if len(diags) > 0 {
    os.Exit(2)
}

// Execute with full control
result, err := a0.Execute(ctx, parseResult.Program, a0.ExecOptions{
    AllowedCapabilities: map[string]bool{"fs.read": true},
    Tools:               toolMap,
    Stdlib:              stdlibMap,
    RunID:               "custom-run-id",
})
```

### Example 5: Validation Only (Linter Integration)

```go
diags, err := a0.Check(source, "script.a0")
if err != nil {
    log.Fatal(err)
}
for _, d := range diags {
    fmt.Printf("%s:%d:%d: %s - %s\n",
        d.Span.File, d.Span.StartLine, d.Span.StartCol,
        d.Code, d.Message)
}
```

### Example 6: Custom Stdlib Function

```go
// Add a custom stdlib function for your domain
envFn := &a0.SimpleStdlibFn{
    FnName: "env.get",
    ExecuteFn: func(args a0.A0Record) (a0.A0Value, error) {
        key, ok := a0.AsString(args["key"])
        if !ok {
            return nil, fmt.Errorf("env.get: 'key' must be a string")
        }
        val := os.Getenv(key)
        if val == "" {
            return nil, nil  // return null for missing env vars
        }
        return val, nil
    },
}

result, err := a0.Run(ctx, source, a0.WithStdlib(envFn))
```

---

## 9. WASM Embedding

The Go runtime compiled to WASM can be embedded in browsers, Node.js, Deno, or other WASM hosts.

### WASM Build

```bash
GOOS=js GOARCH=wasm go build -o a0.wasm ./cmd/a0-wasm
```

Or for WASI targets:

```bash
GOOS=wasip1 GOARCH=wasm go build -o a0.wasm ./cmd/a0-wasi
```

### JavaScript/TypeScript Interop

The WASM module should expose a minimal API surface through exported functions:

```go
//go:build js && wasm

package main

import (
    "syscall/js"
    "github.com/a0-lang/a0/pkg/a0"
)

func main() {
    js.Global().Set("a0", js.ValueOf(map[string]interface{}{
        "run":    js.FuncOf(wasmRun),
        "check":  js.FuncOf(wasmCheck),
        "format": js.FuncOf(wasmFormat),
    }))

    // Keep the Go runtime alive
    select {}
}

func wasmRun(this js.Value, args []js.Value) interface{} {
    if len(args) < 1 {
        return errorResult("source argument required")
    }
    source := args[0].String()

    var options []a0.Option
    if len(args) > 1 && !args[1].IsUndefined() {
        opts := args[1]
        if unsafeAllowAll := opts.Get("unsafeAllowAll"); !unsafeAllowAll.IsUndefined() && unsafeAllowAll.Bool() {
            options = append(options, a0.WithUnsafeAllowAll())
        }
        // Parse policy, tools, etc. from JS options
    }

    result, err := a0.Run(context.Background(), source, options...)
    if err != nil {
        return errorResult(err.Error())
    }
    return toJSValue(result.Value)
}
```

### JavaScript Usage

```javascript
// Load WASM module
const go = new Go();
const result = await WebAssembly.instantiateStreaming(
    fetch("a0.wasm"),
    go.importObject
);
go.run(result.instance);

// Use the API
const output = a0.run(`
    let x = { hello: "world" }
    return x
`);
console.log(output); // { hello: "world" }

// Check syntax
const diagnostics = a0.check(`
    let x = 42
    // missing return
`);
console.log(diagnostics); // [{ code: "E_NO_RETURN", ... }]
```

### WASM Tool Bridging

In WASM environments, tools that require I/O must be bridged to the host:

```go
//go:build js && wasm

// Create a tool that delegates to a JavaScript callback
func jsToolBridge(name string, mode a0.ToolMode, capID string) a0.ToolDef {
    return &a0.SimpleToolDef{
        ToolName: name,
        ToolMode: mode,
        CapID:    capID,
        ExecuteFn: func(ctx context.Context, args a0.A0Record) (a0.A0Value, error) {
            // Call JavaScript function registered by the host
            jsFn := js.Global().Get("__a0_tools").Get(name)
            if jsFn.IsUndefined() {
                return nil, fmt.Errorf("tool %s not available in this environment", name)
            }
            jsArgs := toJSValue(args)
            // Use Promise interop for async JS calls
            result := await(jsFn.Invoke(jsArgs))
            return fromJSValue(result), nil
        },
    }
}
```

### WASM Size Considerations

| Component | Estimated Size | Notes |
|-----------|---------------|-------|
| Go runtime | ~2-3 MB | WASM overhead |
| Lexer + Parser | ~200 KB | Chevrotain equivalent |
| Evaluator | ~100 KB | Core execution |
| Stdlib | ~50 KB | Pure functions |
| Tools (stubs) | ~10 KB | Just interfaces, host provides impl |
| **Total** | **~2.5-3.5 MB** | Before compression |
| **gzip** | **~800 KB - 1.2 MB** | Typical compression ratio |

Use TinyGo for smaller WASM builds if the standard Go WASM output is too large:

```bash
tinygo build -o a0.wasm -target wasm ./cmd/a0-wasm
```

TinyGo can reduce the binary to ~500 KB - 1 MB but has limitations (no reflection, limited stdlib).

---

## 10. TypeScript vs Go CLI Comparison

### Command Mapping

| TypeScript | Go | Notes |
|-----------|-----|-------|
| `commander` | `cobra` | Cobra has more features (completion, etc.) |
| `process.exit(code)` | `os.Exit(code)` | |
| `process.argv` | `os.Args` | Handled by cobra |
| `process.cwd()` | `os.Getwd()` | |
| `process.env` | `os.Environ()` | |
| `process.stdout.write()` | `fmt.Print()` | |
| `console.error()` | `fmt.Fprintln(os.Stderr, ...)` | |
| `fs.readFileSync()` | `os.ReadFile()` | |
| `fs.writeFileSync()` | `os.WriteFile()` | |
| `crypto.randomUUID()` | `uuid.New().String()` | `github.com/google/uuid` |
| JSON `require()` version | `-ldflags` | Build-time version injection |

### Output Format Compatibility

The Go CLI must produce identical output to the TypeScript CLI for:

1. **Diagnostic messages** - Both `--pretty` and JSON formats
2. **Trace JSONL** - Same event structure and field names
3. **Evidence JSON** - Same schema
4. **Policy output** - Both human-readable and JSON
5. **Help text** - Same content (may differ in wrapping)
6. **Result JSON** - `json.MarshalIndent` with 2-space indent matches `JSON.stringify(v, null, 2)`

### Error Output Format

**JSON (default):**
```json
{"code":"E_PARSE","message":"Unexpected token at line 3, col 5","span":{"startLine":3,"startCol":5,"endLine":3,"endCol":10,"file":"test.a0"}}
```

**Pretty (`--pretty`):**
```
error[E_PARSE]: Unexpected token at line 3, col 5
  --> test.a0:3:5
  hint: Check for missing braces or incorrect syntax
```

```go
func formatDiagnostic(d Diagnostic, pretty bool) string {
    if pretty {
        var sb strings.Builder
        fmt.Fprintf(&sb, "error[%s]: %s", d.Code, d.Message)
        if d.Span != nil {
            fmt.Fprintf(&sb, "\n  --> %s:%d:%d", d.Span.File, d.Span.StartLine, d.Span.StartCol)
        }
        if d.Hint != "" {
            fmt.Fprintf(&sb, "\n  hint: %s", d.Hint)
        }
        return sb.String()
    }
    data, _ := json.Marshal(d)
    return string(data)
}
```

---

## 11. Progressive Help System

### Content Storage

Help content is stored as string constants in Go, mirroring the TypeScript `help-content.ts`:

```go
package cli

const QuickRef = `
A0 QUICK REFERENCE (v0.5)
=========================
...
`

var topics = map[string]string{
    "syntax":      syntaxHelp,
    "types":       typesHelp,
    "tools":       toolsHelp,
    "stdlib":      stdlibHelp,
    "caps":        capsHelp,
    "budget":      budgetHelp,
    "flow":        flowHelp,
    "diagnostics": diagnosticsHelp,
    "examples":    examplesHelp,
}

var topicList = []string{
    "syntax", "types", "tools", "stdlib", "caps",
    "budget", "flow", "diagnostics", "examples",
}
```

### Topic Resolution

Supports prefix matching (e.g., `"diag"` -> `"diagnostics"`):

```go
func resolveTopic(input string) (string, bool) {
    normalized := strings.ToLower(strings.TrimSpace(input))

    // Exact match
    if _, ok := topics[normalized]; ok {
        return normalized, true
    }

    // Prefix match
    var matches []string
    for _, topic := range topicList {
        if strings.HasPrefix(topic, normalized) {
            matches = append(matches, topic)
        }
    }
    if len(matches) == 1 {
        return matches[0], true
    }
    return "", false
}
```

### Stdlib Index

The `--index` flag with the `stdlib` topic prints a numbered list of all stdlib functions:

```go
func renderStdlibIndex(stdlibFns map[string]a0.StdlibFn) string {
    names := make([]string, 0, len(stdlibFns))
    for name := range stdlibFns {
        names = append(names, name)
    }
    sort.Strings(names)

    var sb strings.Builder
    sb.WriteString("A0 STDLIB INDEX\n")
    sb.WriteString("===============\n\n")
    width := len(fmt.Sprint(len(names)))
    for i, name := range names {
        fmt.Fprintf(&sb, "  %*d. %s\n", width, i+1, name)
    }
    fmt.Fprintf(&sb, "\nTotal: %d\n", len(names))
    sb.WriteString("\nMore details:\n  a0 help stdlib\n")
    return sb.String()
}
```

---

## 12. Testing Strategy

### CLI Integration Tests

Test the CLI end-to-end by running the `a0` binary and checking exit codes and output:

```go
func TestRunCommand(t *testing.T) {
    tests := []struct {
        name     string
        args     []string
        input    string  // stdin content (for "-" file arg)
        wantCode int
        wantOut  string  // substring match on stdout
        wantErr  string  // substring match on stderr
    }{
        {
            name:     "simple program",
            args:     []string{"run", "testdata/hello.a0", "--unsafe-allow-all"},
            wantCode: 0,
            wantOut:  `"result"`,
        },
        {
            name:     "parse error",
            args:     []string{"run", "testdata/bad-syntax.a0"},
            wantCode: 2,
            wantErr:  "E_PARSE",
        },
        {
            name:     "capability denied",
            args:     []string{"run", "testdata/needs-cap.a0"},
            wantCode: 3,
            wantErr:  "E_CAP_DENIED",
        },
        {
            name:     "check valid",
            args:     []string{"check", "testdata/hello.a0"},
            wantCode: 0,
            wantOut:  "[]",
        },
        {
            name:     "check with stable-json",
            args:     []string{"check", "testdata/hello.a0", "--stable-json"},
            wantCode: 0,
            wantOut:  `{"ok":true,"errors":[]}`,
        },
        {
            name:     "fmt to stdout",
            args:     []string{"fmt", "testdata/hello.a0"},
            wantCode: 0,
        },
        {
            name:     "unknown command",
            args:     []string{"nonexistent"},
            wantCode: 1,
        },
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            cmd := exec.Command("./a0", tt.args...)
            var stdout, stderr bytes.Buffer
            cmd.Stdout = &stdout
            cmd.Stderr = &stderr
            if tt.input != "" {
                cmd.Stdin = strings.NewReader(tt.input)
            }
            err := cmd.Run()
            code := 0
            if exitErr, ok := err.(*exec.ExitError); ok {
                code = exitErr.ExitCode()
            }
            if code != tt.wantCode {
                t.Errorf("exit code = %d, want %d\nstdout: %s\nstderr: %s",
                    code, tt.wantCode, stdout.String(), stderr.String())
            }
            if tt.wantOut != "" && !strings.Contains(stdout.String(), tt.wantOut) {
                t.Errorf("stdout missing %q\ngot: %s", tt.wantOut, stdout.String())
            }
            if tt.wantErr != "" && !strings.Contains(stderr.String(), tt.wantErr) {
                t.Errorf("stderr missing %q\ngot: %s", tt.wantErr, stderr.String())
            }
        })
    }
}
```

### Embedding API Tests

Test the high-level and low-level embedding APIs:

```go
func TestEmbeddingRun(t *testing.T) {
    result, err := a0.Run(context.Background(), `
        let x = 42
        return x
    `)
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    if result.Value != float64(42) {
        t.Errorf("got %v, want 42", result.Value)
    }
}

func TestEmbeddingCustomTool(t *testing.T) {
    counter := 0
    tool := &a0.SimpleToolDef{
        ToolName: "test.inc",
        ToolMode: a0.ToolModeRead,
        CapID:    "test.inc",
        ExecuteFn: func(ctx context.Context, args a0.A0Record) (a0.A0Value, error) {
            counter++
            return float64(counter), nil
        },
    }

    result, err := a0.Run(context.Background(), `
        cap { test.inc: true }
        call? test.inc {} -> a
        call? test.inc {} -> b
        return { a: a, b: b }
    `,
        a0.WithTool(tool),
        a0.WithPolicy(a0.Policy{Allow: []string{"test.inc"}}),
    )
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    rec, _ := a0.AsRecord(result.Value)
    if rec["a"] != float64(1) || rec["b"] != float64(2) {
        t.Errorf("unexpected result: %v", result.Value)
    }
}

func TestEmbeddingContextCancellation(t *testing.T) {
    ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
    defer cancel()

    _, err := a0.Run(ctx, `
        cap { sh.exec: true }
        do sh.exec { cmd: "sleep 10" } -> r
        return r
    `, a0.WithUnsafeAllowAll())

    if err == nil {
        t.Error("expected timeout error")
    }
}
```

### Policy Tests

```go
func TestPolicyResolution(t *testing.T) {
    // Create temp directory with policy file
    dir := t.TempDir()
    policyPath := filepath.Join(dir, ".a0policy.json")
    os.WriteFile(policyPath, []byte(`{
        "version": 1,
        "allow": ["fs.read", "http.get"],
        "deny": ["sh.exec"]
    }`), 0644)

    resolved := a0.ResolvePolicy(dir, "")
    if resolved.Source != "project" {
        t.Errorf("expected source=project, got %s", resolved.Source)
    }

    caps := a0.BuildAllowedCaps(resolved.Policy, false)
    if !caps["fs.read"] {
        t.Error("expected fs.read to be allowed")
    }
    if caps["sh.exec"] {
        t.Error("expected sh.exec to be denied")
    }
}

func TestPolicyUnsafeAllowAll(t *testing.T) {
    caps := a0.BuildAllowedCaps(a0.Policy{}, true)
    for _, cap := range []string{"fs.read", "fs.write", "http.get", "sh.exec"} {
        if !caps[cap] {
            t.Errorf("expected %s to be allowed with unsafeAllowAll", cap)
        }
    }
}
```

### Cross-Platform Conformance

Create shared test fixtures (A0 source files with expected outputs) that both the TypeScript and Go CLIs validate against:

```
testdata/
  conformance/
    hello.a0                    # source
    hello.expected.json         # expected stdout (JSON)
    hello.expected.exit         # expected exit code
    parse-error.a0
    parse-error.expected.stderr # expected stderr substring
    parse-error.expected.exit
```

```go
func TestConformance(t *testing.T) {
    entries, _ := os.ReadDir("testdata/conformance")
    for _, entry := range entries {
        if !strings.HasSuffix(entry.Name(), ".a0") {
            continue
        }
        name := strings.TrimSuffix(entry.Name(), ".a0")
        t.Run(name, func(t *testing.T) {
            source := filepath.Join("testdata/conformance", entry.Name())
            expectedExitFile := filepath.Join("testdata/conformance", name+".expected.exit")

            exitData, _ := os.ReadFile(expectedExitFile)
            expectedExit, _ := strconv.Atoi(strings.TrimSpace(string(exitData)))

            cmd := exec.Command("./a0", "run", source, "--unsafe-allow-all")
            var stdout, stderr bytes.Buffer
            cmd.Stdout = &stdout
            cmd.Stderr = &stderr
            err := cmd.Run()

            code := 0
            if exitErr, ok := err.(*exec.ExitError); ok {
                code = exitErr.ExitCode()
            }
            if code != expectedExit {
                t.Errorf("exit code = %d, want %d", code, expectedExit)
            }

            // Check stdout if expected file exists
            expectedOutFile := filepath.Join("testdata/conformance", name+".expected.json")
            if expectedOut, err := os.ReadFile(expectedOutFile); err == nil {
                if strings.TrimSpace(stdout.String()) != strings.TrimSpace(string(expectedOut)) {
                    t.Errorf("stdout mismatch:\ngot:  %s\nwant: %s",
                        stdout.String(), string(expectedOut))
                }
            }
        })
    }
}
```
