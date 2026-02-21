// Command a0 is the native A0 CLI entry point.
package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/thomasrohde/agent0/go/pkg/capabilities"
	"github.com/thomasrohde/agent0/go/pkg/diagnostics"
	"github.com/thomasrohde/agent0/go/pkg/evaluator"
	"github.com/thomasrohde/agent0/go/pkg/formatter"
	"github.com/thomasrohde/agent0/go/pkg/help"
	"github.com/thomasrohde/agent0/go/pkg/runtime"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: a0 <command> [options]")
		fmt.Fprintln(os.Stderr, "commands: run, check, fmt, trace, help, policy")
		os.Exit(1)
	}

	cmd := os.Args[1]
	switch cmd {
	case "run":
		os.Exit(cmdRun(os.Args[2:]))
	case "check":
		os.Exit(cmdCheck(os.Args[2:]))
	case "fmt":
		os.Exit(cmdFmt(os.Args[2:]))
	case "trace":
		os.Exit(cmdTrace(os.Args[2:]))
	case "help", "--help", "-h":
		os.Exit(cmdHelp(os.Args[2:]))
	case "policy":
		os.Exit(cmdPolicy(os.Args[2:]))
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n", cmd)
		os.Exit(1)
	}
}

func cmdRun(args []string) int {
	var file string
	pretty := false
	unsafeAllowAll := false
	evidencePath := ""
	debugParse := false
	traceEnabled := false

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--pretty":
			pretty = true
		case "--unsafe-allow-all":
			unsafeAllowAll = true
		case "--evidence":
			if i+1 < len(args) {
				i++
				evidencePath = args[i]
			}
		case "--debug-parse":
			debugParse = true
		case "--trace":
			traceEnabled = true
		default:
			if !strings.HasPrefix(args[i], "-") {
				file = args[i]
			}
		}
	}

	if file == "" {
		fmt.Fprintln(os.Stderr, "usage: a0 run <file> [--pretty] [--unsafe-allow-all] [--evidence <path>]")
		return 1
	}

	source, filename, exitCode := readSource(file, pretty)
	if exitCode != 0 {
		return exitCode
	}

	_ = debugParse
	_ = traceEnabled

	// Build runtime
	var opts []runtime.Option
	if unsafeAllowAll {
		opts = append(opts, runtime.WithUnsafeAllowAll())
	}
	rt := runtime.New(opts...)

	// Execute
	ctx := context.Background()
	result, execErr := rt.Run(ctx, source, filename)

	if execErr != nil {
		if diagErr, ok := execErr.(*runtime.DiagnosticError); ok {
			fmt.Fprintln(os.Stderr, diagnostics.FormatDiagnostics(diagErr.Diagnostics, pretty))
			return 2
		}
		if rtErr, ok := execErr.(*evaluator.A0RuntimeError); ok {
			diag := diagnostics.MakeDiag(rtErr.Code, rtErr.Message, rtErr.Span, "")
			fmt.Fprintln(os.Stderr, diagnostics.FormatDiagnostics([]diagnostics.Diagnostic{diag}, pretty))

			// Write evidence if available
			if result != nil && len(result.Evidence) > 0 && evidencePath != "" {
				writeEvidence(evidencePath, result.Evidence)
			}

			return exitCodeForDiag(rtErr.Code)
		}
		fmt.Fprintln(os.Stderr, execErr.Error())
		return 4
	}

	// Write evidence if requested
	if result != nil && len(result.Evidence) > 0 && evidencePath != "" {
		writeEvidence(evidencePath, result.Evidence)
	}

	// Output value
	if result != nil && result.Value != nil {
		jsonBytes, err := evaluator.ValueToJSON(result.Value)
		if err != nil {
			fmt.Fprintf(os.Stderr, "error serializing result: %s\n", err)
			return 4
		}
		fmt.Println(string(jsonBytes))
	}

	// Check if any evidence failed
	if result != nil {
		for _, ev := range result.Evidence {
			if !ev.OK {
				return 5
			}
		}
	}

	return 0
}

