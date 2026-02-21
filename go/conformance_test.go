package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/thomasrohde/agent0/go/internal/testutil"
	"github.com/thomasrohde/agent0/go/pkg/diagnostics"
	"github.com/thomasrohde/agent0/go/pkg/evaluator"
	"github.com/thomasrohde/agent0/go/pkg/parser"
	"github.com/thomasrohde/agent0/go/pkg/stdlib"
	"github.com/thomasrohde/agent0/go/pkg/validator"
)

// Phase 1 scenario list
var phase1Scenarios = map[string]bool{
	// Run: basic
	"hello":             true,
	"bare-return":       true,
	"bare-return-string": true,
	"bare-return-types": true,
	"arithmetic":        true,
	"string-plus":       true,
	"if-then-else":      true,
	"if-block":          true,
	"record-spread":     true,
	// Assert/check
	"assert-pass":  true,
	"assert-fail":  true,
	"assert-halts": true,
	"evidence-pass": true,
	"evidence-fail": true,
	"mixed-checks":  true,
	// Validation (check command)
	"check-pass":          true,
	"check-no-return":     true,
	"check-return-not-last": true,
	"check-unbound":       true,
	"check-dup-binding":   true,
	"check-call-effect":   true,
	"check-undeclared-cap": true,
	// Errors
	"parse-error":  true,
	"pretty-error": true,
	"cap-denied":   true,
	// Budget
	"budget-time": true,
}

func TestConformance(t *testing.T) {
	scenariosRoot := testutil.ScenariosDir

	for name := range phase1Scenarios {
		name := name
		t.Run(name, func(t *testing.T) {
			scenarioDir := filepath.Join(scenariosRoot, name)

			scenario, err := testutil.LoadScenario(scenarioDir)
			if err != nil {
				t.Fatalf("failed to load scenario: %v", err)
			}

			source, filename, err := testutil.ReadProgramFile(scenarioDir, scenario.Cmd)
			if err != nil {
				t.Fatalf("failed to read program file: %v", err)
			}

			cmd := scenario.Cmd[0] // "run" or "check"
			pretty := false
			for _, arg := range scenario.Cmd {
				if arg == "--pretty" {
					pretty = true
				}
			}

			switch cmd {
			case "check":
				runCheckScenario(t, source, filename, scenario, pretty)
			case "run":
				runRunScenario(t, source, filename, scenario, pretty)
			default:
				t.Skipf("unsupported command: %s", cmd)
			}
		})
	}
}

func runCheckScenario(t *testing.T, source, filename string, scenario *testutil.Scenario, pretty bool) {
	t.Helper()

	// Parse
	program, diags := parser.Parse(source, filename)
	if len(diags) > 0 {
		checkDiagExpectations(t, diags, scenario, pretty, 2)
		return
	}

	// Validate
	vDiags := validator.Validate(program)
	if len(vDiags) > 0 {
		checkDiagExpectations(t, vDiags, scenario, pretty, 2)
		return
	}

	// Valid program
	actualExitCode := 0
	if scenario.Expect.ExitCode != actualExitCode {
		t.Errorf("exit code: got %d, want %d", actualExitCode, scenario.Expect.ExitCode)
	}

	if scenario.Expect.StdoutJSON != nil {
		expected := normalizeJSON(t, scenario.Expect.StdoutJSON)
		actual := "[]"
		if expected != actual {
			t.Errorf("stdout: got %s, want %s", actual, expected)
		}
	}
}

