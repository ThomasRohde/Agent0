package tools

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"time"

	"github.com/thomasrohde/agent0/go/pkg/evaluator"
)

func shExecTool() Def {
	return Def{
		Name:         "sh.exec",
		Mode:         "effect",
		CapabilityID: "sh.exec",
		Execute: func(ctx context.Context, args *evaluator.A0Record) (evaluator.A0Value, error) {
			cmdVal, _ := args.Get("cmd")
			cmdStr, ok := cmdVal.(evaluator.A0String)
			if !ok {
				return nil, fmt.Errorf("sh.exec requires a 'cmd' argument of type string")
			}

			// Default values
			cwd, _ := os.Getwd()
			if cwdVal, found := args.Get("cwd"); found {
				if s, ok := cwdVal.(evaluator.A0String); ok {
					cwd = s.Value
				}
			}

			timeoutMs := 30000.0
			if toVal, found := args.Get("timeoutMs"); found {
				if n, ok := toVal.(evaluator.A0Number); ok {
					timeoutMs = n.Value
				}
			}

			// Build environment
			envVars := os.Environ()
			if envVal, found := args.Get("env"); found {
				if envRec, ok := envVal.(evaluator.A0Record); ok {
					for _, kv := range envRec.Pairs {
						if s, ok := kv.Value.(evaluator.A0String); ok {
							envVars = append(envVars, fmt.Sprintf("%s=%s", kv.Key, s.Value))
						}
					}
				}
			}

			// Create command
			var cmd *exec.Cmd
			if runtime.GOOS == "windows" {
				cmd = exec.CommandContext(ctx, "cmd", "/c", cmdStr.Value)
			} else {
				cmd = exec.CommandContext(ctx, "sh", "-c", cmdStr.Value)
			}
			cmd.Dir = cwd
			cmd.Env = envVars

			// Set up timeout
			timeout := time.Duration(timeoutMs) * time.Millisecond
			timeoutCtx, cancel := context.WithTimeout(ctx, timeout)
			defer cancel()
			cmd = exec.CommandContext(timeoutCtx, cmd.Args[0], cmd.Args[1:]...)
			cmd.Dir = cwd
			cmd.Env = envVars

			startMs := time.Now()

			// Capture stdout and stderr
			stdout, err := cmd.Output()
			durationMs := time.Since(startMs).Milliseconds()

			if err != nil {
				exitCode := 1
				stderr := ""
				if exitErr, ok := err.(*exec.ExitError); ok {
					exitCode = exitErr.ExitCode()
					stderr = string(exitErr.Stderr)
				}
				return evaluator.NewRecord([]evaluator.KeyValue{
					{Key: "exitCode", Value: evaluator.NewNumber(float64(exitCode))},
					{Key: "stdout", Value: evaluator.NewString(string(stdout))},
					{Key: "stderr", Value: evaluator.NewString(stderr)},
					{Key: "durationMs", Value: evaluator.NewNumber(float64(durationMs))},
				}), nil
			}

			return evaluator.NewRecord([]evaluator.KeyValue{
				{Key: "exitCode", Value: evaluator.NewNumber(0)},
				{Key: "stdout", Value: evaluator.NewString(string(stdout))},
				{Key: "stderr", Value: evaluator.NewString("")},
				{Key: "durationMs", Value: evaluator.NewNumber(float64(durationMs))},
			}), nil
		},
	}
}
