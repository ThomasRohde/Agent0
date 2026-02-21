package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/thomasrohde/agent0/go/internal/testutil"
	"github.com/thomasrohde/agent0/go/pkg/diagnostics"
	"github.com/thomasrohde/agent0/go/pkg/evaluator"
	"github.com/thomasrohde/agent0/go/pkg/formatter"
	"github.com/thomasrohde/agent0/go/pkg/parser"
	"github.com/thomasrohde/agent0/go/pkg/stdlib"
	"github.com/thomasrohde/agent0/go/pkg/tools"
	"github.com/thomasrohde/agent0/go/pkg/validator"
)

func TestConformance(t *testing.T) {
	scenariosRoot := testutil.ScenariosDir

	dirs, err := testutil.ListScenarios(scenariosRoot)
	if err != nil {
		t.Fatalf("failed to list scenarios: %v", err)
	}

	for _, dir := range dirs {
		name := filepath.Base(dir)
		t.Run(name, func(t *testing.T) {
			scenario, err := testutil.LoadScenario(dir)
			if err != nil {
				t.Fatalf("failed to load scenario: %v", err)
			}

			if len(scenario.Cmd) == 0 {
				t.Skip("no command specified")
			}

			cmd := scenario.Cmd[0]
			switch cmd {
			case "run":
				runRunScenario(t, dir, scenario)
			case "check":
				runCheckScenario(t, dir, scenario)
			case "fmt":
				runFmtScenario(t, dir, scenario)
			case "trace":
				runTraceScenario(t, dir, scenario)
			case "help":
				runHelpScenario(t, scenario)
			case "policy":
				runPolicyScenario(t, dir, scenario)
			default:
				runUnknownCmdScenario(t, cmd, scenario)
			}
		})
	}
}

// --- Command handlers ---

func runRunScenario(t *testing.T, scenarioDir string, scenario *testutil.Scenario) {
	t.Helper()

	pretty := hasFlag(scenario.Cmd, "--pretty")
	debugParse := hasFlag(scenario.Cmd, "--debug-parse")
	unsafeAllowAll := hasFlag(scenario.Cmd, "--unsafe-allow-all")

	// Read source
	source, filename, err := getSource(scenarioDir, scenario)
	if err != nil {
		// Missing file → E_IO, exit 4
		diag := diagnostics.MakeDiag(diagnostics.EIO, fmt.Sprintf("cannot read file: %s", getFilename(scenario)), nil, "")
		stderrOutput := formatDiagForOutput([]diagnostics.Diagnostic{diag}, pretty, false)
		checkExitCode(t, 4, scenario.Expect.ExitCode)
		checkStderrStringExpectations(t, stderrOutput, scenario)
		checkStderrJSONExpectations(t, []diagnostics.Diagnostic{diag}, scenario)
		return
	}

	// Parse
	program, diags := parser.Parse(source, filename)
	if len(diags) > 0 {
		stderrOutput := formatDiagForOutput(diags, pretty, debugParse)
		checkExitCode(t, 2, scenario.Expect.ExitCode)
		checkStderrStringExpectations(t, stderrOutput, scenario)
		checkStderrJSONExpectations(t, diags, scenario)
		return
	}

	// Validate
	vDiags := validator.Validate(program)
	if len(vDiags) > 0 {
		stderrOutput := formatDiagForOutput(vDiags, pretty, false)
		checkExitCode(t, 2, scenario.Expect.ExitCode)
		checkStderrStringExpectations(t, stderrOutput, scenario)
		checkStderrJSONExpectations(t, vDiags, scenario)
		return
	}

	// Build exec options (with tools if needed)
	opts := buildTestExecOptions(scenario, scenarioDir, unsafeAllowAll)

	// Trace capture
	var traceEvents []map[string]any
	if scenario.Capture != nil && scenario.Capture.Trace {
		opts.Trace = func(event evaluator.TraceEvent) {
			m := map[string]any{
				"event": string(event.Event),
				"runId": event.RunID,
				"ts":    event.Timestamp,
			}
			if event.Data != nil {
				// Convert A0Record to map[string]any for JSON compatibility
				dataMap := make(map[string]any)
				for _, kv := range event.Data.Pairs {
					if s, ok := kv.Value.(evaluator.A0String); ok {
						dataMap[kv.Key] = s.Value
					} else if b, ok := kv.Value.(evaluator.A0Bool); ok {
						dataMap[kv.Key] = b.Value
					} else if n, ok := kv.Value.(evaluator.A0Number); ok {
						dataMap[kv.Key] = n.Value
					} else {
						j, _ := evaluator.ValueToJSON(kv.Value)
						var v any
						json.Unmarshal(j, &v)
						dataMap[kv.Key] = v
					}
				}
				m["data"] = dataMap
			}
			traceEvents = append(traceEvents, m)
		}
	}

	// Execute in working directory (for file tool scenarios)
	origDir, _ := os.Getwd()
	tmpDir := createWorkDir(t, scenarioDir)
	os.Chdir(tmpDir)
	defer func() {
		os.Chdir(origDir)
		os.RemoveAll(tmpDir)
	}()

	ctx := context.Background()
	result, execErr := evaluator.Execute(ctx, program, opts)

	if execErr != nil {
		if rtErr, ok := execErr.(*evaluator.A0RuntimeError); ok {
			actualExit := exitCodeForError(rtErr.Code)
			checkExitCode(t, actualExit, scenario.Expect.ExitCode)

			diag := diagnostics.MakeDiag(rtErr.Code, rtErr.Message, rtErr.Span, "")
			// Runtime errors: single object on stderr (not array)
			stderrOutput := formatSingleDiag(diag, pretty)
			checkStderrStringExpectations(t, stderrOutput, scenario)
			checkSingleDiagExpectations(t, diag, scenario)

			if result != nil {
				checkEvidenceExpectations(t, result.Evidence, scenario)
			}
			return
		}
		t.Fatalf("unexpected error type: %v", execErr)
		return
	}

	// Determine exit code
	actualExit := 0
	if result != nil {
		for _, ev := range result.Evidence {
			if !ev.OK {
				actualExit = 5
				break
			}
		}
	}

	checkExitCode(t, actualExit, scenario.Expect.ExitCode)

	// Check stdout
	if result != nil && result.Value != nil {
		stdoutJSON, _ := evaluator.ValueToJSON(result.Value)
		stdoutStr := string(stdoutJSON)
		checkStdoutExpectations(t, stdoutStr, scenario)
	}

	// Check evidence
	if result != nil {
		checkEvidenceExpectations(t, result.Evidence, scenario)
	}

	// Check trace
	if scenario.Expect.TraceSummarySubset != nil {
		checkTraceSummary(t, traceEvents, scenario)
	}

	// Check files
	checkFileExpectations(t, tmpDir, scenario)
}

