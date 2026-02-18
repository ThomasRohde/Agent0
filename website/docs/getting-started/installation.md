---
sidebar_position: 1
---

# Installation

A0 is a structured scripting language designed for autonomous agents. This guide walks you through installing the A0 CLI on your machine.

## Prerequisites

- **Node.js >= 18** (with npm). Download from [nodejs.org](https://nodejs.org/) if you don't have it.

Verify your Node version:

```bash
node --version   # should print v18.x or higher
npm --version
```

## Install from Source

Clone the repository and build all packages:

```bash
git clone https://github.com/ThomasRohde/Agent0.git
cd Agent0
npm install
npm run build
```

The build compiles all packages in dependency order: core, std, tools, then cli. Tests run against compiled output, so building first is required.

## Install the CLI Globally

After building, install the `a0` command globally:

```bash
npm install -g ./packages/cli
```

This makes the `a0` command available system-wide.

## Verify the Installation

Run the included hello world example:

```bash
a0 run examples/hello.a0
```

You should see JSON output like:

```json
{
  "greeting": "Hello, A0!",
  "data": { "name": "world", "version": 1 }
}
```

## Alternative: Run with npx

If you prefer not to install globally, you can run A0 directly with `npx` from the project root:

```bash
npx a0 run examples/hello.a0
```

## Running Tests

To verify everything is working correctly, run the full test suite:

```bash
npm test
```

This runs tests across all workspace packages using Node's built-in test runner.

## Next Steps

Now that A0 is installed, continue to [Hello World](./hello-world.md) to write your first program.
