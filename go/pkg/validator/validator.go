// Package validator implements semantic validation of A0 AST programs.
package validator

import (
	"fmt"
	"strings"

	"github.com/thomasrohde/agent0/go/pkg/ast"
	"github.com/thomasrohde/agent0/go/pkg/diagnostics"
)

var knownCapabilities = map[string]bool{
	"fs.read":  true,
	"fs.write": true,
	"http.get": true,
	"sh.exec":  true,
}

type toolInfo struct {
	mode         string // "read" or "effect"
	capabilityID string
}

var knownTools = map[string]toolInfo{
	"fs.read":   {mode: "read", capabilityID: "fs.read"},
	"fs.write":  {mode: "effect", capabilityID: "fs.write"},
	"fs.list":   {mode: "read", capabilityID: "fs.read"},
	"fs.exists": {mode: "read", capabilityID: "fs.read"},
	"http.get":  {mode: "read", capabilityID: "http.get"},
	"sh.exec":   {mode: "effect", capabilityID: "sh.exec"},
}

var knownStdlib = map[string]bool{
	"eq": true, "not": true, "and": true, "or": true, "coalesce": true, "typeof": true,
	"len": true, "append": true, "concat": true, "sort": true, "filter": true, "find": true,
	"range": true, "join": true, "unique": true, "pluck": true, "flat": true,
	"get": true, "put": true, "patch": true,
	"parse.json": true, "keys": true, "values": true, "merge": true, "entries": true,
	"math.max": true, "math.min": true,
	"str.concat": true, "str.split": true, "str.starts": true, "str.ends": true,
	"str.replace": true, "str.template": true,
	"map": true, "reduce": true,
	"contains": true,
}

var knownBudgetFields = map[string]bool{
	"timeMs":          true,
	"maxToolCalls":    true,
	"maxBytesWritten": true,
	"maxIterations":   true,
}

type scope struct {
	bindings map[string]bool
	parent   *scope
}

func newScope(parent *scope) *scope {
	return &scope{bindings: make(map[string]bool), parent: parent}
}

func (s *scope) has(name string) bool {
	if s.bindings[name] {
		return true
	}
	if s.parent != nil {
		return s.parent.has(name)
	}
	return false
}

func (s *scope) add(name string) {
	s.bindings[name] = true
}

func (s *scope) hasLocal(name string) bool {
	return s.bindings[name]
}

type validator struct {
	diags        []diagnostics.Diagnostic
	declaredCaps map[string]bool
	fnNames      map[string]bool
	scope        *scope
}

// Validate performs semantic analysis on an A0 program and returns diagnostics.
func Validate(program *ast.Program) []diagnostics.Diagnostic {
	v := &validator{
		declaredCaps: make(map[string]bool),
		fnNames:      make(map[string]bool),
		scope:        newScope(nil),
	}

	v.validateHeaders(program)
	v.validateStatements(program.Statements, v.scope, true)

	return v.diags
}

func (v *validator) addDiag(code, msg string, span *ast.Span) {
	v.diags = append(v.diags, diagnostics.MakeDiag(code, msg, span, ""))
}

func (v *validator) validateHeaders(program *ast.Program) {
	budgetCount := 0

	for _, h := range program.Headers {
		switch hdr := h.(type) {
		case *ast.CapDecl:
			v.validateCapDecl(hdr)
		case *ast.BudgetDecl:
			budgetCount++
			if budgetCount > 1 {
				span := hdr.Span
				v.addDiag(diagnostics.EAst, "duplicate budget declaration", &span)
			}
			v.validateBudgetDecl(hdr)
		case *ast.ImportDecl:
			span := hdr.Span
			v.addDiag(diagnostics.EAst, "import is not supported", &span)
		}
	}
}

func (v *validator) validateCapDecl(decl *ast.CapDecl) {
	for _, entry := range decl.Capabilities.Pairs {
		pair, ok := entry.(*ast.RecordPair)
		if !ok {
			continue
		}
		if !knownCapabilities[pair.Key] {
			span := pair.Span
			v.addDiag(diagnostics.EUnknownCap, fmt.Sprintf("unknown capability '%s'", pair.Key), &span)
		}
		// Check value is boolean literal
		if _, ok := pair.Value.(*ast.BoolLiteral); !ok {
			span := pair.Span
			v.addDiag(diagnostics.EAst, fmt.Sprintf("capability '%s' value must be a boolean", pair.Key), &span)
		}
		v.declaredCaps[pair.Key] = true
	}
}

