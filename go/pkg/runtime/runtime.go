// Package runtime provides the top-level A0 runtime orchestrator.
package runtime

import (
	"github.com/thomasrohde/agent0/go/pkg/capabilities"
	"github.com/thomasrohde/agent0/go/pkg/stdlib"
	"github.com/thomasrohde/agent0/go/pkg/tools"
)

// Runtime wires together all A0 components for program execution.
type Runtime struct {
	stdlib *stdlib.Registry
	tools  *tools.Registry
	policy *capabilities.Policy
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

// New creates a new Runtime with the given options.
func New(opts ...Option) *Runtime {
	rt := &Runtime{
		stdlib: stdlib.NewRegistry(),
		tools:  tools.NewRegistry(),
		policy: capabilities.DenyAll(),
	}
	for _, opt := range opts {
		opt(rt)
	}
	return rt
}
