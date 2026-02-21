// Package formatter implements the A0 source code formatter.
package formatter

import (
	"fmt"
	"math"
	"strconv"
	"strings"

	"github.com/thomasrohde/agent0/go/pkg/ast"
)

const indent = "  "

// Precedence table for binary operators (higher = tighter binding)
var precedence = map[ast.BinaryOp]int{
	ast.OpEqEq: 1, ast.OpNeq: 1,
	ast.OpGt: 2, ast.OpLt: 2, ast.OpGtEq: 2, ast.OpLtEq: 2,
	ast.OpAdd: 3, ast.OpSub: 3,
	ast.OpMul: 4, ast.OpDiv: 4, ast.OpMod: 4,
}

func needsParens(child ast.Expr, parentOp ast.BinaryOp, isRight bool) bool {
	bin, ok := child.(*ast.BinaryExpr)
	if !ok {
		return false
	}
	childPrec := precedence[bin.Op]
	parentPrec := precedence[parentOp]
	if childPrec < parentPrec {
		return true
	}
	// Right-associativity: for same-precedence on right side, add parens
	if childPrec == parentPrec && isRight {
		return true
	}
	return false
}

// Format pretty-prints an A0 AST back to source code.
func Format(program *ast.Program) string {
	var lines []string

	// Headers
	for _, h := range program.Headers {
		lines = append(lines, formatHeader(h))
	}

	if len(program.Headers) > 0 && len(program.Statements) > 0 {
		lines = append(lines, "")
	}

	// Statements
	for _, s := range program.Statements {
		lines = append(lines, formatStmt(s, 0))
	}

	return strings.Join(lines, "\n") + "\n"
}

// HasComments checks if a source string contains A0 comments (# prefix).
func HasComments(source string) bool {
	lines := strings.Split(source, "\n")
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "#") {
			return true
		}
		// Check for inline comments (# after code)
		// Be careful not to flag # inside strings
		inString := false
		for i := 0; i < len(trimmed); i++ {
			if trimmed[i] == '"' {
				inString = !inString
			}
			if !inString && trimmed[i] == '#' {
				return true
			}
		}
	}
	return false
}

func formatHeader(h ast.Header) string {
	switch hdr := h.(type) {
	case *ast.CapDecl:
		return "cap " + formatRecord(hdr.Capabilities, 0)
	case *ast.BudgetDecl:
		return "budget " + formatRecord(hdr.Budget, 0)
	case *ast.ImportDecl:
		return fmt.Sprintf("import %q as %s", hdr.Path, hdr.Alias)
	}
	return ""
}

func formatStmt(s ast.Stmt, depth int) string {
	prefix := strings.Repeat(indent, depth)
	switch stmt := s.(type) {
	case *ast.LetStmt:
		return prefix + "let " + stmt.Name + " = " + formatExpr(stmt.Value, depth)
	case *ast.ExprStmt:
		out := prefix + formatExpr(stmt.Expr, depth)
		if stmt.Target != nil {
			out += " -> " + formatIdentPath(stmt.Target)
		}
		return out
	case *ast.ReturnStmt:
		return prefix + "return " + formatExpr(stmt.Value, depth)
	case *ast.FnDecl:
		params := strings.Join(stmt.Params, ", ")
		bodyLines := formatBlock(stmt.Body, depth)
		return prefix + "fn " + stmt.Name + " { " + params + " } {\n" + bodyLines + "\n" + prefix + "}"
	}
	return ""
}

func formatBlock(stmts []ast.Stmt, depth int) string {
	lines := make([]string, len(stmts))
	for i, s := range stmts {
		lines[i] = formatStmt(s, depth+1)
	}
	return strings.Join(lines, "\n")
}

