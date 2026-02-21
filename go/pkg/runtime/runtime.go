// Package runtime provides the top-level A0 runtime orchestrator.
package runtime

import (
	"context"
	"fmt"
	"strings"

	"github.com/thomasrohde/agent0/go/pkg/capabilities"
	"github.com/thomasrohde/agent0/go/pkg/diagnostics"
	"github.com/thomasrohde/agent0/go/pkg/evaluator"
	"github.com/thomasrohde/agent0/go/pkg/formatter"
	"github.com/thomasrohde/agent0/go/pkg/parser"
	"github.com/thomasrohde/agent0/go/pkg/stdlib"
	"github.com/thomasrohde/agent0/go/pkg/tools"
	"github.com/thomasrohde/agent0/go/pkg/validator"
)

// Result holds the outcome of a program execution.
type Result struct {
	Value    evaluator.A0Value
	Evidence []evaluator.Evidence
}

// Runtime wires together all A0 components for program execution.
type Runtime struct {
	stdlib *stdlib.Registry
	tools  *tools.Registry
	policy *capabilities.Policy
	runID  string
	trace  func(event evaluator.TraceEvent)
}

// Option is a functional option for configuring the Runtime.
type Option func(*Runtime)

// WithStdlib sets the stdlib registry.
func WithStdlib(r *stdlib.Registry) Option {
	return func(rt *Runtime) {
		rt.stdlib = r
	}
}

// WithTools sets the tools registry.
func WithTools(r *tools.Registry) Option {
	return func(rt *Runtime) {
		rt.tools = r
	}
}

// WithPolicy sets the capability policy.
func WithPolicy(p *capabilities.Policy) Option {
	return func(rt *Runtime) {
		rt.policy = p
	}
}

// WithUnsafeAllowAll sets the policy to allow all capabilities.
func WithUnsafeAllowAll() Option {
	return func(rt *Runtime) {
		rt.policy = capabilities.AllowAll()
	}
}

// WithRunID sets the run ID for trace events.
func WithRunID(id string) Option {
	return func(rt *Runtime) {
		rt.runID = id
	}
}

// WithTrace sets the trace callback.
func WithTrace(fn func(event evaluator.TraceEvent)) Option {
	return func(rt *Runtime) {
		rt.trace = fn
	}
}

// New creates a new Runtime with the given options.
// By default, stdlib and tools defaults are registered and policy is deny-all.
func New(opts ...Option) *Runtime {
	stdlibReg := stdlib.NewRegistry()
	stdlib.RegisterDefaults(stdlibReg)

	toolsReg := tools.NewRegistry()
	tools.RegisterDefaults(toolsReg)

	rt := &Runtime{
		stdlib: stdlibReg,
		tools:  toolsReg,
		policy: capabilities.DenyAll(),
		runID:  "cli",
	}
	for _, opt := range opts {
		opt(rt)
	}
	return rt
}

// Run parses, validates, and executes an A0 program.
func (rt *Runtime) Run(ctx context.Context, source, filename string) (*Result, error) {
	program, diags := parser.Parse(source, filename)
	if len(diags) > 0 {
		return nil, &DiagnosticError{Diagnostics: diags}
	}

	vDiags := validator.Validate(program)
	if len(vDiags) > 0 {
		return nil, &DiagnosticError{Diagnostics: vDiags}
	}

	opts := rt.buildExecOptions()
	result, err := evaluator.Execute(ctx, program, opts)
	if err != nil {
		if result != nil {
			return &Result{Evidence: result.Evidence}, err
		}
		return nil, err
	}

	var value evaluator.A0Value
	var evidence []evaluator.Evidence
	if result != nil {
		value = result.Value
		evidence = result.Evidence
	}
	return &Result{Value: value, Evidence: evidence}, nil
}

// Check parses and validates an A0 program without executing it.
func (rt *Runtime) Check(source, filename string) []diagnostics.Diagnostic {
	program, diags := parser.Parse(source, filename)
	if len(diags) > 0 {
		return diags
	}

	vDiags := validator.Validate(program)
	return vDiags
}

// Format parses and formats an A0 program.
func (rt *Runtime) Format(source, filename string) (string, error) {
	program, diags := parser.Parse(source, filename)
	if len(diags) > 0 {
		return "", &DiagnosticError{Diagnostics: diags}
	}
	return formatter.Format(program), nil
}

// buildExecOptions constructs evaluator options from the runtime's configuration.
func (rt *Runtime) buildExecOptions() evaluator.ExecOptions {
	stdlibMap := make(map[string]*evaluator.StdlibFn)
	for name, fn := range rt.stdlib.All() {
		fnCopy := fn
		stdlibMap[name] = &evaluator.StdlibFn{
			Name:    name,
			Execute: fnCopy.Execute,
		}
	}

	toolsMap := make(map[string]*evaluator.ToolDef)
	for name, tool := range rt.tools.All() {
		toolCopy := tool
		toolsMap[name] = &evaluator.ToolDef{
			Name:         toolCopy.Name,
			Mode:         toolCopy.Mode,
			CapabilityID: toolCopy.CapabilityID,
			Execute:      toolCopy.Execute,
		}
	}

	var allowedCaps map[string]bool
	if rt.policy != nil {
		allowedCaps = rt.policy.Allowed
	}

	return evaluator.ExecOptions{
		AllowedCapabilities: allowedCaps,
		Tools:               toolsMap,
		Stdlib:              stdlibMap,
		Trace:               rt.trace,
		RunID:               rt.runID,
	}
}

// DiagnosticError wraps diagnostics as an error.
type DiagnosticError struct {
	Diagnostics []diagnostics.Diagnostic
}

func (e *DiagnosticError) Error() string {
	msgs := make([]string, len(e.Diagnostics))
	for i, d := range e.Diagnostics {
		msgs[i] = fmt.Sprintf("%s: %s", d.Code, d.Message)
	}
	return strings.Join(msgs, "; ")
}