func runRunScenario(t *testing.T, source, filename string, scenario *testutil.Scenario, pretty bool) {
	t.Helper()

	// Parse
	program, diags := parser.Parse(source, filename)
	if len(diags) > 0 {
		checkDiagExpectations(t, diags, scenario, pretty, 2)
		return
	}

	// Validate
	vDiags := validator.Validate(program)
	if len(vDiags) > 0 {
		checkDiagExpectations(t, vDiags, scenario, pretty, 2)
		return
	}

	// Build exec options
	opts := buildTestExecOptions(scenario)

	// Execute
	ctx := context.Background()
	result, execErr := evaluator.Execute(ctx, program, opts)

	if execErr != nil {
		if rtErr, ok := execErr.(*evaluator.A0RuntimeError); ok {
			actualExit := exitCodeForError(rtErr.Code)
			if scenario.Expect.ExitCode != actualExit {
				t.Errorf("exit code: got %d, want %d (error: %s)", actualExit, scenario.Expect.ExitCode, rtErr.Message)
			}
			// Check stderr expectations
			diag := diagnostics.MakeDiag(rtErr.Code, rtErr.Message, rtErr.Span, "")
			stderrOutput := diagnostics.FormatDiagnostics([]diagnostics.Diagnostic{diag}, pretty)
			checkStderrExpectations(t, stderrOutput, []diagnostics.Diagnostic{diag}, scenario)

			// Check evidence expectations
			if result != nil {
				checkEvidenceExpectations(t, result.Evidence, scenario)
			}
			return
		}
		t.Fatalf("unexpected error type: %v", execErr)
		return
	}

	// Determine actual exit code
	actualExit := 0
	if result != nil {
		for _, ev := range result.Evidence {
			if !ev.OK {
				actualExit = 5
				break
			}
		}
	}

	if scenario.Expect.ExitCode != actualExit {
		t.Errorf("exit code: got %d, want %d", actualExit, scenario.Expect.ExitCode)
	}

	// Check stdout
	if scenario.Expect.StdoutJSON != nil && result != nil && result.Value != nil {
		actualJSON, err := evaluator.ValueToJSON(result.Value)
		if err != nil {
			t.Fatalf("failed to serialize result: %v", err)
		}
		expected := normalizeJSON(t, scenario.Expect.StdoutJSON)
		actual := normalizeJSON(t, json.RawMessage(actualJSON))
		if expected != actual {
			t.Errorf("stdout JSON:\n  got:  %s\n  want: %s", actual, expected)
		}
	}

	// Check evidence
	if result != nil {
		checkEvidenceExpectations(t, result.Evidence, scenario)
	}
}

func checkDiagExpectations(t *testing.T, diags []diagnostics.Diagnostic, scenario *testutil.Scenario, pretty bool, exitCode int) {
	t.Helper()

	if scenario.Expect.ExitCode != exitCode {
		t.Errorf("exit code: got %d, want %d", exitCode, scenario.Expect.ExitCode)
	}

	stderrOutput := diagnostics.FormatDiagnostics(diags, pretty)
	checkStderrExpectations(t, stderrOutput, diags, scenario)
}

func checkStderrExpectations(t *testing.T, stderrOutput string, diags []diagnostics.Diagnostic, scenario *testutil.Scenario) {
	t.Helper()

	if scenario.Expect.StderrContains != "" {
		if !strings.Contains(stderrOutput, scenario.Expect.StderrContains) {
			t.Errorf("stderr should contain '%s', got: %s", scenario.Expect.StderrContains, stderrOutput)
		}
	}

	if scenario.Expect.StderrJSONSubset != nil {
		// Parse the expected subset
		var expectedSubset []map[string]any
		if err := json.Unmarshal(scenario.Expect.StderrJSONSubset, &expectedSubset); err != nil {
			t.Fatalf("failed to parse expected stderr JSON subset: %v", err)
		}

		// Check that diagnostics match the subset
		diagsJSON, _ := json.Marshal(diags)
		var actualDiags []map[string]any
		if err := json.Unmarshal(diagsJSON, &actualDiags); err != nil {
			t.Fatalf("failed to parse actual diagnostics: %v", err)
		}

		for _, expected := range expectedSubset {
			found := false
			for _, actual := range actualDiags {
				if isSubset(expected, actual) {
					found = true
					break
				}
			}
			if !found {
				t.Errorf("stderr JSON subset not found: %v", expected)
			}
		}
	}
}

