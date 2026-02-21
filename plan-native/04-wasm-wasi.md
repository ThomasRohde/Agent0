# 04 - WebAssembly and WASI Integration

## Overview

A0's design as a capability-gated, sandboxed scripting language makes it a natural fit for WebAssembly. This document covers compiling the Go A0 runtime to WASM, integrating with WASI for server-side/edge execution, bridging to JavaScript for browser use, and deploying to edge function platforms.

## Compiler Selection: TinyGo vs Standard Go

### Standard Go Compiler (`GOOS=js GOARCH=wasm`)

**Pros:**
- Full Go standard library support
- No language feature restrictions
- Official Go team maintenance
- Supports `GOOS=wasip1` target (Go 1.21+) for WASI Preview 1

**Cons:**
- Large binary sizes: typically 10-20 MB for non-trivial programs
- Includes Go runtime, garbage collector, goroutine scheduler in full
- Slow startup time due to large binary initialization

### TinyGo (`tinygo build -target wasi`)

**Pros:**
- Much smaller binaries: typically 0.5-5 MB for equivalent programs
- Faster startup (less memory to initialize)
- Purpose-built for WASM/embedded targets
- Good WASI support
- Supports both WASI and JS/WASM targets

**Cons:**
- Subset of standard library (most of `os`, `net/http` unavailable — acceptable since A0 tools abstract these)
- Some Go features unsupported (reflection limitations, some `sync` primitives)
- Separate toolchain to install and maintain
- Occasionally lags behind Go releases

### Recommendation: Dual-target with TinyGo as primary WASM compiler

The A0 runtime's core (lexer, parser, validator, evaluator, stdlib) uses no reflection and minimal standard library, making it TinyGo-compatible. Use TinyGo for WASM builds and standard Go for native builds:

| Target | Compiler | Estimated Binary Size |
|--------|----------|-----------------------|
| Native CLI (linux/amd64) | `go build` | 8-12 MB |
| WASM+WASI (edge) | `tinygo -target wasi` | 1-3 MB |
| WASM+JS (browser) | `tinygo -target wasm` | 1-3 MB |
| WASM+WASI (fallback) | `GOOS=wasip1 go build` | 12-18 MB |

## WASI Support Levels

### WASI Preview 1 (Current Standard)

WASI Preview 1 is the stable, widely-deployed standard supported by all major runtimes (Wasmtime, Wasmer, WasmEdge, Node.js, Deno, browser polyfills). Go 1.21+ supports `GOOS=wasip1 GOARCH=wasm`. TinyGo supports `-target wasi` (Preview 1).

**Available syscalls relevant to A0:**
- `fd_read`, `fd_write`, `fd_seek`, `fd_close` — file I/O
- `path_open`, `path_create_directory`, `path_readlink` — filesystem
- `fd_readdir` — directory listing
- `clock_time_get` — timers (for budget enforcement)
- `args_get`, `environ_get` — CLI arguments and environment
- `proc_exit` — exit codes

**Not available in WASI Preview 1:**
- Network sockets (no raw TCP/UDP)
- Process spawning (no `exec`/`fork`)
- Shared memory / threads (limited; WASI threads proposal in progress)

### WASI Preview 2 (Component Model)

WASI Preview 2 is the next generation, based on the Component Model with typed interfaces:
- `wasi:filesystem` — full filesystem access
- `wasi:http/outgoing-handler` — HTTP client requests
- `wasi:cli` — command-line arguments, environment, I/O
- `wasi:sockets` — network sockets
- `wasi:clocks` — monotonic and wall clocks
- `wasi:random` — cryptographic randomness

Preview 2 is supported by Wasmtime 14+, and Component Model support is maturing in TinyGo (via `wit-bindgen`). However, browser runtimes and many edge platforms still use Preview 1.

### Strategy: Target Preview 1, prepare for Preview 2

Build against WASI Preview 1 for maximum portability. Abstract tool I/O behind interfaces so that Preview 2 `wasi:http` and `wasi:filesystem` can be swapped in via build tags when ecosystem support matures.

## A0 Capability to WASI Mapping

### Mapping Table