func formatExpr(e ast.Expr, depth int) string {
	switch expr := e.(type) {
	case *ast.IntLiteral:
		return strconv.FormatInt(expr.Value, 10)
	case *ast.FloatLiteral:
		return formatFloatLiteral(expr.Value)
	case *ast.BoolLiteral:
		if expr.Value {
			return "true"
		}
		return "false"
	case *ast.StrLiteral:
		return strconv.Quote(expr.Value)
	case *ast.NullLiteral:
		return "null"
	case *ast.IdentPath:
		return formatIdentPath(expr)
	case *ast.RecordExpr:
		return formatRecord(expr, depth)
	case *ast.ListExpr:
		return formatList(expr, depth)
	case *ast.CallExpr:
		return "call? " + formatIdentPath(expr.Tool) + " " + formatRecord(expr.Args, depth)
	case *ast.DoExpr:
		return "do " + formatIdentPath(expr.Tool) + " " + formatRecord(expr.Args, depth)
	case *ast.AssertExpr:
		return "assert " + formatRecord(expr.Args, depth)
	case *ast.CheckExpr:
		return "check " + formatRecord(expr.Args, depth)
	case *ast.FnCallExpr:
		return formatIdentPath(expr.Name) + " " + formatRecord(expr.Args, depth)
	case *ast.IfExpr:
		return fmt.Sprintf("if { cond: %s, then: %s, else: %s }",
			formatExpr(expr.Cond, depth+1),
			formatExpr(expr.Then, depth+1),
			formatExpr(expr.Else, depth+1))
	case *ast.IfBlockExpr:
		prefix := strings.Repeat(indent, depth)
		thenLines := formatBlock(expr.ThenBody, depth)
		if expr.ElseBody != nil && len(expr.ElseBody) > 0 {
			elseLines := formatBlock(expr.ElseBody, depth)
			return fmt.Sprintf("if (%s) {\n%s\n%s} else {\n%s\n%s}",
				formatExpr(expr.Cond, depth), thenLines, prefix, elseLines, prefix)
		}
		return fmt.Sprintf("if (%s) {\n%s\n%s}",
			formatExpr(expr.Cond, depth), thenLines, prefix)
	case *ast.TryExpr:
		prefix := strings.Repeat(indent, depth)
		tryLines := formatBlock(expr.TryBody, depth)
		catchLines := formatBlock(expr.CatchBody, depth)
		return fmt.Sprintf("try {\n%s\n%s} catch { %s } {\n%s\n%s}",
			tryLines, prefix, expr.CatchBinding, catchLines, prefix)
	case *ast.ForExpr:
		prefix := strings.Repeat(indent, depth)
		bodyLines := formatBlock(expr.Body, depth)
		return fmt.Sprintf("for { in: %s, as: %q } {\n%s\n%s}",
			formatExpr(expr.List, depth+1), expr.Binding, bodyLines, prefix)
	case *ast.MatchExpr:
		prefix := strings.Repeat(indent, depth)
		inner := strings.Repeat(indent, depth+1)

		subjectStr := formatExpr(expr.Subject, depth)
		if _, ok := expr.Subject.(*ast.IdentPath); !ok {
			subjectStr = "(" + subjectStr + ")"
		}

		var parts []string
		parts = append(parts, fmt.Sprintf("match %s {", subjectStr))
		if expr.OkArm != nil {
			okBody := formatBlock(expr.OkArm.Body, depth+1)
			parts = append(parts, fmt.Sprintf("%sok { %s } {\n%s\n%s}", inner, expr.OkArm.Binding, okBody, inner))
		}
		if expr.ErrArm != nil {
			errBody := formatBlock(expr.ErrArm.Body, depth+1)
			parts = append(parts, fmt.Sprintf("%serr { %s } {\n%s\n%s}", inner, expr.ErrArm.Binding, errBody, inner))
		}
		parts = append(parts, prefix+"}")
		return strings.Join(parts, "\n")
	case *ast.FilterBlockExpr:
		prefix := strings.Repeat(indent, depth)
		bodyLines := formatBlock(expr.Body, depth)
		return fmt.Sprintf("filter { in: %s, as: %q } {\n%s\n%s}",
			formatExpr(expr.List, depth+1), expr.Binding, bodyLines, prefix)
	case *ast.LoopExpr:
		prefix := strings.Repeat(indent, depth)
		bodyLines := formatBlock(expr.Body, depth)
		return fmt.Sprintf("loop { in: %s, times: %s, as: %q } {\n%s\n%s}",
			formatExpr(expr.Init, depth+1), formatExpr(expr.Times, depth+1), expr.Binding, bodyLines, prefix)
	case *ast.BinaryExpr:
		leftStr := formatExpr(expr.Left, depth)
		rightStr := formatExpr(expr.Right, depth)
		if needsParens(expr.Left, expr.Op, false) {
			leftStr = "(" + leftStr + ")"
		}
		if needsParens(expr.Right, expr.Op, true) {
			rightStr = "(" + rightStr + ")"
		}
		return leftStr + " " + string(expr.Op) + " " + rightStr
	case *ast.UnaryExpr:
		operandStr := formatExpr(expr.Operand, depth)
		if _, isBin := expr.Operand.(*ast.BinaryExpr); isBin {
			return "-(" + operandStr + ")"
		}
		if _, isUn := expr.Operand.(*ast.UnaryExpr); isUn {
			return "-(" + operandStr + ")"
		}
		return "-" + operandStr
	}
	return ""
}