func cmdCheck(args []string) int {
	var file string
	pretty := false
	debugParse := false

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--pretty":
			pretty = true
		case "--debug-parse":
			debugParse = true
		default:
			if !strings.HasPrefix(args[i], "-") {
				file = args[i]
			}
		}
	}

	if file == "" {
		fmt.Fprintln(os.Stderr, "usage: a0 check <file> [--pretty]")
		return 1
	}

	_ = debugParse

	source, filename, exitCode := readSource(file, pretty)
	if exitCode != 0 {
		return exitCode
	}

	rt := runtime.New()
	diags := rt.Check(source, filename)
	if len(diags) > 0 {
		fmt.Fprintln(os.Stderr, diagnostics.FormatDiagnostics(diags, pretty))
		return 2
	}

	// Valid program
	if pretty {
		fmt.Println("No errors found.")
	} else {
		fmt.Println("[]")
	}
	return 0
}

func cmdFmt(args []string) int {
	var file string
	write := false

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--write":
			write = true
		default:
			if !strings.HasPrefix(args[i], "-") {
				file = args[i]
			}
		}
	}

	if file == "" {
		fmt.Fprintln(os.Stderr, "usage: a0 fmt <file> [--write]")
		return 1
	}

	// Read source
	sourceBytes, err := os.ReadFile(file)
	if err != nil {
		diag := diagnostics.MakeDiag(diagnostics.EIO, fmt.Sprintf("cannot read file: %s", file), nil, "")
		fmt.Fprintln(os.Stderr, diagnostics.FormatDiagnostics([]diagnostics.Diagnostic{diag}, false))
		return 1
	}
	source := string(sourceBytes)

	rt := runtime.New()
	formatted, fmtErr := rt.Format(source, file)
	if fmtErr != nil {
		if diagErr, ok := fmtErr.(*runtime.DiagnosticError); ok {
			fmt.Fprintln(os.Stderr, diagnostics.FormatDiagnostics(diagErr.Diagnostics, false))
			return 2
		}
		fmt.Fprintln(os.Stderr, fmtErr.Error())
		return 2
	}

	// Warn about comments
	if formatter.HasComments(source) {
		fmt.Fprintln(os.Stderr, "warning: comments are not preserved by the formatter")
	}

	if write {
		if err := os.WriteFile(file, []byte(formatted), 0644); err != nil {
			fmt.Fprintf(os.Stderr, "error writing file: %s\n", err)
			return 1
		}
	} else {
		// Output without trailing newline (Format adds one)
		fmt.Print(formatted)
	}

	return 0
}

func cmdTrace(args []string) int {
	var file string
	jsonOutput := false
	textOutput := false

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--json":
			jsonOutput = true
		case "--text":
			textOutput = true
		default:
			if !strings.HasPrefix(args[i], "-") {
				file = args[i]
			}
		}
	}

	if file == "" {
		fmt.Fprintln(os.Stderr, "usage: a0 trace <file.jsonl> [--json|--text]")
		return 1
	}

	// Read and parse NDJSON trace file
	f, err := os.Open(file)
	if err != nil {
		diag := diagnostics.MakeDiag(diagnostics.EIO, fmt.Sprintf("cannot read file: %s", file), nil, "")
		fmt.Fprintln(os.Stderr, diagnostics.FormatDiagnostics([]diagnostics.Diagnostic{diag}, false))
		return 1
	}
	defer f.Close()

	summary := computeTraceSummary(f)

	if textOutput {
		printTraceSummaryText(summary)
	} else if jsonOutput {
		b, _ := json.Marshal(summary)
		fmt.Println(string(b))
	} else {
		// Default to JSON
		b, _ := json.Marshal(summary)
		fmt.Println(string(b))
	}

	return 0
}

func cmdHelp(args []string) int {
	showIndex := false
	topic := ""
	for _, arg := range args {
		if arg == "--index" {
			showIndex = true
		} else if !strings.HasPrefix(arg, "-") {
			topic = arg
		}
	}

	if showIndex {
		if topic == "" {
			fmt.Fprintln(os.Stderr, "error: --index requires a topic (e.g., a0 help stdlib --index)")
			return 1
		}
		if topic != "stdlib" {
			fmt.Fprintf(os.Stderr, "error: --index is only supported for the stdlib topic\n")
			return 1
		}
		fmt.Print(help.StdlibIndex())
		return 0
	}

	if topic == "" {
		fmt.Print(help.QUICKREF)
		return 0
	}

	name, content, err := help.MatchTopic(topic)
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s\nAvailable topics: %s\n", err, strings.Join(help.TopicList, ", "))
		return 1
	}
	_ = name
	fmt.Print(content)
	return 0
}