| A0 Capability | A0 Tools | WASI Preview 1 | WASI Preview 2 | Browser (JS Bridge) |
|---------------|----------|-----------------|-----------------|---------------------|
| `fs.read` | `fs.read`, `fs.list`, `fs.exists` | `path_open` + `fd_read` + `fd_readdir` | `wasi:filesystem/read` | Host-injected virtual FS or IndexedDB |
| `fs.write` | `fs.write` | `path_open` + `fd_write` | `wasi:filesystem/write` | Host-injected virtual FS |
| `http.get` | `http.get` | N/A (requires host function) | `wasi:http/outgoing-handler` | `fetch()` via JS bridge |
| `sh.exec` | `sh.exec` | N/A (not available) | N/A (not planned) | N/A (blocked/stubbed) |

### Tool Implementation by Platform

#### fs.read, fs.list, fs.exists (WASI)

WASI Preview 1 provides filesystem access through preopened directories. The WASM host must grant access to specific directories at instantiation time:

```bash
# Wasmtime example: grant read access to /data
wasmtime --dir=/data::/ a0.wasm run program.a0
```

The Go implementation uses standard `os.ReadFile` / `os.ReadDir` which TinyGo maps to WASI syscalls automatically:

```go
//go:build wasm

package tools

import "os"

func fsReadImpl(path string) (string, error) {
    data, err := os.ReadFile(path)
    if err != nil {
        return "", err
    }
    return string(data), nil
}
```

No special code is needed — TinyGo's `os` package translates to WASI `path_open` + `fd_read` transparently.

#### fs.write (WASI)

Same as `fs.read` — uses `os.WriteFile` which TinyGo maps to WASI `path_open` + `fd_write`:

```go
//go:build wasm

package tools

import (
    "crypto/sha256"
    "encoding/hex"
    "os"
    "path/filepath"
)

func fsWriteImpl(filePath string, data []byte) (int, string, error) {
    dir := filepath.Dir(filePath)
    if err := os.MkdirAll(dir, 0755); err != nil {
        return 0, "", err
    }
    if err := os.WriteFile(filePath, data, 0644); err != nil {
        return 0, "", err
    }
    hash := sha256.Sum256(data)
    return len(data), hex.EncodeToString(hash[:]), nil
}
```

#### http.get (Host Function Bridge)

WASI Preview 1 has no networking. HTTP must be bridged through host-imported functions:

```go
//go:build wasm

package tools

import "unsafe"

// Host function imports (provided by the WASM host)
//
//go:wasmimport env http_get
func hostHttpGet(urlPtr, urlLen uint32, headersPtr, headersLen uint32, resultPtr uint32) uint32

func httpGetImpl(url string, headers map[string]string) (*HttpResponse, error) {
    // Serialize headers to JSON bytes
    headersJSON, _ := json.Marshal(headers)

    // Call host function
    resultBuf := make([]byte, 1024*1024) // 1MB buffer
    urlBytes := []byte(url)

    code := hostHttpGet(
        uint32(uintptr(unsafe.Pointer(&urlBytes[0]))), uint32(len(urlBytes)),
        uint32(uintptr(unsafe.Pointer(&headersJSON[0]))), uint32(len(headersJSON)),
        uint32(uintptr(unsafe.Pointer(&resultBuf[0]))),
    )

    if code != 0 {
        return nil, fmt.Errorf("http_get host call failed with code %d", code)
    }

    // Deserialize response from resultBuf
    var resp HttpResponse
    if err := json.Unmarshal(resultBuf[:findNullTerminator(resultBuf)], &resp); err != nil {
        return nil, err
    }
    return &resp, nil
}
```

The host (Wasmtime, browser JS, edge runtime) implements `http_get` and satisfies the import.

#### sh.exec (Platform-Dependent)

`sh.exec` is inherently platform-dependent and unavailable in WASI:

| Platform | sh.exec Behavior |
|----------|-----------------|
| Native CLI | Full `os/exec` support |
| WASI (Wasmtime, etc.) | Returns error: "sh.exec is not available in WASM mode" |
| Browser | Returns error: "sh.exec is not available in browser mode" |
| Edge (Cloudflare Workers) | Returns error: not available |

```go
//go:build wasm

package tools

import "github.com/a0-lang/a0/pkg/ast"

func shExecImpl(cmd string, cwd string, timeoutMs int, env map[string]string) (ast.A0Value, error) {
    return nil, fmt.Errorf("sh.exec is not available in WASM mode")
}
```

A0 programs using `sh.exec` will fail at runtime with `E_TOOL` in WASM mode. The validator could optionally warn about this for WASM targets with a `--target wasm` flag.

## Browser Execution Model

### Architecture