func (v *validator) validateBudgetDecl(decl *ast.BudgetDecl) {
	for _, entry := range decl.Budget.Pairs {
		pair, ok := entry.(*ast.RecordPair)
		if !ok {
			continue
		}
		if !knownBudgetFields[pair.Key] {
			span := pair.Span
			v.addDiag(diagnostics.EUnknownBudget, fmt.Sprintf("unknown budget field '%s'", pair.Key), &span)
		}
		// Check value is numeric
		switch pair.Value.(type) {
		case *ast.IntLiteral, *ast.FloatLiteral:
			// ok
		default:
			span := pair.Span
			v.addDiag(diagnostics.EAst, fmt.Sprintf("budget field '%s' must be a number", pair.Key), &span)
		}
	}
}

func (v *validator) validateStatements(stmts []ast.Stmt, sc *scope, isTopLevel bool) {
	if len(stmts) == 0 {
		if isTopLevel {
			v.addDiag(diagnostics.ENoReturn, "program must end with a return statement", nil)
		}
		return
	}

	// Check return positioning
	hasReturn := false
	for i, stmt := range stmts {
		if _, ok := stmt.(*ast.ReturnStmt); ok {
			if i != len(stmts)-1 {
				span := stmt.NodeSpan()
				v.addDiag(diagnostics.EReturnNotLast, "return must be the last statement", &span)
			}
			hasReturn = true
		}
	}

	if !hasReturn && isTopLevel {
		v.addDiag(diagnostics.ENoReturn, "program must end with a return statement", nil)
	}

	// First pass: collect fn declarations
	for _, stmt := range stmts {
		if fn, ok := stmt.(*ast.FnDecl); ok {
			if v.fnNames[fn.Name] {
				span := fn.Span
				v.addDiag(diagnostics.EFnDup, fmt.Sprintf("duplicate function '%s'", fn.Name), &span)
			} else if knownStdlib[fn.Name] {
				span := fn.Span
				v.addDiag(diagnostics.EFnDup, fmt.Sprintf("function '%s' conflicts with stdlib", fn.Name), &span)
			} else {
				v.fnNames[fn.Name] = true
			}
			// fn name is available as a binding in scope
			sc.add(fn.Name)
		}
	}

	// Second pass: validate each statement
	for _, stmt := range stmts {
		v.validateStmt(stmt, sc)
	}
}

func (v *validator) validateStmt(stmt ast.Stmt, sc *scope) {
	switch s := stmt.(type) {
	case *ast.LetStmt:
		if sc.hasLocal(s.Name) {
			span := s.Span
			v.addDiag(diagnostics.EDupBinding, fmt.Sprintf("duplicate binding '%s'", s.Name), &span)
		}
		v.validateExpr(s.Value, sc)
		sc.add(s.Name)

	case *ast.ExprStmt:
		v.validateExpr(s.Expr, sc)
		if s.Target != nil {
			name := s.Target.Parts[0]
			if sc.hasLocal(name) {
				span := s.Target.Span
				v.addDiag(diagnostics.EDupBinding, fmt.Sprintf("duplicate binding '%s'", name), &span)
			}
			sc.add(name)
		}

	case *ast.ReturnStmt:
		v.validateExpr(s.Value, sc)

	case *ast.FnDecl:
		childScope := newScope(sc)
		for _, param := range s.Params {
			childScope.add(param)
		}
		v.validateBlockStatements(s.Body, childScope)
	}
}

func (v *validator) validateBlockStatements(stmts []ast.Stmt, sc *scope) {
	// Sub-blocks also require return as last
	if len(stmts) == 0 {
		return
	}

	hasReturn := false
	for i, stmt := range stmts {
		if _, ok := stmt.(*ast.ReturnStmt); ok {
			if i != len(stmts)-1 {
				span := stmt.NodeSpan()
				v.addDiag(diagnostics.EReturnNotLast, "return must be the last statement in block", &span)
			}
			hasReturn = true
		}
	}

	_ = hasReturn // sub-blocks may or may not have return

	for _, stmt := range stmts {
		v.validateStmt(stmt, sc)
	}
}

