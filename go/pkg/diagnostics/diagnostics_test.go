package diagnostics_test

import (
	"strings"
	"testing"

	"github.com/thomasrohde/agent0/go/pkg/ast"
	"github.com/thomasrohde/agent0/go/pkg/diagnostics"
)

func TestMakeDiag(t *testing.T) {
	span := &ast.Span{File: "test.a0", StartLine: 1, StartCol: 1, EndLine: 1, EndCol: 5}
	d := diagnostics.MakeDiag(diagnostics.EParse, "unexpected token", span, "check syntax")

	if d.Code != diagnostics.EParse {
		t.Errorf("got Code = %q, want %q", d.Code, diagnostics.EParse)
	}
	if d.Message != "unexpected token" {
		t.Errorf("got Message = %q, want %q", d.Message, "unexpected token")
	}
}

func TestFormatDiagnosticPretty(t *testing.T) {
	span := &ast.Span{File: "test.a0", StartLine: 3, StartCol: 5, EndLine: 3, EndCol: 10}
	d := diagnostics.MakeDiag(diagnostics.EUnbound, "unbound variable 'x'", span, "did you mean 'y'?")

	out := diagnostics.FormatDiagnostic(d, true)
	if !strings.Contains(out, "error[E_UNBOUND]") {
		t.Errorf("expected error code in output, got: %s", out)
	}
	if !strings.Contains(out, "test.a0:3:5") {
		t.Errorf("expected location in output, got: %s", out)
	}
	if !strings.Contains(out, "hint:") {
		t.Errorf("expected hint in output, got: %s", out)
	}
}

func TestFormatDiagnosticJSON(t *testing.T) {
	d := diagnostics.MakeDiag(diagnostics.ELex, "bad token", nil, "")
	out := diagnostics.FormatDiagnostic(d, false)
	if !strings.Contains(out, `"code":"E_LEX"`) {
		t.Errorf("expected JSON code in output, got: %s", out)
	}
}