func cmdPolicy(args []string) int {
	cwd, _ := os.Getwd()
	policy, pf := capabilities.LoadPolicy(cwd)

	if pf != nil {
		b, _ := json.MarshalIndent(pf, "", "  ")
		fmt.Println(string(b))
	} else {
		// Deny-all default
		fmt.Println("{}")
		_ = policy
	}
	return 0
}

type TraceSummary struct {
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

type traceEvent struct {
	Event string         `json:"event"`
	RunID string         `json:"runId"`
	TS    string         `json:"ts"`
	Data  map[string]any `json:"data,omitempty"`
}

func computeTraceSummary(r io.Reader) *TraceSummary {
	summary := &TraceSummary{
		ToolsByName: make(map[string]int),
	}

	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		var event traceEvent
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			continue // skip invalid lines
		}

		summary.TotalEvents++
		if summary.RunID == "" {
			summary.RunID = event.RunID
		}

		switch event.Event {
		case "run_start":
			if summary.StartTime == "" {
				summary.StartTime = event.TS
			}
		case "run_end":
			summary.EndTime = event.TS
		case "tool_start":
			summary.ToolInvocations++
			if name, ok := event.Data["tool"]; ok {
				if s, ok := name.(string); ok {
					summary.ToolsByName[s]++
				}
			}
		case "evidence":
			summary.EvidenceCount++
			if ok, found := event.Data["ok"]; found {
				if b, ok := ok.(bool); ok && !b {
					summary.Failures++
				}
			}
		case "budget_exceeded":
			summary.BudgetExceeded++
		}
	}

	// Compute duration from start/end times
	if summary.StartTime != "" && summary.EndTime != "" {
		start, err1 := parseTime(summary.StartTime)
		end, err2 := parseTime(summary.EndTime)
		if err1 == nil && err2 == nil {
			summary.DurationMs = float64(end.Sub(start).Milliseconds())
		}
	}

	return summary
}

func printTraceSummaryText(s *TraceSummary) {
	fmt.Printf("Run: %s\n", s.RunID)
	fmt.Printf("Events: %d\n", s.TotalEvents)
	fmt.Printf("Tools: %d invocations\n", s.ToolInvocations)
	for name, count := range s.ToolsByName {
		fmt.Printf("  %s: %d\n", name, count)
	}
	fmt.Printf("Evidence: %d (%d failures)\n", s.EvidenceCount, s.Failures)
	if s.DurationMs > 0 {
		fmt.Printf("Duration: %.0fms\n", s.DurationMs)
	}
}

func readSource(file string, pretty bool) (string, string, int) {
	if file == "-" {
		// Read from stdin
		data, err := io.ReadAll(os.Stdin)
		if err != nil {
			fmt.Fprintf(os.Stderr, "error reading stdin: %s\n", err)
			return "", "", 1
		}
		return string(data), "<stdin>", 0
	}

	source, err := os.ReadFile(file)
	if err != nil {
		diag := diagnostics.MakeDiag(diagnostics.EIO, fmt.Sprintf("cannot read file: %s", file), nil, "")
		fmt.Fprintln(os.Stderr, diagnostics.FormatDiagnostics([]diagnostics.Diagnostic{diag}, pretty))
		return "", "", 1
	}
	return string(source), file, 0
}

func exitCodeForDiag(code string) int {
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

func parseTime(s string) (time.Time, error) {
	// Try RFC3339Nano first, then other common formats
	t, err := time.Parse(time.RFC3339Nano, s)
	if err == nil {
		return t, nil
	}
	t, err = time.Parse(time.RFC3339, s)
	if err == nil {
		return t, nil
	}
	return time.Time{}, fmt.Errorf("cannot parse time: %s", s)
}

func writeEvidence(path string, evidence []evaluator.Evidence) {
	data, err := evaluator.EvidenceToJSON(evidence)
	if err != nil {
		return
	}
	_ = os.WriteFile(path, data, 0644)
}