func (v *validator) validateExpr(expr ast.Expr, sc *scope) {
	if expr == nil {
		return
	}

	switch e := expr.(type) {
	case *ast.IntLiteral, *ast.FloatLiteral, *ast.BoolLiteral, *ast.StrLiteral, *ast.NullLiteral:
		// literals are always valid

	case *ast.IdentPath:
		name := e.Parts[0]
		if !sc.has(name) {
			span := e.Span
			v.addDiag(diagnostics.EUnbound, fmt.Sprintf("unbound variable '%s'", name), &span)
		}

	case *ast.RecordExpr:
		for _, entry := range e.Pairs {
			switch p := entry.(type) {
			case *ast.RecordPair:
				v.validateExpr(p.Value, sc)
			case *ast.SpreadPair:
				v.validateExpr(p.Expr, sc)
			}
		}

	case *ast.ListExpr:
		for _, elem := range e.Elements {
			v.validateExpr(elem, sc)
		}

	case *ast.BinaryExpr:
		v.validateExpr(e.Left, sc)
		v.validateExpr(e.Right, sc)

	case *ast.UnaryExpr:
		v.validateExpr(e.Operand, sc)

	case *ast.IfExpr:
		v.validateExpr(e.Cond, sc)
		v.validateExpr(e.Then, sc)
		v.validateExpr(e.Else, sc)

	case *ast.IfBlockExpr:
		v.validateExpr(e.Cond, sc)
		childThen := newScope(sc)
		v.validateBlockStatements(e.ThenBody, childThen)
		if e.ElseBody != nil {
			childElse := newScope(sc)
			v.validateBlockStatements(e.ElseBody, childElse)
		}

	case *ast.ForExpr:
		v.validateExpr(e.List, sc)
		childScope := newScope(sc)
		childScope.add(e.Binding)
		v.validateBlockStatements(e.Body, childScope)

	case *ast.MatchExpr:
		v.validateExpr(e.Subject, sc)
		if e.OkArm != nil {
			childScope := newScope(sc)
			childScope.add(e.OkArm.Binding)
			v.validateBlockStatements(e.OkArm.Body, childScope)
		}
		if e.ErrArm != nil {
			childScope := newScope(sc)
			childScope.add(e.ErrArm.Binding)
			v.validateBlockStatements(e.ErrArm.Body, childScope)
		}

	case *ast.TryExpr:
		childTry := newScope(sc)
		v.validateBlockStatements(e.TryBody, childTry)
		childCatch := newScope(sc)
		childCatch.add(e.CatchBinding)
		v.validateBlockStatements(e.CatchBody, childCatch)

	case *ast.FilterBlockExpr:
		v.validateExpr(e.List, sc)
		childScope := newScope(sc)
		if e.Binding != "" {
			childScope.add(e.Binding)
		}
		v.validateBlockStatements(e.Body, childScope)

	case *ast.LoopExpr:
		if e.Init != nil {
			v.validateExpr(e.Init, sc)
		}
		if e.Times != nil {
			v.validateExpr(e.Times, sc)
		}
		childScope := newScope(sc)
		if e.Binding != "" {
			childScope.add(e.Binding)
		}
		v.validateBlockStatements(e.Body, childScope)

	case *ast.CallExpr:
		toolName := strings.Join(e.Tool.Parts, ".")
		v.validateToolUsage(toolName, "call?", &e.Span)
		v.validateExpr(e.Args, sc)

	case *ast.DoExpr:
		toolName := strings.Join(e.Tool.Parts, ".")
		v.validateToolUsage(toolName, "do", &e.Span)
		v.validateExpr(e.Args, sc)

	case *ast.AssertExpr:
		v.validateExpr(e.Args, sc)

	case *ast.CheckExpr:
		v.validateExpr(e.Args, sc)

	case *ast.FnCallExpr:
		fnName := strings.Join(e.Name.Parts, ".")
		if !knownStdlib[fnName] && !v.fnNames[fnName] {
			// Check if it's a known tool (error: use call?/do)
			if _, ok := knownTools[fnName]; ok {
				span := e.Span
				v.addDiag(diagnostics.EUnknownFn, fmt.Sprintf("unknown function '%s' (did you mean call? or do?)", fnName), &span)
			} else {
				span := e.Span
				v.addDiag(diagnostics.EUnknownFn, fmt.Sprintf("unknown function '%s'", fnName), &span)
			}
		}
		v.validateExpr(e.Args, sc)
	}
}

func (v *validator) validateToolUsage(toolName, mode string, span *ast.Span) {
	info, known := knownTools[toolName]
	if !known {
		v.addDiag(diagnostics.EUnknownTool, fmt.Sprintf("unknown tool '%s'", toolName), span)
		return
	}

	// Check call? on effect tool → E_CALL_EFFECT
	if mode == "call?" && info.mode == "effect" {
		v.addDiag(diagnostics.ECallEffect, fmt.Sprintf("cannot use call? on effect tool '%s'; use do instead", toolName), span)
		return
	}

	// Check capability is declared
	capID := info.capabilityID
	if !v.declaredCaps[capID] {
		v.addDiag(diagnostics.EUndeclaredCap, fmt.Sprintf("capability '%s' not declared (required by tool '%s')", capID, toolName), span)
	}
}
