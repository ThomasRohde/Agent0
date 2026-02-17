---
name: experiment
description: Run a controlled experiment comparing task completion with full tools vs A0-only
disable-model-invocation: true
allowed-tools: Bash(mkdir *), Bash(cat *), Task, Read, Write, Glob, Grep
argument-hint: "[task description]"
---

# A0 Effectiveness Experiment

You are an experiment orchestrator. Your job is to run a controlled comparison of two approaches to the same task, collect structured results, and summarize findings.

## Task

$ARGUMENTS

## Protocol

### 1. Setup

Create a timestamped experiment directory:

```
experiments/<YYYY-MM-DD-HHmmss>/
  task.md          # the original task prompt
  condition-a/     # full-tools agent workspace
  condition-b/     # a0-only agent workspace
  results.md       # final comparison report
```

Write the original task to `task.md` for reproducibility.

### 2. Launch Conditions in Parallel

Launch **exactly two** subagents using the Task tool **in parallel** (both in a single message). Both receive the **identical task prompt** below, but with different constraints.

#### Shared task prompt (inject into both agents):

> **Task:** $ARGUMENTS
>
> **Instructions:**
> - Solve the task described above.
> - Write your final output to `output.txt` in your working directory.
> - Write a brief `approach.md` explaining what you did and why.
> - If you encounter errors, log them to `errors.log` (one per line) and keep going.
> - When finished, write `done.txt` containing exactly `SUCCESS` or `FAILURE` and a one-line reason.

#### Condition A — Full Tools (baseline)

- **subagent_type:** `general-purpose`
- **mode:** `bypassPermissions`
- **model:** `sonnet`
- **Prompt preamble:** "You have access to all standard tools (Read, Write, Edit, Bash, Grep, Glob). Use whatever approach you find most effective. Work inside the directory: `experiments/<timestamp>/condition-a/`"
- Give it the shared task prompt.

#### Condition B — A0 Only

- **subagent_type:** `general-purpose`
- **mode:** `bypassPermissions`
- **model:** `sonnet`
- **Prompt preamble:** "You MUST solve this task by writing and executing A0 programs using `a0 run <file>.a0 --unsafe-allow-all`. You may use Read, Grep, and Glob to understand existing files, but ALL actions/transformations/logic MUST be expressed as A0 programs. Do NOT use Bash for anything other than running `a0` commands and `mkdir`/`ls`. Do NOT use Write/Edit to directly create solution files — your A0 program should produce the output. Work inside the directory: `experiments/<timestamp>/condition-b/`"
- Inject the write-a0 skill content so the agent knows A0 syntax. Include the skill by telling the agent: "Here is the A0 language reference:" followed by the contents of `.claude/skills/write-a0/SKILL.md`.
- Give it the shared task prompt.

### 3. Collect Results

After both agents finish, read the following files from each condition directory:
- `done.txt` — completion status
- `output.txt` — the actual output
- `approach.md` — how they solved it
- `errors.log` — any errors (if exists)

### 4. Write Comparison Report

Write `results.md` in the experiment directory with this structure:

```markdown
# Experiment Results

**Task:** <the original task>
**Date:** <timestamp>

## Condition A — Full Tools
- **Status:** SUCCESS/FAILURE
- **Approach:** <summary from approach.md>
- **Errors:** <count and summary>
- **Output preview:** <first 20 lines of output.txt>

## Condition B — A0 Only
- **Status:** SUCCESS/FAILURE
- **Approach:** <summary from approach.md>
- **Errors:** <count and summary>
- **Output preview:** <first 20 lines of output.txt>

## Comparison

| Metric              | Full Tools | A0 Only |
|---------------------|-----------|---------|
| Completed           |           |         |
| Errors              |           |         |
| Output matches      |           |         |

## Observations
<qualitative comparison: which was more structured, more correct, more debuggable?>

## Raw output diff
<diff of the two output.txt files, if both exist>
```

### 5. Present to User

After writing the report, display the full contents of `results.md` to the user.

## Important Rules

- Both agents MUST receive the **exact same task** — do not rephrase or add hints for either condition.
- Launch both agents **in parallel** — do not run sequentially.
- Do NOT intervene or help either agent — let them succeed or fail on their own.
- Use `sonnet` for both agents to keep cost down and ensure a fair comparison.
- If an agent fails entirely (crashes, no output), record that as a data point — do not retry.