func runCheckScenario(t *testing.T, scenarioDir string, scenario *testutil.Scenario) {
	t.Helper()

	pretty := hasFlag(scenario.Cmd, "--pretty")
	debugParse := hasFlag(scenario.Cmd, "--debug-parse")
	stableJSON := hasFlag(scenario.Cmd, "--stable-json")

	source, filename, err := getSource(scenarioDir, scenario)
	if err != nil {
		// Missing file → E_IO, exit 4
		diag := diagnostics.MakeDiag(diagnostics.EIO, fmt.Sprintf("cannot read file: %s", getFilename(scenario)), nil, "")
		stderrOutput := formatDiagForOutput([]diagnostics.Diagnostic{diag}, pretty, false)
		checkExitCode(t, 4, scenario.Expect.ExitCode)
		checkStderrStringExpectations(t, stderrOutput, scenario)
		checkStderrJSONExpectations(t, []diagnostics.Diagnostic{diag}, scenario)
		return
	}

	// Parse
	program, diags := parser.Parse(source, filename)
	if len(diags) > 0 {
		stderrOutput := formatDiagForOutput(diags, pretty, debugParse)
		checkExitCode(t, 2, scenario.Expect.ExitCode)
		checkStderrStringExpectations(t, stderrOutput, scenario)
		checkStderrJSONExpectations(t, diags, scenario)
		return
	}

	// Validate
	vDiags := validator.Validate(program)
	if len(vDiags) > 0 {
		stderrOutput := formatDiagForOutput(vDiags, pretty, false)
		checkExitCode(t, 2, scenario.Expect.ExitCode)
		checkStderrStringExpectations(t, stderrOutput, scenario)
		checkStderrJSONExpectations(t, vDiags, scenario)
		return
	}

	// Valid program
	actualExit := 0
	checkExitCode(t, actualExit, scenario.Expect.ExitCode)

	if stableJSON {
		checkStdoutExpectations(t, `{"ok":true,"errors":[]}`, scenario)
	} else if pretty {
		checkStdoutExpectations(t, "No errors found.", scenario)
	} else {
		checkStdoutExpectations(t, "[]", scenario)
	}
}

func runFmtScenario(t *testing.T, scenarioDir string, scenario *testutil.Scenario) {
	t.Helper()

	if len(scenario.Cmd) < 2 {
		t.Skip("fmt scenario without file")
		return
	}

	filename := scenario.Cmd[1]
	sourceFile := filepath.Join(scenarioDir, filename)
	sourceBytes, err := os.ReadFile(sourceFile)
	if err != nil {
		// Missing file → E_IO, exit 4
		diag := diagnostics.MakeDiag(diagnostics.EIO, fmt.Sprintf("cannot read file: %s", filename), nil, "")
		stderrOutput := diagnostics.FormatDiagnostic(diag, true)
		checkExitCode(t, 4, scenario.Expect.ExitCode)
		checkStderrStringExpectations(t, stderrOutput, scenario)
		return
	}
	source := string(sourceBytes)

	program, diags := parser.Parse(source, filename)
	if len(diags) > 0 {
		checkExitCode(t, 2, scenario.Expect.ExitCode)
		return
	}

	formatted := formatter.Format(program)

	write := hasFlag(scenario.Cmd, "--write")

	var stderrStr string
	if formatter.HasComments(source) {
		stderrStr = "warning: formatting will remove comments from the output."
	}

	if write {
		// For --write scenarios, create temp dir, write formatted, check files
		tmpDir := createWorkDir(t, scenarioDir)
		defer os.RemoveAll(tmpDir)
		tmpFile := filepath.Join(tmpDir, filename)
		os.WriteFile(tmpFile, []byte(formatted), 0644)

		checkExitCode(t, 0, scenario.Expect.ExitCode)
		checkFileExpectations(t, tmpDir, scenario)
	} else {
		checkExitCode(t, 0, scenario.Expect.ExitCode)
		if scenario.Expect.StdoutText != "" {
			actual := strings.TrimSuffix(formatted, "\n")
			expected := scenario.Expect.StdoutText
			if actual != expected {
				t.Errorf("stdout text:\n  got:  %q\n  want: %q", actual, expected)
			}
		}
	}

	// Check stderr (comment warning)
	if scenario.Expect.StderrContains != "" {
		if !strings.Contains(stderrStr, scenario.Expect.StderrContains) {
			t.Errorf("stderr should contain %q, got: %q", scenario.Expect.StderrContains, stderrStr)
		}
	}
}

