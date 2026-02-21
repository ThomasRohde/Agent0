// Package capabilities implements A0 capability policy loading and enforcement.
package capabilities

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// Policy defines which capabilities are allowed for program execution.
type Policy struct {
	Allowed map[string]bool
}

// PolicyFile represents the JSON structure of a policy file.
type PolicyFile struct {
	Allow  []string       `json:"allow,omitempty"`
	Deny   []string       `json:"deny,omitempty"`
	Limits map[string]any `json:"limits,omitempty"`
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
func LoadPolicy(projectDir string) (*Policy, *PolicyFile) {
	// Try project policy
	projectPath := filepath.Join(projectDir, ".a0policy.json")
	if pf, err := loadPolicyFile(projectPath); err == nil {
		return buildPolicy(pf), pf
	}

	// Try user policy
	homeDir, err := os.UserHomeDir()
	if err == nil {
		userPath := filepath.Join(homeDir, ".a0", "policy.json")
		if pf, err := loadPolicyFile(userPath); err == nil {
			return buildPolicy(pf), pf
		}
	}

	// Default: deny all
	return DenyAll(), nil
}

func loadPolicyFile(path string) (*PolicyFile, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var pf PolicyFile
	if err := json.Unmarshal(data, &pf); err != nil {
		return nil, err
	}
	return &pf, nil
}

func buildPolicy(pf *PolicyFile) *Policy {
	allowed := make(map[string]bool)

	// Add all allowed capabilities
	for _, cap := range pf.Allow {
		allowed[cap] = true
	}

	// Deny overrides allow
	for _, cap := range pf.Deny {
		delete(allowed, cap)
	}

	return &Policy{Allowed: allowed}
}

// AllowAll returns a policy that permits all capabilities. Used for --unsafe-allow-all.
func AllowAll() *Policy {
	return &Policy{Allowed: nil} // nil signals "allow all" in the evaluator
}

// DenyAll returns a policy that denies all capabilities.
func DenyAll() *Policy {
	return &Policy{Allowed: make(map[string]bool)}
}