```
┌─────────────────────────────────────────────────┐
│                Browser (JavaScript)              │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │           JavaScript Host Layer           │   │
│  │  - Loads WASM module                      │   │
│  │  - Provides host function imports         │   │
│  │  - Bridges async JS ↔ sync WASM calls     │   │
│  │  - Manages virtual filesystem             │   │
│  └──────────────┬───────────────────────────┘   │
│                 │                                 │
│  ┌──────────────▼───────────────────────────┐   │
│  │         A0 WASM Module (TinyGo)           │   │
│  │  - Lexer, Parser, Validator               │   │
│  │  - Evaluator with scope chain             │   │
│  │  - Stdlib (pure functions)                │   │
│  │  - Tool stubs calling host imports        │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### JavaScript Glue Code

The JS host loads the WASM module and provides tool implementations:

```javascript
// a0-wasm-loader.js

class A0WasmRuntime {
  constructor() {
    this.instance = null;
    this.memory = null;
    this.virtualFS = new Map(); // in-memory virtual filesystem
  }

  async load(wasmUrl) {
    const importObject = {
      env: {
        // Host function: http.get bridge
        http_get: (urlPtr, urlLen, headersPtr, headersLen, resultPtr) => {
          return this._bridgeHttpGet(urlPtr, urlLen, headersPtr, headersLen, resultPtr);
        },

        // Host function: fs.read bridge (virtual filesystem)
        fs_read: (pathPtr, pathLen, resultPtr, resultMaxLen) => {
          return this._bridgeFsRead(pathPtr, pathLen, resultPtr, resultMaxLen);
        },

        // Host function: fs.write bridge (virtual filesystem)
        fs_write: (pathPtr, pathLen, dataPtr, dataLen, resultPtr) => {
          return this._bridgeFsWrite(pathPtr, pathLen, dataPtr, dataLen, resultPtr);
        },
      },
      wasi_snapshot_preview1: this._wasiPolyfill(),
    };

    const response = await fetch(wasmUrl);
    const wasmBytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(wasmBytes, importObject);

    this.instance = instance;
    this.memory = instance.exports.memory;
  }

  // Run an A0 program
  run(source, filename = "<input>") {
    const sourceBytes = new TextEncoder().encode(source);
    // Copy source into WASM memory, call exported run function
    const ptr = this._allocate(sourceBytes.length);
    new Uint8Array(this.memory.buffer, ptr, sourceBytes.length).set(sourceBytes);

    const resultPtr = this.instance.exports.a0_run(ptr, sourceBytes.length);
    return this._readResult(resultPtr);
  }

  // Pre-populate the virtual filesystem
  addFile(path, content) {
    this.virtualFS.set(path, content);
  }

  _bridgeHttpGet(urlPtr, urlLen, headersPtr, headersLen, resultPtr) {
    // Read URL from WASM memory
    const url = this._readString(urlPtr, urlLen);
    const headers = JSON.parse(this._readString(headersPtr, headersLen) || "{}");

    // Synchronous XMLHttpRequest (browser) — or use Atomics.wait + SharedArrayBuffer
    // for async fetch bridging
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url, false); // synchronous
    for (const [k, v] of Object.entries(headers)) {
      xhr.setRequestHeader(k, v);
    }
    xhr.send();

    const result = JSON.stringify({
      status: xhr.status,
      headers: this._parseResponseHeaders(xhr.getAllResponseHeaders()),
      body: xhr.responseText,
    });