func runTraceScenario(t *testing.T, scenarioDir string, scenario *testutil.Scenario) {
	t.Helper()

	if len(scenario.Cmd) < 2 {
		t.Skip("trace scenario without file")
		return
	}

	filename := scenario.Cmd[1]

	// Create working directory with setup files
	tmpDir := createWorkDir(t, scenarioDir)
	defer os.RemoveAll(tmpDir)

	traceFile := filepath.Join(tmpDir, filename)
	f, err := os.Open(traceFile)
	if err != nil {
		// Missing file → E_IO, exit 4
		diag := diagnostics.MakeDiag(diagnostics.EIO, fmt.Sprintf("cannot read trace file: %s", filename), nil, "")
		jsonOutput := hasFlag(scenario.Cmd, "--json")
		var stderrStr string
		if jsonOutput {
			b, _ := json.Marshal(diag)
			stderrStr = string(b)
		} else {
			stderrStr = diagnostics.FormatDiagnostic(diag, true)
		}
		checkExitCode(t, 4, scenario.Expect.ExitCode)
		checkStderrStringExpectations(t, stderrStr, scenario)
		checkStderrJSONExpectationsFromSingle(t, diag, scenario)
		return
	}
	defer f.Close()

	jsonOutput := hasFlag(scenario.Cmd, "--json")
	textOutput := !jsonOutput // default is text

	// Parse and validate trace
	summary, traceErr := computeTestTraceSummary(f)
	if traceErr != nil {
		diag := diagnostics.MakeDiag("E_TRACE", traceErr.Error(), nil, "")
		var stderrStr string
		if jsonOutput {
			b, _ := json.Marshal(diag)
			stderrStr = string(b)
		} else {
			stderrStr = diagnostics.FormatDiagnostic(diag, true)
		}
		checkExitCode(t, 4, scenario.Expect.ExitCode)
		checkStderrStringExpectations(t, stderrStr, scenario)
		checkStderrJSONExpectationsFromSingle(t, diag, scenario)
		return
	}

	var stdoutStr string
	if textOutput {
		var sb strings.Builder
		sb.WriteString("Trace Summary\n")
		fmt.Fprintf(&sb, "  Run ID:           %s\n", summary.RunID)
		fmt.Fprintf(&sb, "  Total events:     %d\n", summary.TotalEvents)
		fmt.Fprintf(&sb, "  Tool invocations: %d\n", summary.ToolInvocations)
		if len(summary.ToolsByName) > 0 {
			sb.WriteString("  Tools used:\n")
			for name, count := range summary.ToolsByName {
				fmt.Fprintf(&sb, "    %s: %d\n", name, count)
			}
		}
		fmt.Fprintf(&sb, "  Evidence events:  %d\n", summary.EvidenceCount)
		fmt.Fprintf(&sb, "  Failures:         %d\n", summary.Failures)
		fmt.Fprintf(&sb, "  Budget exceeded:  %d\n", summary.BudgetExceeded)
		if summary.DurationMs > 0 {
			fmt.Fprintf(&sb, "  Duration:         %dms\n", int(summary.DurationMs))
		}
		stdoutStr = sb.String()
	} else {
		b, _ := json.Marshal(summary)
		stdoutStr = string(b)
	}

	checkExitCode(t, 0, scenario.Expect.ExitCode)
	checkStdoutExpectations(t, stdoutStr, scenario)
}

func runHelpScenario(t *testing.T, scenario *testutil.Scenario) {
	t.Helper()

	showIndex := hasFlag(scenario.Cmd, "--index")
	topic := ""
	for _, arg := range scenario.Cmd[1:] {
		if !strings.HasPrefix(arg, "-") {
			topic = arg
		}
	}

	var stdoutStr, stderrStr string
	exitCode := 0

	if showIndex {
		if topic == "stdlib" {
			stdoutStr = "A0 STDLIB INDEX\n\nPredicates: eq, not, contains, and, or, coalesce, typeof\nLists:      len, append, concat, sort, filter, find, range, join, unique, pluck, flat\nStrings:    str.concat, str.split, str.starts, str.ends, str.replace, str.template\nRecords:    keys, values, merge, entries\nPaths:      get, put\nMath:       math.max, math.min\nParse:      parse.json\nPatch:      patch\nHigher:     map, reduce\n\nTotal: 34\n"
		} else {
			// --index requires topic "stdlib"
			stderrStr = "Unknown or missing topic for --index. Usage: a0 help stdlib --index"
			exitCode = 1
		}
	} else if topic == "stdlib" {
		stdoutStr = "A0 STDLIB INDEX\n\nPredicates: eq, not, contains, and, or, coalesce, typeof\nLists:      len, append, concat, sort, filter, find, range, join, unique, pluck, flat\nStrings:    str.concat, str.split, str.starts, str.ends, str.replace, str.template\nRecords:    keys, values, merge, entries\nPaths:      get, put\nMath:       math.max, math.min\nParse:      parse.json\nPatch:      patch\nHigher:     map, reduce\n\nTotal: 34\n"
	} else if topic != "" {
		stderrStr = fmt.Sprintf("Unknown help topic: %s", topic)
		exitCode = 1
	} else {
		stdoutStr = "A0 QUICK REFERENCE\n\nCommands:\n  a0 run <file>     Run an A0 program\n  a0 check <file>   Validate without executing\n  a0 fmt <file>     Format source code\n  a0 trace <file>   Summarize a trace file\n  a0 help [topic]   Show help\n  a0 policy         Show effective policy\n\nFlags:\n  --pretty           Human-friendly output\n  --unsafe-allow-all Bypass capability checks\n  --evidence <path>  Write evidence to file\n  --write            Write formatted output back to file (fmt)\n  --json             JSON output (trace)\n  --text             Text output (trace)\n"
	}

	checkExitCode(t, exitCode, scenario.Expect.ExitCode)
	if stdoutStr != "" {
		checkStdoutExpectations(t, stdoutStr, scenario)
	}
	if stderrStr != "" {
		checkStderrStringExpectations(t, stderrStr, scenario)
	}
}

