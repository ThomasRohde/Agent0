// Package testutil provides shared test helpers for A0 Go tests.
package testutil

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// ScenariosDir is the relative path from the go/ directory to the shared scenarios.
const ScenariosDir = "../packages/scenarios/scenarios"

// Scenario represents a test scenario loaded from a scenario.json file.
type Scenario struct {
	Cmd       []string        `json:"cmd"`
	Stdin     string          `json:"stdin,omitempty"`
	Policy    *ScenarioPolicy `json:"policy,omitempty"`
	Capture   *CaptureConfig  `json:"capture,omitempty"`
	Meta      *ScenarioMeta   `json:"meta,omitempty"`
	Expect    ExpectedResult  `json:"expect"`
	TimeoutMs int             `json:"timeoutMs,omitempty"`
}

// ScenarioPolicy defines capability permissions for a scenario.
type ScenarioPolicy struct {
	Allow []string `json:"allow"`
	Deny  []string `json:"deny,omitempty"`
}

// CaptureConfig controls what to capture during execution.
type CaptureConfig struct {
	Trace    bool `json:"trace,omitempty"`
	Evidence bool `json:"evidence,omitempty"`
}

// ScenarioMeta holds optional scenario metadata.
type ScenarioMeta struct {
	Tags []string `json:"tags,omitempty"`
}

// ExpectedResult describes the expected outcome of running a scenario.
type ExpectedResult struct {
	ExitCode           int              `json:"exitCode"`
	StdoutJSON         json.RawMessage  `json:"stdoutJson,omitempty"`
	StdoutJSONSubset   json.RawMessage  `json:"stdoutJsonSubset,omitempty"`
	StdoutText         string           `json:"stdoutText,omitempty"`
	StdoutContains     string           `json:"stdoutContains,omitempty"`
	StderrJSON         json.RawMessage  `json:"stderrJson,omitempty"`
	StderrJSONSubset   json.RawMessage  `json:"stderrJsonSubset,omitempty"`
	StderrText         string           `json:"stderrText,omitempty"`
	StderrContains     string           `json:"stderrContains,omitempty"`
	EvidenceJSON       json.RawMessage  `json:"evidenceJson,omitempty"`
	EvidenceJSONSubset json.RawMessage  `json:"evidenceJsonSubset,omitempty"`
}

// LoadScenario loads a scenario from a directory containing scenario.json.
func LoadScenario(dir string) (*Scenario, error) {
	data, err := os.ReadFile(filepath.Join(dir, "scenario.json"))
	if err != nil {
		return nil, err
	}
	var s Scenario
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

// ListScenarios returns all scenario directories under the given root.
func ListScenarios(root string) ([]string, error) {
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil, err
	}
	var dirs []string
	for _, e := range entries {
		if e.IsDir() {
			scenarioPath := filepath.Join(root, e.Name(), "scenario.json")
			if _, err := os.Stat(scenarioPath); err == nil {
				dirs = append(dirs, filepath.Join(root, e.Name()))
			}
		}
	}
	return dirs, nil
}

// ReadProgramFile reads the program file referenced by the scenario cmd.
func ReadProgramFile(scenarioDir string, cmd []string) (string, string, error) {
	if len(cmd) < 2 {
		return "", "", nil
	}
	filename := cmd[1]
	source, err := os.ReadFile(filepath.Join(scenarioDir, filename))
	if err != nil {
		return "", "", err
	}
	return string(source), filename, nil
}
