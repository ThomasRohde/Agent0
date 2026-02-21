package ast_test

import (
	"testing"

	"github.com/thomasrohde/agent0/go/pkg/ast"
)

func TestNodeKinds(t *testing.T) {
	nodes := []ast.Node{
		&ast.IntLiteral{Value: 42},
		&ast.FloatLiteral{Value: 3.14},
		&ast.BoolLiteral{Value: true},
		&ast.StrLiteral{Value: "hello"},
		&ast.NullLiteral{},
		&ast.IdentPath{Parts: []string{"x"}},
		&ast.RecordExpr{},
		&ast.ListExpr{},
	}

	expected := []string{
		"IntLiteral", "FloatLiteral", "BoolLiteral", "StrLiteral",
		"NullLiteral", "IdentPath", "RecordExpr", "ListExpr",
	}

	for i, node := range nodes {
		if got := node.Kind(); got != expected[i] {
			t.Errorf("node %d: got Kind() = %q, want %q", i, got, expected[i])
		}
	}
}