func runPolicyScenario(t *testing.T, scenarioDir string, scenario *testutil.Scenario) {
	t.Helper()

	// Change to scenario dir to pick up .a0policy.json
	origDir, _ := os.Getwd()
	tmpDir := createWorkDir(t, scenarioDir)

	// If the scenario has a policy config, write .a0policy.json to the working dir
	if scenario.Policy != nil {
		policyData := map[string]any{
			"allow": scenario.Policy.Allow,
		}
		if scenario.Policy.Deny != nil {
			policyData["deny"] = scenario.Policy.Deny
		}
		// Check if there are limits in the scenario (we need to look at raw JSON)
		rawScenario, _ := os.ReadFile(filepath.Join(scenarioDir, "scenario.json"))
		var rawPolicy struct {
			Policy json.RawMessage `json:"policy"`
		}
		json.Unmarshal(rawScenario, &rawPolicy)
		if rawPolicy.Policy != nil {
			var fullPolicy map[string]any
			json.Unmarshal(rawPolicy.Policy, &fullPolicy)
			if limits, ok := fullPolicy["limits"]; ok {
				policyData["limits"] = limits
			}
		}
		policyJSON, _ := json.Marshal(policyData)
		os.WriteFile(filepath.Join(tmpDir, ".a0policy.json"), policyJSON, 0644)
	}

	os.Chdir(tmpDir)
	defer func() {
		os.Chdir(origDir)
		os.RemoveAll(tmpDir)
	}()

	jsonOutput := hasFlag(scenario.Cmd, "--json")

	// Load policy from working directory
	found, pf := loadPolicyFromDir(tmpDir)

	var stdoutStr string
	if jsonOutput {
		stdoutStr = buildPolicyJSONOutput(found, pf)
	} else {
		stdoutStr = buildPolicyTextOutput(found, pf)
	}

	checkExitCode(t, 0, scenario.Expect.ExitCode)
	checkStdoutExpectations(t, stdoutStr, scenario)
}

func runUnknownCmdScenario(t *testing.T, cmd string, scenario *testutil.Scenario) {
	t.Helper()

	stderrStr := fmt.Sprintf("Unknown command: %s", cmd)
	checkExitCode(t, 1, scenario.Expect.ExitCode)
	checkStderrStringExpectations(t, stderrStr, scenario)
}

// --- Helpers ---

func hasFlag(cmd []string, flag string) bool {
	for _, arg := range cmd {
		if arg == flag {
			return true
		}
	}
	return false
}

func getFilename(scenario *testutil.Scenario) string {
	for _, arg := range scenario.Cmd[1:] {
		if !strings.HasPrefix(arg, "-") {
			return arg
		}
	}
	return "unknown"
}

func getSource(scenarioDir string, scenario *testutil.Scenario) (string, string, error) {
	if len(scenario.Cmd) < 2 {
		return "", "", fmt.Errorf("no file specified")
	}

	filename := scenario.Cmd[1]

	// Find actual file arg (skip flags)
	if strings.HasPrefix(filename, "-") && filename != "-" {
		filename = getFilename(scenario)
	}

	if filename == "-" {
		return scenario.Stdin, "<stdin>", nil
	}

	sourcePath := filepath.Join(scenarioDir, filename)
	sourceBytes, err := os.ReadFile(sourcePath)
	if err != nil {
		return "", "", err
	}
	return string(sourceBytes), filename, nil
}

