// Package diagnostics defines A0 diagnostic types for parse/validation/runtime errors.
package diagnostics

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/thomasrohde/agent0/go/pkg/ast"
)

// Diagnostic code constants.
const (
	ELex            = "E_LEX"
	EParse          = "E_PARSE"
	EAst            = "E_AST"
	ENoReturn       = "E_NO_RETURN"
	EReturnNotLast  = "E_RETURN_NOT_LAST"
	EUnknownCap     = "E_UNKNOWN_CAP"
	EDupBinding     = "E_DUP_BINDING"
	EUnbound        = "E_UNBOUND"
	EToolArgs       = "E_TOOL_ARGS"
	EUnknownTool    = "E_UNKNOWN_TOOL"
	ECallEffect     = "E_CALL_EFFECT"
	ECapDenied      = "E_CAP_DENIED"
	ETool           = "E_TOOL"
	EUnknownFn      = "E_UNKNOWN_FN"
	EFn             = "E_FN"
	EAssert         = "E_ASSERT"
	ECheck          = "E_CHECK"
	EPath           = "E_PATH"
	EUndeclaredCap  = "E_UNDECLARED_CAP"
	EBudget         = "E_BUDGET"
	EUnknownBudget  = "E_UNKNOWN_BUDGET"
	EFnDup          = "E_FN_DUP"
	EForNotList     = "E_FOR_NOT_LIST"
	EMatchNotRecord = "E_MATCH_NOT_RECORD"
	EMatchNoArm     = "E_MATCH_NO_ARM"
	EType           = "E_TYPE"
	EIO             = "E_IO"
)

// Diagnostic represents a parse, validation, or runtime diagnostic.
type Diagnostic struct {
	Code    string    `json:"code"`
	Message string    `json:"message"`
	Span    *ast.Span `json:"span,omitempty"`
	Hint    string    `json:"hint,omitempty"`
}

// MakeDiag creates a new Diagnostic.
func MakeDiag(code, message string, span *ast.Span, hint string) Diagnostic {
	return Diagnostic{
		Code:    code,
		Message: message,
		Span:    span,
		Hint:    hint,
	}
}

// FormatDiagnostic formats a single diagnostic for display.
func FormatDiagnostic(d Diagnostic, pretty bool) string {
	if !pretty {
		b, _ := json.Marshal(d)
		return string(b)
	}
	loc := "<unknown>"
	if d.Span != nil {
		loc = fmt.Sprintf("%s:%d:%d", d.Span.File, d.Span.StartLine, d.Span.StartCol)
	}
	out := fmt.Sprintf("error[%s]: %s\n  --> %s", d.Code, d.Message, loc)
	if d.Hint != "" {
		out += fmt.Sprintf("\n  hint: %s", d.Hint)
	}
	return out
}

// FormatDiagnostics formats a slice of diagnostics for display.
func FormatDiagnostics(diags []Diagnostic, pretty bool) string {
	if !pretty {
		b, _ := json.Marshal(diags)
		return string(b)
	}
	parts := make([]string, len(diags))
	for i, d := range diags {
		parts[i] = FormatDiagnostic(d, true)
	}
	return strings.Join(parts, "\n\n")
}
