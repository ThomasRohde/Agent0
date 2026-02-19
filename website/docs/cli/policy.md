---
sidebar_position: 6
---

# a0 policy

Display the effective capability policy after resolution (`.a0policy.json` -> `~/.a0/policy.json` -> default deny-all).

## Usage

```bash
a0 policy [options]
```

## Flags

| Flag | Description |
|------|-------------|
| `--json` | Output the policy summary as JSON |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Policy summary printed successfully |
| 1 | CLI usage/help error |

## Human Output (Default)

```bash
a0 policy
```

Example output:

```text
Effective A0 policy
  Source:          project
  Path:            /path/to/project/.a0policy.json
  Allow:           fs.read, http.get
  Deny:            sh.exec
  Effective allow: fs.read, http.get
  Limits:          (none)
```

## JSON Output

```bash
a0 policy --json
```

Example schema:

```json
{
  "source": "project",
  "path": "/path/to/project/.a0policy.json",
  "policy": {
    "version": 1,
    "allow": ["fs.read", "http.get"],
    "deny": ["sh.exec"],
    "limits": {}
  },
  "effectiveAllow": ["fs.read", "http.get"]
}
```

## Resolution Notes

- `source = "project"` when `./.a0policy.json` is the first valid policy.
- `source = "user"` when project policy is missing/invalid and `~/.a0/policy.json` is valid.
- `source = "default"` when no valid policy file exists.
- `effectiveAllow` already applies `deny` overrides.