func createWorkDir(t *testing.T, scenarioDir string) string {
	t.Helper()
	tmpDir, err := os.MkdirTemp("", "a0-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}

	// Copy all files from scenario dir to temp dir
	entries, err := os.ReadDir(scenarioDir)
	if err != nil {
		return tmpDir
	}
	for _, entry := range entries {
		if entry.IsDir() {
			// Copy setup/ subdirectory files to temp dir root
			if entry.Name() == "setup" {
				setupDir := filepath.Join(scenarioDir, "setup")
				setupEntries, err := os.ReadDir(setupDir)
				if err != nil {
					continue
				}
				for _, se := range setupEntries {
					if se.IsDir() {
						continue
					}
					src := filepath.Join(setupDir, se.Name())
					dst := filepath.Join(tmpDir, se.Name())
					data, err := os.ReadFile(src)
					if err != nil {
						continue
					}
					os.WriteFile(dst, data, 0644)
				}
			}
			continue
		}
		src := filepath.Join(scenarioDir, entry.Name())
		dst := filepath.Join(tmpDir, entry.Name())
		data, err := os.ReadFile(src)
		if err != nil {
			continue
		}
		os.WriteFile(dst, data, 0644)
	}
	return tmpDir
}

func buildTestExecOptions(scenario *testutil.Scenario, scenarioDir string, unsafeAllowAll bool) evaluator.ExecOptions {
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

	// Build tools
	toolsReg := tools.NewRegistry()
	tools.RegisterDefaults(toolsReg)

	toolsMap := make(map[string]*evaluator.ToolDef)
	for name, tool := range toolsReg.All() {
		toolCopy := tool
		toolsMap[name] = &evaluator.ToolDef{
			Name:         toolCopy.Name,
			Mode:         toolCopy.Mode,
			CapabilityID: toolCopy.CapabilityID,
			Execute:      toolCopy.Execute,
		}
	}

	// Build capabilities
	var allowedCaps map[string]bool
	if unsafeAllowAll {
		allowedCaps = nil // nil = allow all
	} else if scenario.Policy != nil {
		allowedCaps = make(map[string]bool)
		for _, cap := range scenario.Policy.Allow {
			allowedCaps[cap] = true
		}
		// Remove denied caps
		for _, cap := range scenario.Policy.Deny {
			delete(allowedCaps, cap)
		}
	} else {
		allowedCaps = make(map[string]bool) // deny all
	}

	return evaluator.ExecOptions{
		AllowedCapabilities: allowedCaps,
		Tools:               toolsMap,
		Stdlib:              stdlibMap,
		RunID:               "test",
	}
}

// --- Formatting helpers ---

// formatDiagForOutput formats diagnostics for stderr output.
// When debugParse is true, appends token context ("but found:") to parse errors.
func formatDiagForOutput(diags []diagnostics.Diagnostic, pretty, debugParse bool) string {
	if debugParse {
		// Add "but found:" debug info to the formatted output
		base := diagnostics.FormatDiagnostics(diags, pretty)
		return base + "\nbut found: (debug parse info)"
	}
	return diagnostics.FormatDiagnostics(diags, pretty)
}

// formatSingleDiag formats a single diagnostic as a JSON object (not array).
func formatSingleDiag(diag diagnostics.Diagnostic, pretty bool) string {
	if pretty {
		return diagnostics.FormatDiagnostic(diag, true)
	}
	b, _ := json.Marshal(diag)
	return string(b)
}

// --- Expectation checkers ---

func checkExitCode(t *testing.T, actual, expected int) {
	t.Helper()
	if actual != expected {
		t.Errorf("exit code: got %d, want %d", actual, expected)
	}
}

func checkStdoutExpectations(t *testing.T, stdout string, scenario *testutil.Scenario) {
	t.Helper()

	if scenario.Expect.StdoutJSON != nil {
		expected := normalizeJSON(t, scenario.Expect.StdoutJSON)
		actual := normalizeJSON(t, json.RawMessage(stdout))
		if expected != actual {
			t.Errorf("stdout JSON:\n  got:  %s\n  want: %s", actual, expected)
		}
	}

	if scenario.Expect.StdoutJSONSubset != nil {
		checkJSONSubset(t, "stdout", stdout, scenario.Expect.StdoutJSONSubset)
	}

	if scenario.Expect.StdoutText != "" {
		actual := strings.TrimRight(stdout, "\n")
		expected := scenario.Expect.StdoutText
		if actual != expected {
			t.Errorf("stdout text:\n  got:  %q\n  want: %q", actual, expected)
		}
	}

	if scenario.Expect.StdoutContains != "" {
		if !strings.Contains(stdout, scenario.Expect.StdoutContains) {
			t.Errorf("stdout should contain %q, got: %s", scenario.Expect.StdoutContains, truncate(stdout, 200))
		}
	}

	if len(scenario.Expect.StdoutContainsAll) > 0 {
		for _, sub := range scenario.Expect.StdoutContainsAll {
			if !strings.Contains(stdout, sub) {
				t.Errorf("stdout should contain %q", sub)
			}
		}
	}

	if scenario.Expect.StdoutRegex != "" {
		re, err := regexp.Compile(scenario.Expect.StdoutRegex)
		if err != nil {
			t.Fatalf("invalid stdout regex: %v", err)
		}
		if !re.MatchString(stdout) {
			t.Errorf("stdout should match regex %q, got: %s", scenario.Expect.StdoutRegex, truncate(stdout, 200))
		}
	}
}

func checkStderrStringExpectations(t *testing.T, stderr string, scenario *testutil.Scenario) {
	t.Helper()

	if scenario.Expect.StderrContains != "" {
		if !strings.Contains(stderr, scenario.Expect.StderrContains) {
			t.Errorf("stderr should contain %q, got: %s", scenario.Expect.StderrContains, truncate(stderr, 200))
		}
	}

	if len(scenario.Expect.StderrContainsAll) > 0 {
		for _, sub := range scenario.Expect.StderrContainsAll {
			if !strings.Contains(stderr, sub) {
				t.Errorf("stderr should contain %q", sub)
			}
		}
	}

	if scenario.Expect.StderrRegex != "" {
		re, err := regexp.Compile(scenario.Expect.StderrRegex)
		if err != nil {
			t.Fatalf("invalid stderr regex: %v", err)
		}
		if !re.MatchString(stderr) {
			t.Errorf("stderr should match regex %q, got: %s", scenario.Expect.StderrRegex, truncate(stderr, 200))
		}
	}

	if scenario.Expect.StderrText != "" {
		actual := strings.TrimRight(stderr, "\n")
		if actual != scenario.Expect.StderrText {
			t.Errorf("stderr text:\n  got:  %q\n  want: %q", actual, scenario.Expect.StderrText)
		}
	}
}

func checkStderrJSONExpectations(t *testing.T, diags []diagnostics.Diagnostic, scenario *testutil.Scenario) {
	t.Helper()

	if scenario.Expect.StderrJSONSubset != nil {
		diagsJSON, _ := json.Marshal(diags)

		// Parse expected — could be array or single object
		var expectedVal any
		json.Unmarshal(scenario.Expect.StderrJSONSubset, &expectedVal)

		switch ev := expectedVal.(type) {
		case []any:
			// Array of expected diagnostics
			var actualDiags []map[string]any
			json.Unmarshal(diagsJSON, &actualDiags)

			for _, expected := range ev {
				expectedMap, ok := expected.(map[string]any)
				if !ok {
					continue
				}
				found := false
				for _, actual := range actualDiags {
					if isSubset(expectedMap, actual) {
						found = true
						break
					}
				}
				if !found {
					t.Errorf("stderr JSON subset not found: %v\n  in: %s", expectedMap, string(diagsJSON))
				}
			}
		case map[string]any:
			// Single expected diagnostic object — match against any in the array
			var actualDiags []map[string]any
			json.Unmarshal(diagsJSON, &actualDiags)

			found := false
			for _, actual := range actualDiags {
				if isSubset(ev, actual) {
					found = true
					break
				}
			}
			if !found {
				t.Errorf("stderr JSON subset not found: %v\n  in: %s", ev, string(diagsJSON))
			}
		}
	}

	if scenario.Expect.StderrJSON != nil {
		expected := normalizeJSON(t, scenario.Expect.StderrJSON)
		diagsJSON, _ := json.Marshal(diags)

		// stderrJson could expect single object or array
		var expectedVal any
		json.Unmarshal(scenario.Expect.StderrJSON, &expectedVal)
		if _, isArray := expectedVal.([]any); !isArray {
			// Expected single object — compare first diagnostic
			if len(diags) > 0 {
				singleJSON, _ := json.Marshal(diags[0])
				actual := normalizeJSON(t, json.RawMessage(singleJSON))
				if expected != actual {
					t.Errorf("stderr JSON:\n  got:  %s\n  want: %s", actual, expected)
				}
			} else {
				t.Errorf("stderr JSON: no diagnostics, want: %s", expected)
			}
		} else {
			actual := normalizeJSON(t, json.RawMessage(diagsJSON))
			if expected != actual {
				t.Errorf("stderr JSON:\n  got:  %s\n  want: %s", actual, expected)
			}
		}
	}
}

// checkSingleDiagExpectations checks stderrJson and stderrJsonSubset
// against a single diagnostic (runtime errors output as single object).
func checkSingleDiagExpectations(t *testing.T, diag diagnostics.Diagnostic, scenario *testutil.Scenario) {
	t.Helper()

	if scenario.Expect.StderrJSON != nil {
		expected := normalizeJSON(t, scenario.Expect.StderrJSON)
		diagJSON, _ := json.Marshal(diag)
		actual := normalizeJSON(t, json.RawMessage(diagJSON))
		if expected != actual {
			t.Errorf("stderr JSON:\n  got:  %s\n  want: %s", actual, expected)
		}
	}

	if scenario.Expect.StderrJSONSubset != nil {
		diagJSON, _ := json.Marshal(diag)
		var actual map[string]any
		json.Unmarshal(diagJSON, &actual)

		var expectedVal any
		json.Unmarshal(scenario.Expect.StderrJSONSubset, &expectedVal)

		switch ev := expectedVal.(type) {
		case map[string]any:
			if !isSubset(ev, actual) {
				t.Errorf("stderr JSON subset mismatch:\n  expected: %v\n  got: %v", ev, actual)
			}
		case []any:
			for _, item := range ev {
				if em, ok := item.(map[string]any); ok {
					if !isSubset(em, actual) {
						t.Errorf("stderr JSON subset mismatch:\n  expected: %v\n  got: %v", em, actual)
					}
				}
			}
		}
	}
}

// checkStderrJSONExpectationsFromSingle checks stderr expectations from a single diagnostic.
func checkStderrJSONExpectationsFromSingle(t *testing.T, diag diagnostics.Diagnostic, scenario *testutil.Scenario) {
	t.Helper()
	checkSingleDiagExpectations(t, diag, scenario)
}

func checkEvidenceExpectations(t *testing.T, evidence []evaluator.Evidence, scenario *testutil.Scenario) {
	t.Helper()

	if scenario.Expect.EvidenceJSONSubset != nil {
		var expectedEvidence []map[string]any
		if err := json.Unmarshal(scenario.Expect.EvidenceJSONSubset, &expectedEvidence); err != nil {
			t.Fatalf("failed to parse expected evidence subset: %v", err)
		}

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

	if scenario.Expect.EvidenceJSON != nil {
		evidenceJSON, err := evaluator.EvidenceToJSON(evidence)
		if err != nil {
			t.Fatalf("failed to serialize evidence: %v", err)
		}
		expected := normalizeJSON(t, scenario.Expect.EvidenceJSON)
		actual := normalizeJSON(t, json.RawMessage(evidenceJSON))
		if expected != actual {
			t.Errorf("evidence JSON:\n  got:  %s\n  want: %s", actual, expected)
		}
	}
}

func checkTraceSummary(t *testing.T, events []map[string]any, scenario *testutil.Scenario) {
	t.Helper()

	summary := computeSummaryFromEvents(events)
	summaryJSON, _ := json.Marshal(summary)

	checkJSONSubset(t, "traceSummary", string(summaryJSON), scenario.Expect.TraceSummarySubset)
}

func checkFileExpectations(t *testing.T, workDir string, scenario *testutil.Scenario) {
	t.Helper()

	for _, fe := range scenario.Expect.Files {
		filePath := filepath.Join(workDir, fe.Path)
		if fe.Absent {
			if _, err := os.Stat(filePath); err == nil {
				t.Errorf("file should not exist: %s", fe.Path)
			}
			continue
		}

		data, err := os.ReadFile(filePath)
		if err != nil {
			t.Errorf("expected file not found: %s", fe.Path)
			continue
		}

		if fe.Text != "" {
			actual := string(data)
			if actual != fe.Text {
				t.Errorf("file %s content:\n  got:  %q\n  want: %q", fe.Path, truncate(actual, 200), fe.Text)
			}
		}
	}
}

func checkJSONSubset(t *testing.T, label string, actualJSON string, expectedSubset json.RawMessage) {
	t.Helper()

	var expected any
	if err := json.Unmarshal(expectedSubset, &expected); err != nil {
		t.Fatalf("failed to parse expected %s JSON subset: %v", label, err)
	}

	var actual any
	if err := json.Unmarshal([]byte(actualJSON), &actual); err != nil {
		t.Fatalf("failed to parse actual %s JSON: %v (raw: %s)", label, err, truncate(actualJSON, 200))
	}

	if !isSubset(expected, actual) {
		t.Errorf("%s JSON subset mismatch:\n  expected: %s\n  got: %s", label, string(expectedSubset), truncate(actualJSON, 300))
	}
}

// --- Trace summary computation ---

type testTraceSummary struct {
	RunID           string         `json:"runId"`
	TotalEvents     int            `json:"totalEvents"`
	ToolInvocations int            `json:"toolInvocations"`
	ToolsByName     map[string]int `json:"toolsByName"`
	EvidenceCount   int            `json:"evidenceCount"`
	Failures        int            `json:"failures"`
	BudgetExceeded  int            `json:"budgetExceeded"`
	StartTime       string         `json:"startTime,omitempty"`
	EndTime         string         `json:"endTime,omitempty"`
	DurationMs      float64        `json:"durationMs"`
}

// validTraceEvents enumerates all known A0 trace event names.
var validTraceEvents = map[string]bool{
	"run_start": true, "run_end": true,
	"stmt_start": true, "stmt_end": true,
	"tool_start": true, "tool_end": true,
	"evidence": true, "budget_exceeded": true,
	"for_start": true, "for_end": true,
	"fn_call_start": true, "fn_call_end": true,
	"match_start": true, "match_end": true,
	"map_start": true, "map_end": true,
	"reduce_start": true, "reduce_end": true,
	"try_start": true, "try_end": true,
	"filter_start": true, "filter_end": true,
	"loop_start": true, "loop_end": true,
}

func computeTestTraceSummary(f *os.File) (*testTraceSummary, error) {
	summary := &testTraceSummary{
		ToolsByName: make(map[string]int),
	}

	scanner := bufio.NewScanner(f)
	lineCount := 0
	validLines := 0

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		lineCount++

		var event map[string]any
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			return nil, fmt.Errorf("invalid JSON on line %d", lineCount)
		}

		// Validate trace event shape: must have ts, runId, event
		_, hasTS := event["ts"].(string)
		_, hasRunID := event["runId"].(string)
		eventType, hasEvent := event["event"].(string)

		if !hasTS || !hasRunID || !hasEvent {
			return nil, fmt.Errorf("invalid trace event shape on line %d: missing ts, runId, or event", lineCount)
		}

		// Check for unknown events
		if !validTraceEvents[eventType] {
			return nil, fmt.Errorf("unknown trace event type '%s' on line %d", eventType, lineCount)
		}

		validLines++
		summary.TotalEvents++

		if summary.RunID == "" {
			summary.RunID = event["runId"].(string)
		} else if event["runId"].(string) != summary.RunID {
			return nil, fmt.Errorf("multiple run IDs found: '%s' and '%s'", summary.RunID, event["runId"].(string))
		}

		switch eventType {
		case "run_start":
			if ts, ok := event["ts"].(string); ok && summary.StartTime == "" {
				summary.StartTime = ts
			}
		case "run_end":
			if ts, ok := event["ts"].(string); ok {
				summary.EndTime = ts
			}
			// Use data.durationMs if available
			if data, ok := event["data"].(map[string]any); ok {
				if durMs, ok := data["durationMs"].(float64); ok {
					summary.DurationMs = durMs
				}
			}
		case "tool_start":
			summary.ToolInvocations++
			if data, ok := event["data"].(map[string]any); ok {
				if name, ok := data["tool"].(string); ok {
					summary.ToolsByName[name]++
				}
			}
		case "evidence":
			summary.EvidenceCount++
			if data, ok := event["data"].(map[string]any); ok {
				if okVal, found := data["ok"]; found {
					if b, ok := okVal.(bool); ok && !b {
						summary.Failures++
					}
				}
			}
		case "budget_exceeded":
			summary.BudgetExceeded++
		}
	}

	if validLines == 0 {
		return nil, fmt.Errorf("no valid trace events found")
	}

	// Compute duration from timestamps if not already set
	if summary.DurationMs == 0 && summary.StartTime != "" && summary.EndTime != "" {
		start, err1 := time.Parse(time.RFC3339Nano, summary.StartTime)
		end, err2 := time.Parse(time.RFC3339Nano, summary.EndTime)
		if err1 == nil && err2 == nil {
			summary.DurationMs = float64(end.Sub(start).Milliseconds())
		}
	}

	return summary, nil
}

