// Package stdlib provides the A0 standard library function registry.
package stdlib

import (
	"github.com/thomasrohde/agent0/go/pkg/evaluator"
)

// Fn represents a standard library function.
type Fn struct {
	Name    string
	Execute func(args *evaluator.A0Record) (evaluator.A0Value, error)
}

// Registry holds registered stdlib functions.
type Registry struct {
	fns map[string]*Fn
}

// NewRegistry creates a new empty stdlib registry.
func NewRegistry() *Registry {
	return &Registry{
		fns: make(map[string]*Fn),
	}
}

// Register adds a stdlib function to the registry.
func (r *Registry) Register(fn Fn) {
	r.fns[fn.Name] = &fn
}

// Get retrieves a stdlib function by name.
func (r *Registry) Get(name string) *Fn {
	return r.fns[name]
}

// All returns all registered stdlib functions.
func (r *Registry) All() map[string]*Fn {
	return r.fns
}
