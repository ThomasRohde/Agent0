// Package tools provides the A0 tool definition and registry.
package tools

import (
	"context"

	"github.com/thomasrohde/agent0/go/pkg/evaluator"
)

// Def represents a tool available to A0 programs.
type Def struct {
	Name         string
	Mode         string // "read" or "effect"
	CapabilityID string
	Execute      func(ctx context.Context, args *evaluator.A0Record) (evaluator.A0Value, error)
}

// Registry holds registered tools.
type Registry struct {
	tools map[string]*Def
}

// NewRegistry creates a new empty tool registry.
func NewRegistry() *Registry {
	return &Registry{
		tools: make(map[string]*Def),
	}
}

// Register adds a tool to the registry.
func (r *Registry) Register(tool Def) {
	r.tools[tool.Name] = &tool
}

// Get retrieves a tool by name.
func (r *Registry) Get(name string) *Def {
	return r.tools[name]
}

// All returns all registered tools.
func (r *Registry) All() map[string]*Def {
	return r.tools
}

// RegisterDefaults adds all built-in tools.
func RegisterDefaults(r *Registry) {
	r.Register(fsReadTool())
	r.Register(fsWriteTool())
	r.Register(fsListTool())
	r.Register(fsExistsTool())
	r.Register(httpGetTool())
	r.Register(shExecTool())
}