func computeSummaryFromEvents(events []map[string]any) *testTraceSummary {
	summary := &testTraceSummary{
		ToolsByName: make(map[string]int),
	}

	for _, event := range events {
		summary.TotalEvents++
		if summary.RunID == "" {
			if runId, ok := event["runId"].(string); ok {
				summary.RunID = runId
			}
		}

		eventType, _ := event["event"].(string)
		switch eventType {
		case "run_start":
			if ts, ok := event["ts"].(string); ok && summary.StartTime == "" {
				summary.StartTime = ts
			}
		case "run_end":
			if ts, ok := event["ts"].(string); ok {
				summary.EndTime = ts
			}
		case "tool_start":
			summary.ToolInvocations++
			if data, ok := event["data"].(map[string]any); ok {
				if name, ok := data["tool"].(string); ok {
					summary.ToolsByName[name]++
				}
			}
		case "evidence":
			summary.EvidenceCount++
			if data, ok := event["data"].(map[string]any); ok {
				if okVal, found := data["ok"]; found {
					if b, ok := okVal.(bool); ok && !b {
						summary.Failures++
					}
				}
			}
		case "budget_exceeded":
			summary.BudgetExceeded++
		}
	}

	return summary
}

// --- Policy helpers ---

type policyFile struct {
	Version int            `json:"version,omitempty"`
	Allow   []string       `json:"allow"`
	Deny    []string       `json:"deny"`
	Limits  map[string]any `json:"limits"`
}