func checkEvidenceExpectations(t *testing.T, evidence []evaluator.Evidence, scenario *testutil.Scenario) {
	t.Helper()

	if scenario.Expect.EvidenceJSONSubset == nil {
		return
	}

	// Parse expected evidence
	var expectedEvidence []map[string]any
	if err := json.Unmarshal(scenario.Expect.EvidenceJSONSubset, &expectedEvidence); err != nil {
		t.Fatalf("failed to parse expected evidence subset: %v", err)
	}

	// Convert actual evidence to comparable form
	evidenceJSON, err := evaluator.EvidenceToJSON(evidence)
	if err != nil {
		t.Fatalf("failed to serialize evidence: %v", err)
	}
	var actualEvidence []map[string]any
	if err := json.Unmarshal(evidenceJSON, &actualEvidence); err != nil {
		t.Fatalf("failed to parse actual evidence: %v", err)
	}

	for i, expected := range expectedEvidence {
		if i >= len(actualEvidence) {
			t.Errorf("missing evidence entry at index %d", i)
			continue
		}
		if !isSubset(expected, actualEvidence[i]) {
			t.Errorf("evidence[%d] mismatch:\n  expected subset: %v\n  got: %v", i, expected, actualEvidence[i])
		}
	}
}

func buildTestExecOptions(scenario *testutil.Scenario) evaluator.ExecOptions {
	// Build stdlib
	stdlibReg := stdlib.NewRegistry()
	stdlib.RegisterDefaults(stdlibReg)

	stdlibMap := make(map[string]*evaluator.StdlibFn)
	for name, fn := range stdlibReg.All() {
		fnCopy := fn
		stdlibMap[name] = &evaluator.StdlibFn{
			Name:    name,
			Execute: fnCopy.Execute,
		}
	}

	// Build capabilities
	var allowedCaps map[string]bool
	if scenario.Policy != nil && len(scenario.Policy.Allow) > 0 {
		allowedCaps = make(map[string]bool)
		for _, cap := range scenario.Policy.Allow {
			allowedCaps[cap] = true
		}
	} else if scenario.Policy != nil {
		// Explicit empty allow = deny all
		allowedCaps = make(map[string]bool)
	} else {
		// No policy = deny all by default
		allowedCaps = make(map[string]bool)
	}

	return evaluator.ExecOptions{
		AllowedCapabilities: allowedCaps,
		Tools:               make(map[string]*evaluator.ToolDef),
		Stdlib:              stdlibMap,
		RunID:               "test",
	}
}

func exitCodeForError(code string) int {
	switch code {
	case diagnostics.ECapDenied:
		return 3
	case diagnostics.EAssert:
		return 5
	case diagnostics.ECheck:
		return 5
	default:
		return 4
	}
}

func normalizeJSON(t *testing.T, raw json.RawMessage) string {
	t.Helper()
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatalf("failed to parse JSON: %v (raw: %s)", err, string(raw))
	}
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("failed to re-marshal JSON: %v", err)
	}
	return string(b)
}

// isSubset checks if expected is a subset of actual (for JSON comparison).
func isSubset(expected, actual any) bool {
	switch e := expected.(type) {
	case map[string]any:
		a, ok := actual.(map[string]any)
		if !ok {
			return false
		}
		for k, ev := range e {
			av, exists := a[k]
			if !exists {
				return false
			}
			if !isSubset(ev, av) {
				return false
			}
		}
		return true

	case []any:
		a, ok := actual.([]any)
		if !ok {
			return false
		}
		if len(e) > len(a) {
			return false
		}
		for i, ev := range e {
			if !isSubset(ev, a[i]) {
				return false
			}
		}
		return true

	case float64:
		if af, ok := actual.(float64); ok {
			return e == af
		}
		return false

	case string:
		if as, ok := actual.(string); ok {
			return e == as
		}
		return false

	case bool:
		if ab, ok := actual.(bool); ok {
			return e == ab
		}
		return false

	case nil:
		return actual == nil

	default:
		return fmt.Sprintf("%v", expected) == fmt.Sprintf("%v", actual)
	}
}

// Verify scenarios directory exists
func TestScenariosExist(t *testing.T) {
	root := testutil.ScenariosDir
	info, err := os.Stat(root)
	if err != nil {
		t.Skipf("scenarios directory not found: %v", err)
	}
	if !info.IsDir() {
		t.Fatalf("scenarios path is not a directory: %s", root)
	}
}
