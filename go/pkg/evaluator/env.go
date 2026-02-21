package evaluator

// Env is a scoped environment for variable bindings.
// It supports parent-chained lookup for lexical scoping.
type Env struct {
	bindings map[string]A0Value
	parent   *Env
}

// NewEnv creates a new environment with an optional parent scope.
func NewEnv(parent *Env) *Env {
	return &Env{
		bindings: make(map[string]A0Value),
		parent:   parent,
	}
}

// Child creates a new child scope whose parent is this environment.
func (e *Env) Child() *Env {
	return NewEnv(e)
}

// Get looks up a variable by name, traversing parent scopes.
func (e *Env) Get(name string) (A0Value, bool) {
	if val, ok := e.bindings[name]; ok {
		return val, true
	}
	if e.parent != nil {
		return e.parent.Get(name)
	}
	return nil, false
}

// Set binds a variable in this scope.
func (e *Env) Set(name string, val A0Value) {
	e.bindings[name] = val
}

// Has checks whether a variable is defined in this scope or any parent.
func (e *Env) Has(name string) bool {
	if _, ok := e.bindings[name]; ok {
		return true
	}
	if e.parent != nil {
		return e.parent.Has(name)
	}
	return false
}