    this._writeString(resultPtr, result);
    return 0;
  }
}
```

### Async Bridging Challenge

The Go A0 evaluator runs synchronously from WASM's perspective (blocking calls). JavaScript's `fetch` API is async. There are several strategies:

**Option A: Synchronous XMLHttpRequest (simplest, limited)**
- Use `XMLHttpRequest` with `async: false` for `http.get`
- Works in main thread only (deprecated, may be removed)
- Blocks the browser UI thread

**Option B: Asyncify (recommended for TinyGo)**
- TinyGo supports [Asyncify](https://emscripten.org/docs/porting/asyncify.html), which transforms the WASM binary to allow unwinding/rewinding the call stack
- The host pauses WASM execution at a host call, performs the async operation, then resumes
- Adds ~10-20% binary size overhead and some runtime overhead
- Best option for full `fetch()` integration without blocking

```go
// With Asyncify, the Go code looks the same — the transform happens
// at the WASM binary level, making blocking Go calls become
// suspendable/resumable from the JS host's perspective.
```

**Option C: Web Worker + SharedArrayBuffer**
- Run WASM in a Web Worker
- Worker uses `Atomics.wait()` to block while main thread performs fetch
- Main thread signals completion via `Atomics.notify()`
- Requires `Cross-Origin-Isolation` headers (`COOP`/`COEP`)
- Most robust for complex async patterns

**Recommendation:** Use Asyncify for the initial browser target. It requires the least architectural change and TinyGo supports it. If Asyncify overhead proves problematic, migrate to the Web Worker approach.

### Memory Management Between JS and WASM

WASM has a linear memory model. Data exchange between JS and WASM uses:

1. **String passing:** JS encodes strings to UTF-8, copies into WASM linear memory at an allocated offset, passes (ptr, len) to WASM. WASM reads from that offset. Return path is the reverse.

2. **JSON serialization for complex values:** A0Values (records, lists) are serialized to JSON when crossing the JS/WASM boundary. This avoids complex shared-memory data structures.

3. **Memory allocation:** The WASM module exports `a0_alloc(size) -> ptr` and `a0_free(ptr, size)` functions that the JS host calls to manage WASM-side memory.

```go
// Exported allocation functions for the JS host
//export a0_alloc
func a0Alloc(size uint32) uint32 {
    buf := make([]byte, size)
    return uint32(uintptr(unsafe.Pointer(&buf[0])))
}

//export a0_free
func a0Free(ptr uint32, size uint32) {
    // GC handles this in Go — this is a hint for future manual management
}
```

4. **Result passing:** The WASM `a0_run` function writes its result (JSON-encoded `ExecResult`) to a pre-allocated buffer and returns the length written. The JS host reads and parses the JSON.

## Edge Function Deployment

### Cloudflare Workers

Cloudflare Workers support WASM modules up to 1 MB compressed (free tier) or 10 MB (paid). A0's TinyGo WASM binary (1-3 MB) fits within paid tier limits.

```javascript
// worker.js — Cloudflare Worker with A0 WASM
import a0Wasm from './a0.wasm';

