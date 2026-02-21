// Package capabilities implements A0 capability policy loading and enforcement.
package capabilities

// Policy defines which capabilities are allowed for program execution.
type Policy struct {
	Allowed map[string]bool
}

// IsAllowed checks whether a capability is permitted by this policy.
func (p *Policy) IsAllowed(cap string) bool {
	if p == nil || p.Allowed == nil {
		return false
	}
	return p.Allowed[cap]
}

// LoadPolicy loads capability policies from project and user config files.
// Policy precedence: project (.a0policy.json) → user (~/.a0/policy.json) → deny-all default.
// This is a stub that will be implemented in Phase 2.
func LoadPolicy(projectPath, userPath string) (*Policy, error) {
	return nil, nil
}

// AllowAll returns a policy that permits all capabilities. Used for --unsafe-allow-all.
func AllowAll() *Policy {
	return &Policy{Allowed: nil} // nil signals "allow all" in the evaluator
}

// DenyAll returns a policy that denies all capabilities.
func DenyAll() *Policy {
	return &Policy{Allowed: make(map[string]bool)}
}
