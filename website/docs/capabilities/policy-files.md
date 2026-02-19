---
sidebar_position: 2
---

# Policy Files

Policy files control which capabilities are allowed at runtime. They are JSON files that list the capabilities a program is permitted to use.

## Policy File Format

```json
{
  "version": 1,
  "allow": ["http.get", "fs.read"],
  "deny": ["sh.exec"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `version` | number | Policy format version (currently `1`) |
| `allow` | string[] | List of capability identifiers to permit |
| `deny` | string[] | Optional list of capabilities to explicitly deny (overrides `allow`) |
| `limits` | object | Optional resource limits (reserved for future use) |

When both `allow` and `deny` are present, `deny` takes precedence -- a capability listed in both will be denied.

The `allow` array accepts any combination of the four A0 capabilities:

- `fs.read` -- read files from the filesystem
- `fs.write` -- write files to the filesystem
- `http.get` -- make HTTP GET requests
- `sh.exec` -- execute shell commands

## Resolution Order

When `a0 run` loads a policy, it checks these locations in order:

1. **Project-local**: `.a0policy.json` in the current working directory
2. **User-level**: `~/.a0/policy.json` in the user's home directory
3. **Default**: deny all capabilities

The first valid policy file is used. If a policy file exists but is malformed or has an invalid shape, it is ignored and resolution continues to the next location. If no valid file exists, the default deny-all policy applies -- every capability request will fail with `E_CAP_DENIED`.

```
.a0policy.json          <-- checked first (project-local)
~/.a0/policy.json       <-- checked second (user-level)
(deny all)              <-- fallback default
```

## Inspect Effective Resolution

Use the CLI to see which policy source is active and what the effective allowlist is:

```bash
a0 policy
```

For machine consumption:

```bash
a0 policy --json
```

This is useful when policy behavior is unexpected (for example, project policy malformed and user policy taking effect).

## Setting Up Policies

### Project-Local Policy

Create `.a0policy.json` in your project root. This policy applies to all programs run from that directory:

```bash
cat > .a0policy.json << 'EOF'
{
  "version": 1,
  "allow": ["http.get", "fs.read"]
}
EOF
```

This allows programs to read files and make HTTP requests, but blocks filesystem writes and shell execution.

### User-Level Policy

Create a user-level policy that applies when no project-local policy exists:

```bash
mkdir -p ~/.a0
cat > ~/.a0/policy.json << 'EOF'
{
  "version": 1,
  "allow": ["fs.read"]
}
EOF
```

### Read-Only Policy

Allow only read operations with no side effects:

```json
{
  "version": 1,
  "allow": ["fs.read", "http.get"]
}
```

### Full Access Policy

Allow all capabilities (equivalent to `--unsafe-allow-all`, but explicit):

```json
{
  "version": 1,
  "allow": ["fs.read", "fs.write", "http.get", "sh.exec"]
}
```

### Deny-All Policy

An empty `allow` list blocks everything:

```json
{
  "version": 1,
  "allow": []
}
```

This is the same as the built-in default when no policy file exists.

## Development Override

The `--unsafe-allow-all` flag bypasses policy file resolution entirely and grants all capabilities:

```bash
a0 run program.a0 --unsafe-allow-all
```

This is useful during development and testing, but should never be used in production or CI pipelines.

## Example: Policy Denied at Runtime

Given a program that needs `http.get`:

```a0
cap { http.get: true }

call? http.get { url: "https://example.com" } -> response
return { status: response.status }
```

And a policy that only allows file reads:

```json
{
  "version": 1,
  "allow": ["fs.read"]
}
```

Running the program:

```bash
a0 run program.a0 --pretty
```

```
error[E_CAP_DENIED]: Capability 'http.get' is not allowed by the active policy.
```

The program exits with code 3. To fix this, either add `http.get` to the policy's `allow` list or use `--unsafe-allow-all` for development.

## Best Practices

- **Least privilege**: Only allow the capabilities each project actually needs.
- **Project-local over user-level**: Prefer `.a0policy.json` in the project root so that policy is version-controlled and reproducible.
- **Never commit `--unsafe-allow-all`**: If you use it in scripts or Makefiles, ensure it is for local development only.
- **Review cap declarations**: A program's `cap { ... }` header tells you exactly what it will try to do. Compare it against your policy before running.