export default {
  async fetch(request, env) {
    const a0 = await initA0(a0Wasm, {
      // http.get bridge uses Cloudflare's fetch()
      httpGet: async (url, headers) => {
        const resp = await fetch(url, { headers });
        return {
          status: resp.status,
          headers: Object.fromEntries(resp.headers),
          body: await resp.text(),
        };
      },
      // fs.read/write uses Cloudflare KV or R2
      fsRead: async (path) => {
        return await env.A0_FILES.get(path);
      },
      fsWrite: async (path, data) => {
        await env.A0_FILES.put(path, data);
        return { kind: "file", path, bytes: data.length };
      },
    });

    const source = await request.text();
    const result = a0.run(source);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
```

**Constraints:**
- 10ms CPU time (free) / 50ms (paid) per invocation — A0 budget `timeMs` should be configured accordingly
- No `sh.exec` available
- Filesystem via KV/R2, not POSIX

### Vercel Edge Functions

Vercel Edge Functions support WASM via the Edge Runtime (based on V8 isolates):

```typescript
// api/a0-run.ts — Vercel Edge Function
import { initA0 } from './a0-wasm-loader';

export const config = { runtime: 'edge' };

export default async function handler(request: Request) {
  const a0 = await initA0();
  const { source, files } = await request.json();

  // Pre-populate virtual filesystem
  for (const [path, content] of Object.entries(files || {})) {
    a0.addFile(path, content);
  }

  const result = a0.run(source);
  return new Response(JSON.stringify(result));
}
```

**Constraints:**
- 25 MB max function size (including WASM)
- 30s execution time limit
- No filesystem — must use virtual FS or external storage

### Deno Deploy

Deno has first-class WASM and WASI support:

```typescript
// main.ts — Deno Deploy
import Context from "https://deno.land/std/wasi/snapshot_preview1.ts";

const context = new Context({
  args: ["a0", "run", "-"],
  env: {},
  preopens: { "/": "/tmp/a0-sandbox" },
});

const binary = await Deno.readFile("./a0.wasm");
const module = await WebAssembly.compile(binary);
const instance = await WebAssembly.instantiate(module, {
  wasi_snapshot_preview1: context.exports,
});

context.start(instance);
```

**Advantages:**
- Native WASI support (no custom host function bridge needed for filesystem)
- Generous limits (50ms CPU, 128 MB memory)
- `fetch()` available for `http.get` bridge

### Fastly Compute

Fastly Compute runs WASM modules with full WASI Preview 1 support:

```rust
// Fastly uses Rust for the host shim, but the WASM module is our Go binary
// The platform handles WASI imports natively.
```

**Advantages:**
- Full WASI Preview 1 (filesystem, clocks, random)
- `fastly:http` for HTTP backend requests
- 100ms startup budget, generous compute limits

**Constraints:**
- No `sh.exec` (no process spawning)
- Filesystem is ephemeral (per-request tmpfs)

### Edge Platform Summary

| Platform | WASM Size Limit | Execution Limit | Filesystem | HTTP | sh.exec |
|----------|----------------|-----------------|------------|------|---------|
| Cloudflare Workers | 10 MB (paid) | 50ms CPU (paid) | KV/R2 (bridged) | fetch() | No |
| Vercel Edge | 25 MB | 30s wall clock | Virtual only | fetch() | No |
| Deno Deploy | No hard limit | 50ms CPU | tmpfs (WASI) | fetch() | No |
| Fastly Compute | 100 MB | Generous | tmpfs (WASI) | Backend fetch | No |
| Wasmtime (server) | No limit | No limit | Preopened dirs | Host function | No |

## Sandboxed Execution

### WASI Capability Security Alignment

WASI's security model is capability-based, aligning directly with A0's capability model:

| A0 Concept | WASI Equivalent |
|-----------|-----------------|
| `cap { fs.read: true }` | WASI preopened directory (read) |
| `cap { fs.write: true }` | WASI preopened directory (read+write) |
| `cap { http.get: true }` | Host function import present |
| `cap { sh.exec: true }` | N/A (never available in WASI) |
| `.a0policy.json` allow list | WASI instantiation-time grants |

**Double-gating:** A0's capability policy acts as an inner sandbox within WASI's outer sandbox. Even if the WASI host grants filesystem access, A0 programs without `cap { fs.read: true }` cannot read files. This defense-in-depth is a significant security advantage.

### Resource Limits Mapping

A0 budgets map to WASM resource controls:

| A0 Budget | WASM Enforcement |
|-----------|-----------------|
| `timeMs` | `context.WithTimeout()` in Go + WASM host fuel/epoch interrupts |
| `maxToolCalls` | Tracked in evaluator (same as native) |
| `maxBytesWritten` | Tracked in evaluator (same as native) |
| `maxIterations` | Tracked in evaluator (same as native) |

Additionally, WASM hosts can enforce:
- **Memory limits:** Maximum linear memory growth (e.g., 64 MB)
- **Fuel/epoch interrupts:** Wasmtime's fuel mechanism can limit total instruction count
- **Wall clock timeout:** Host-level timeout wrapping the entire WASM execution

```rust
// Wasmtime host configuration example
let mut config = Config::new();
config.consume_fuel(true);
config.epoch_interruption(true);

let engine = Engine::new(&config)?;
let mut store = Store::new(&engine, ());
store.set_fuel(1_000_000)?; // Limit total instructions
store.set_epoch_deadline(1); // Check every epoch

// In a separate thread: advance the epoch periodically
std::thread::spawn(move || {
    loop {
        std::thread::sleep(Duration::from_millis(10));
        engine.increment_epoch();
    }
});
```

### Isolation Guarantees

| Guarantee | Mechanism |
|-----------|-----------|
| Memory isolation | WASM linear memory — no access to host memory |
| No arbitrary syscalls | WASI restricts to declared imports |
| No filesystem escape | Preopened directories only; path traversal blocked by WASI |
| No network access (P1) | No socket APIs; HTTP via explicit host bridge |
| Deterministic execution | Same A0 program + inputs = same outputs (modulo tool I/O) |
| Resource bounded | Fuel, epoch interrupts, memory limits + A0 budgets |

## Performance Considerations

### Startup Time

| Metric | Native Go | WASM (TinyGo) | WASM (Standard Go) |
|--------|-----------|----------------|---------------------|
| Binary load | N/A | 5-20 ms | 50-100 ms |
| Initialization | 1-5 ms | 5-30 ms | 30-100 ms |
| First parse | < 1 ms | 1-3 ms | 2-5 ms |
| **Total cold start** | **< 10 ms** | **10-50 ms** | **80-200 ms** |

TinyGo's smaller binary gives significantly better cold-start performance, which is critical for edge functions where cold starts are frequent.

**Mitigation strategies:**
- **Module caching:** Pre-compile WASM to native code (Wasmtime AOT, Cloudflare module caching)
- **Instance pooling:** Reuse initialized WASM instances across requests
- **Snapshot/restore:** Use Wasmtime's `Module::deserialize()` for instant startup

### Memory Usage

| Component | Native Go | WASM (TinyGo) |
|-----------|-----------|----------------|
| Runtime baseline | 5-10 MB | 1-3 MB |
| Per-program overhead | < 1 MB | < 1 MB |
| Scope chain (100 bindings) | ~10 KB | ~10 KB |
| 1000-element list | ~50 KB | ~50 KB |

WASM memory is linear and grows in 64 KB pages. TinyGo's runtime is leaner, using less baseline memory.

### Execution Speed

Expected performance relative to the TypeScript (Node.js) implementation:

| Workload | Native Go vs Node.js | WASM (TinyGo) vs Node.js |
|----------|---------------------|--------------------------|
| Pure computation (loops, arithmetic) | 2-5x faster | 0.8-1.5x (roughly parity) |
| String operations | 1.5-3x faster | 0.7-1.2x |
| Tool I/O (fs.read, http.get) | Similar (I/O bound) | Similar (I/O bound) |
| JSON parse/serialize | 2-4x faster | 0.8-1.5x |
| Overall program execution | 2-4x faster | 0.8-1.5x |

WASM execution is typically 60-80% of native speed due to sandboxing overhead, bounds checking, and limited SIMD/optimization opportunity. For A0 programs, which are typically I/O-bound (tool calls dominate), the difference is negligible.

## Host Function Interface Design

### Exported Functions (WASM -> Host)

The WASM module exports these functions for the host to call:

```go
//export a0_run
func a0Run(sourcePtr, sourceLen uint32, filenamePtr, filenameLen uint32, optsPtr, optsLen uint32) uint32

//export a0_check
func a0Check(sourcePtr, sourceLen uint32, filenamePtr, filenameLen uint32) uint32

//export a0_fmt
func a0Fmt(sourcePtr, sourceLen uint32) uint32

//export a0_alloc
func a0Alloc(size uint32) uint32

//export a0_free
func a0Free(ptr, size uint32)

//export a0_result_ptr
func a0ResultPtr() uint32

//export a0_result_len
func a0ResultLen() uint32
```

Protocol:
1. Host calls `a0_alloc` to allocate WASM memory for the source text
2. Host copies source bytes into WASM memory
3. Host calls `a0_run(sourcePtr, sourceLen, ...)`
4. WASM module runs the program, calling imported host functions for tools
5. WASM module writes JSON result to an internal buffer
6. Host calls `a0_result_ptr()` and `a0_result_len()` to read the result
7. Host copies result bytes out and parses JSON

### Imported Functions (Host -> WASM)

The WASM module imports these functions from the host:

```go
// Tool bridges — host must provide these

//go:wasmimport env a0_http_get
func hostHttpGet(urlPtr, urlLen, headersPtr, headersLen, resultBufPtr, resultBufLen uint32) int32

//go:wasmimport env a0_trace_emit
func hostTraceEmit(eventPtr, eventLen uint32)
```

For WASI targets, standard WASI imports (`fd_read`, `fd_write`, etc.) handle filesystem tools automatically — no custom imports needed for `fs.read`/`fs.write`.

### Interface Definition (WIT Format — Preview 2)

For future WASI Preview 2 / Component Model integration:

```wit
// a0.wit — A0 runtime world definition

package a0:runtime@0.1.0;

interface types {
    record exec-options {
        unsafe-allow-all: bool,
        trace: bool,
    }

    record exec-result {
        value: string,       // JSON-encoded A0Value
        evidence: string,    // JSON-encoded Evidence[]
        exit-code: u8,
    }
}

interface runtime {
    use types.{exec-options, exec-result};

    run: func(source: string, filename: string, opts: exec-options) -> exec-result;
    check: func(source: string, filename: string) -> exec-result;
    fmt: func(source: string) -> string;
}

world a0 {
    import wasi:filesystem/types@0.2.0;
    import wasi:filesystem/preopens@0.2.0;
    import wasi:http/outgoing-handler@0.2.0;
    import wasi:cli/environment@0.2.0;
    import wasi:clocks/monotonic-clock@0.2.0;

    export runtime;
}
```

## Testing Strategy for WASM Builds

### Conformance Testing

All WASM builds must pass the same test suite as the native build. The testing approach:

1. **Golden test corpus:** A shared set of `.a0` source files with expected output (JSON). Run against both native and WASM builds.

2. **WASM test runner:** A Node.js or Deno script that loads the WASM module, runs each test program, and compares output.

```javascript
// test-wasm.mjs — Node.js WASM test runner
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const wasmBytes = readFileSync('./a0.wasm');
const module = await WebAssembly.compile(wasmBytes);

const testDir = './tests/golden/';
const tests = readdirSync(testDir).filter(f => f.endsWith('.a0'));

for (const test of tests) {
    const source = readFileSync(join(testDir, test), 'utf-8');
    const expected = JSON.parse(readFileSync(join(testDir, test.replace('.a0', '.expected.json')), 'utf-8'));

    const instance = await WebAssembly.instantiate(module, importObject);
    const result = runA0(instance, source);

    assert.deepStrictEqual(result, expected, `WASM conformance failed for ${test}`);
}
```

3. **CI matrix:** Test across multiple WASM runtimes:
   - Node.js (V8 WASM engine)
   - Deno (V8)
   - Wasmtime (Cranelift)
   - Wasmer (Singlepass/Cranelift/LLVM)

### Platform-Specific Tests

- **Browser:** Playwright/Puppeteer tests loading the WASM module in a real browser
- **Cloudflare Workers:** Miniflare (local CF Workers emulator) integration tests
- **sh.exec unavailability:** Verify graceful error when A0 programs use `sh.exec` in WASM mode

### Binary Size Regression Tests

Track WASM binary size in CI to prevent regressions:

```yaml
# CI step
- name: Check WASM binary size
  run: |
    tinygo build -target wasi -o a0.wasm ./cmd/a0
    SIZE=$(stat -f%z a0.wasm 2>/dev/null || stat -c%s a0.wasm)
    echo "WASM binary size: $SIZE bytes"
    if [ "$SIZE" -gt 3145728 ]; then  # 3 MB threshold
      echo "ERROR: WASM binary exceeds 3 MB size budget"
      exit 1
    fi
```

## Build Configuration

### Makefile Targets

```makefile
# Native build
build-native:
	go build -o bin/a0 ./cmd/a0

# WASM+WASI build (TinyGo)
build-wasm-wasi:
	tinygo build -target wasi -o bin/a0.wasm ./cmd/a0

# WASM+JS build (TinyGo, for browser)
build-wasm-js:
	tinygo build -target wasm -o bin/a0-browser.wasm ./cmd/a0
	cp $(shell tinygo env TINYGOROOT)/targets/wasm_exec.js bin/

# WASM+WASI build (Standard Go, larger but full stdlib)
build-wasm-go:
	GOOS=wasip1 GOARCH=wasm go build -o bin/a0-go.wasm ./cmd/a0

# Optimized WASM (strip debug, optimize size)
build-wasm-release:
	tinygo build -target wasi -no-debug -opt=z -o bin/a0.wasm ./cmd/a0
	wasm-opt -Oz bin/a0.wasm -o bin/a0.wasm  # binaryen optimizer

# All targets
build-all: build-native build-wasm-wasi build-wasm-js
```

### Build Tags

```go
// Build tags control platform-specific tool implementations:
//
//   !wasm         — native (os, net/http, os/exec available)
//   wasm && wasi  — WASI target (os available via WASI, no net/http, no exec)
//   wasm && js    — Browser target (no os, host function bridges for everything)
```

## Migration Path

### Phase 1: Native Go CLI (no WASM)
- Implement all packages targeting `GOOS=linux/darwin/windows`
- Full test suite passing
- Feature parity with TypeScript implementation

### Phase 2: WASM+WASI (TinyGo)
- Add build tags separating native vs WASM tool implementations
- Stub `sh.exec` for WASM
- Implement host function bridge for `http.get`
- Verify all golden tests pass under Wasmtime
- Binary size < 3 MB

### Phase 3: Browser WASM
- Add JS glue code (`a0-wasm-loader.js`)
- Implement Asyncify-based async bridging for `http.get`
- Virtual filesystem for `fs.read`/`fs.write`
- Playwright browser tests
- Published as npm package: `@a0/wasm`

### Phase 4: Edge Deployment
- Cloudflare Worker template
- Vercel Edge Function template
- Deno Deploy example
- Documentation and deployment guides