func formatFloatLiteral(value float64) string {
	if math.IsInf(value, 0) || math.IsNaN(value) {
		return strconv.FormatFloat(value, 'f', -1, 64)
	}

	raw := strconv.FormatFloat(value, 'g', -1, 64)
	// Check if it's in scientific notation
	if strings.ContainsAny(raw, "eE") {
		expanded := expandScientificNotation(raw)
		if !strings.Contains(expanded, ".") {
			expanded += ".0"
		}
		return expanded
	}
	if !strings.Contains(raw, ".") {
		raw += ".0"
	}
	return raw
}

func expandScientificNotation(value string) string {
	lower := strings.ToLower(value)
	parts := strings.SplitN(lower, "e", 2)
	if len(parts) != 2 {
		return value
	}

	mantissa := parts[0]
	exponent, err := strconv.Atoi(parts[1])
	if err != nil {
		return value
	}

	sign := ""
	digits := mantissa
	if strings.HasPrefix(digits, "-") {
		sign = "-"
		digits = digits[1:]
	} else if strings.HasPrefix(digits, "+") {
		digits = digits[1:]
	}

	dotIdx := strings.Index(digits, ".")
	intPart := digits
	fracPart := ""
	if dotIdx >= 0 {
		intPart = digits[:dotIdx]
		fracPart = digits[dotIdx+1:]
	}

	compact := intPart + fracPart
	decimalIndex := len(intPart) + exponent

	if decimalIndex <= 0 {
		return sign + "0." + strings.Repeat("0", -decimalIndex) + compact
	}
	if decimalIndex >= len(compact) {
		return sign + compact + strings.Repeat("0", decimalIndex-len(compact)) + ".0"
	}
	return sign + compact[:decimalIndex] + "." + compact[decimalIndex:]
}

func formatIdentPath(ip *ast.IdentPath) string {
	return strings.Join(ip.Parts, ".")
}

func formatPairOrSpread(entry ast.RecordEntry, depth int) string {
	switch p := entry.(type) {
	case *ast.SpreadPair:
		return "..." + formatExpr(p.Expr, depth)
	case *ast.RecordPair:
		return p.Key + ": " + formatExpr(p.Value, depth)
	}
	return ""
}

func formatRecord(rec *ast.RecordExpr, depth int) string {
	if len(rec.Pairs) == 0 {
		return "{}"
	}

	// Try inline first
	inlineParts := make([]string, len(rec.Pairs))
	for i, p := range rec.Pairs {
		inlineParts[i] = formatPairOrSpread(p, depth+1)
	}
	inline := "{ " + strings.Join(inlineParts, ", ") + " }"
	if len(inline) <= 72 {
		return inline
	}

	// Multi-line
	inner := strings.Repeat(indent, depth+1)
	outer := strings.Repeat(indent, depth)
	parts := make([]string, len(rec.Pairs))
	for i, p := range rec.Pairs {
		parts[i] = inner + formatPairOrSpread(p, depth+1)
	}
	return "{\n" + strings.Join(parts, ",\n") + "\n" + outer + "}"
}

func formatList(list *ast.ListExpr, depth int) string {
	if len(list.Elements) == 0 {
		return "[]"
	}

	// Try inline first
	inlineParts := make([]string, len(list.Elements))
	for i, e := range list.Elements {
		inlineParts[i] = formatExpr(e, depth+1)
	}
	inline := "[" + strings.Join(inlineParts, ", ") + "]"
	if len(inline) <= 72 {
		return inline
	}

	// Multi-line
	inner := strings.Repeat(indent, depth+1)
	outer := strings.Repeat(indent, depth)
	parts := make([]string, len(list.Elements))
	for i, e := range list.Elements {
		parts[i] = inner + formatExpr(e, depth+1)
	}
	return "[\n" + strings.Join(parts, ",\n") + "\n" + outer + "]"
}