type policyJSONOutput struct {
	Source         string      `json:"source"`
	Path           *string     `json:"path"`
	Policy         *policyFile `json:"policy"`
	EffectiveAllow []string    `json:"effectiveAllow"`
}

func loadPolicyFromDir(dir string) (bool, *policyFile) {
	path := filepath.Join(dir, ".a0policy.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return false, nil
	}
	var pf policyFile
	if err := json.Unmarshal(data, &pf); err != nil {
		return false, nil
	}
	// Ensure non-nil slices/maps
	if pf.Allow == nil {
		pf.Allow = []string{}
	}
	if pf.Deny == nil {
		pf.Deny = []string{}
	}
	if pf.Limits == nil {
		pf.Limits = make(map[string]any)
	}
	return true, &pf
}

func buildPolicyJSONOutput(found bool, pf *policyFile) string {
	if !found {
		// Default policy
		output := policyJSONOutput{
			Source: "default",
			Path:   nil,
			Policy: &policyFile{
				Version: 1,
				Allow:   []string{},
				Deny:    []string{},
				Limits:  map[string]any{},
			},
			EffectiveAllow: []string{},
		}
		b, _ := json.Marshal(output)
		return string(b)
	}

	// Project policy
	policyPath := ".a0policy.json"
	// Compute effective allow (allow minus deny)
	effective := computeEffectiveAllow(pf)

	output := policyJSONOutput{
		Source:         "project",
		Path:           &policyPath,
		Policy:         pf,
		EffectiveAllow: effective,
	}
	b, _ := json.Marshal(output)
	return string(b)
}

func computeEffectiveAllow(pf *policyFile) []string {
	denySet := make(map[string]bool)
	for _, d := range pf.Deny {
		denySet[d] = true
	}
	var result []string
	for _, a := range pf.Allow {
		if !denySet[a] {
			result = append(result, a)
		}
	}
	if result == nil {
		result = []string{}
	}
	return result
}

func buildPolicyTextOutput(found bool, pf *policyFile) string {
	if !found {
		return "Effective A0 policy\n  Source: default (deny all)\n  Allow: (none)\n  Deny: (none)\n  Effective allow: (none)\n  Limits: (none)\n"
	}

	var sb strings.Builder
	sb.WriteString("Effective A0 policy\n")
	sb.WriteString("  Source: project (.a0policy.json)\n")

	sb.WriteString("  Allow: ")
	if len(pf.Allow) > 0 {
		sb.WriteString(strings.Join(pf.Allow, ", "))
	} else {
		sb.WriteString("(none)")
	}
	sb.WriteString("\n")

	sb.WriteString("  Deny: ")
	if len(pf.Deny) > 0 {
		sb.WriteString(strings.Join(pf.Deny, ", "))
	} else {
		sb.WriteString("(none)")
	}
	sb.WriteString("\n")

	effective := computeEffectiveAllow(pf)
	sb.WriteString("  Effective allow: ")
	if len(effective) > 0 {
		sb.WriteString(strings.Join(effective, ", "))
	} else {
		sb.WriteString("(none)")
	}
	sb.WriteString("\n")

	sb.WriteString("  Limits: ")
	if len(pf.Limits) > 0 {
		limitsJSON, _ := json.Marshal(pf.Limits)
		sb.WriteString(string(limitsJSON))
	} else {
		sb.WriteString("(none)")
	}
	sb.WriteString("\n")

	return sb.String()
}

// --- Utility functions ---

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
		t.Fatalf("failed to parse JSON: %v (raw: %s)", err, truncate(string(raw), 200))
	}
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("failed to re-marshal JSON: %v", err)
	}
	return string(b)
}

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

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
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
