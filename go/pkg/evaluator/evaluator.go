package evaluator

import (
	"context"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/thomasrohde/agent0/go/pkg/ast"
	"github.com/thomasrohde/agent0/go/pkg/diagnostics"
)

// Evidence represents an assert or check result.
type Evidence struct {
	Kind    string    `json:"kind"` // "assert" or "check"
	OK      bool      `json:"ok"`
	Msg     string    `json:"msg"`
	Details *A0Record `json:"details,omitempty"`
	Span    *ast.Span `json:"span,omitempty"`
}

// TraceEventType identifies the type of a trace event.
type TraceEventType string

const (
	TraceRunStart       TraceEventType = "run_start"
	TraceRunEnd         TraceEventType = "run_end"
	TraceStmtStart      TraceEventType = "stmt_start"
	TraceStmtEnd        TraceEventType = "stmt_end"
	TraceToolStart      TraceEventType = "tool_start"
	TraceToolEnd        TraceEventType = "tool_end"
	TraceEvidence       TraceEventType = "evidence"
	TraceBudgetExceeded TraceEventType = "budget_exceeded"
	TraceForStart       TraceEventType = "for_start"
	TraceForEnd         TraceEventType = "for_end"
	TraceFnCallStart    TraceEventType = "fn_call_start"
	TraceFnCallEnd      TraceEventType = "fn_call_end"
	TraceMatchStart     TraceEventType = "match_start"
	TraceMatchEnd       TraceEventType = "match_end"
	TraceMapStart       TraceEventType = "map_start"
	TraceMapEnd         TraceEventType = "map_end"
	TraceReduceStart    TraceEventType = "reduce_start"
	TraceReduceEnd      TraceEventType = "reduce_end"
	TraceTryStart       TraceEventType = "try_start"
	TraceTryEnd         TraceEventType = "try_end"
	TraceFilterStart    TraceEventType = "filter_start"
	TraceFilterEnd      TraceEventType = "filter_end"
	TraceLoopStart      TraceEventType = "loop_start"
	TraceLoopEnd        TraceEventType = "loop_end"
)

// TraceEvent represents a single trace event emitted during execution.
type TraceEvent struct {
	Timestamp string         `json:"ts"`
	RunID     string         `json:"runId"`
	Event     TraceEventType `json:"event"`
	Span      *ast.Span      `json:"span,omitempty"`
	Data      *A0Record      `json:"data,omitempty"`
}

// ToolDef defines a tool available to A0 programs.
type ToolDef struct {
	Name         string
	Mode         string // "read" or "effect"
	CapabilityID string
	Execute      func(ctx context.Context, args *A0Record) (A0Value, error)
}

// StdlibFn defines a standard library function.
type StdlibFn struct {
	Name    string
	Execute func(args *A0Record) (A0Value, error)
}

// ExecOptions configures program execution.
type ExecOptions struct {
	AllowedCapabilities map[string]bool
	Tools               map[string]*ToolDef
	Stdlib              map[string]*StdlibFn
	Trace               func(event TraceEvent)
	RunID               string
}

// ExecResult holds the result of a program execution.
type ExecResult struct {
	Value       A0Value
	Evidence    []Evidence
	Diagnostics []diagnostics.Diagnostic
}

// A0RuntimeError represents a runtime error during A0 execution.
type A0RuntimeError struct {
	Code    string
	Message string
	Span    *ast.Span
	Details *A0Record
}

func (e *A0RuntimeError) Error() string {
	return e.Message
}

type userFn struct {
	decl    *ast.FnDecl
	closure *Env
}

type evaluator struct {
	ctx        context.Context
	opts       ExecOptions
	env        *Env
	evidence   []Evidence
	budget     Budget
	tracker    BudgetTracker
	startTime  time.Time
	startHires int64 // high-resolution monotonic start time
	userFns    map[string]*userFn
}

func (ev *evaluator) emit(event TraceEventType, span *ast.Span) {
	if ev.opts.Trace != nil {
		ev.opts.Trace(TraceEvent{
			Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
			RunID:     ev.opts.RunID,
			Event:     event,
			Span:      span,
		})
	}
}

func (ev *evaluator) emitWithData(event TraceEventType, span *ast.Span, data map[string]string) {
	if ev.opts.Trace != nil {
		var dataRec *A0Record
		if data != nil {
			pairs := make([]KeyValue, 0, len(data))
			for k, v := range data {
				pairs = append(pairs, KeyValue{Key: k, Value: NewString(v)})
			}
			r := NewRecord(pairs).(A0Record)
			dataRec = &r
		}
		ev.opts.Trace(TraceEvent{
			Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
			RunID:     ev.opts.RunID,
			Event:     event,
			Span:      span,
			Data:      dataRec,
		})
	}
}

func (ev *evaluator) checkTimeBudget() error {
	if ev.budget.TimeMs != nil {
		// Use high-resolution timer for accurate sub-millisecond budget enforcement
		elapsedMs := hiresSinceMs(ev.startHires)
		if elapsedMs >= *ev.budget.TimeMs {
			return &A0RuntimeError{
				Code:    diagnostics.EBudget,
				Message: fmt.Sprintf("time budget exceeded (%dms)", *ev.budget.TimeMs),
			}
		}
	}
	return nil
}

func (ev *evaluator) checkIterationBudget() error {
	if ev.budget.MaxIterations != nil {
		if ev.tracker.Iterations >= *ev.budget.MaxIterations {
			return &A0RuntimeError{
				Code:    diagnostics.EBudget,
				Message: fmt.Sprintf("iteration budget exceeded (max %d)", *ev.budget.MaxIterations),
			}
		}
	}
	return nil
}

// Execute runs an A0 program and returns the result.
func Execute(ctx context.Context, program *ast.Program, opts ExecOptions) (*ExecResult, error) {
	now := time.Now()
	ev := &evaluator{
		ctx:       ctx,
		opts:       opts,
		env:        NewEnv(nil),
		userFns:    make(map[string]*userFn),
		startTime:  now,
		startHires: hiresNow(),
		tracker:    BudgetTracker{StartMs: now.UnixMilli()},
	}

	// Extract capabilities from CapDecl headers
	for _, h := range program.Headers {
		if capDecl, ok := h.(*ast.CapDecl); ok {
			for _, entry := range capDecl.Capabilities.Pairs {
				pair, ok := entry.(*ast.RecordPair)
				if !ok {
					continue
				}
				boolVal, ok := pair.Value.(*ast.BoolLiteral)
				if !ok {
					continue
				}
				if boolVal.Value {
					capID := pair.Key
					// Check against allowed capabilities
					if opts.AllowedCapabilities != nil && !opts.AllowedCapabilities[capID] {
						span := pair.Span
						return nil, &A0RuntimeError{
							Code:    diagnostics.ECapDenied,
							Message: fmt.Sprintf("capability '%s' denied by policy", capID),
							Span:    &span,
						}
					}
				}
			}
		}
	}

	// Extract budget from BudgetDecl headers
	for _, h := range program.Headers {
		if budgetDecl, ok := h.(*ast.BudgetDecl); ok {
			for _, entry := range budgetDecl.Budget.Pairs {
				pair, ok := entry.(*ast.RecordPair)
				if !ok {
					continue
				}
				val := extractNumber(pair.Value)
				intVal := int64(val)
				switch pair.Key {
				case "timeMs":
					ev.budget.TimeMs = &intVal
				case "maxToolCalls":
					ev.budget.MaxToolCalls = &intVal
				case "maxIterations":
					ev.budget.MaxIterations = &intVal
				case "maxBytesWritten":
					ev.budget.MaxBytesWritten = &intVal
				}
			}
		}
	}

	// Set up context timeout for time budget
	if ev.budget.TimeMs != nil {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, time.Duration(*ev.budget.TimeMs)*time.Millisecond)
		defer cancel()
		ev.ctx = ctx
	}

	span := program.Span
	ev.emit(TraceRunStart, &span)

	val, err := ev.executeBlock(program.Statements, ev.env)

	ev.emit(TraceRunEnd, &span)

	if err != nil {
		return &ExecResult{Evidence: ev.evidence}, err
	}

	return &ExecResult{
		Value:    val,
		Evidence: ev.evidence,
	}, nil
}

func extractNumber(expr ast.Expr) float64 {
	switch e := expr.(type) {
	case *ast.IntLiteral:
		return float64(e.Value)
	case *ast.FloatLiteral:
		return e.Value
	}
	return 0
}

func (ev *evaluator) executeBlock(stmts []ast.Stmt, env *Env) (A0Value, error) {
	var lastVal A0Value = NewNull()

	for _, stmt := range stmts {
		if err := ev.checkTimeBudget(); err != nil {
			return nil, err
		}

		span := stmt.NodeSpan()
		ev.emit(TraceStmtStart, &span)

		switch s := stmt.(type) {
		case *ast.LetStmt:
			val, err := ev.evalExpr(s.Value, env)
			if err != nil {
				return nil, err
			}
			env.Set(s.Name, val)
			lastVal = val

		case *ast.ExprStmt:
			val, err := ev.evalExpr(s.Expr, env)
			if err != nil {
				return nil, err
			}
			if s.Target != nil {
				name := s.Target.Parts[0]
				if len(s.Target.Parts) == 1 {
					env.Set(name, val)
				} else {
					// Nested path: create nested record
					current := val
					for i := len(s.Target.Parts) - 1; i >= 1; i-- {
						current = NewRecord([]KeyValue{{Key: s.Target.Parts[i], Value: current}})
					}
					env.Set(name, current)
				}
			}
			lastVal = val

		case *ast.FnDecl:
			ev.userFns[s.Name] = &userFn{decl: s, closure: env}
			lastVal = NewNull()

		case *ast.ReturnStmt:
			val, err := ev.evalExpr(s.Value, env)
			if err != nil {
				return nil, err
			}
			ev.emit(TraceStmtEnd, &span)
			return val, nil
		}

		ev.emit(TraceStmtEnd, &span)
	}

	return lastVal, nil
}

func (ev *evaluator) evalExpr(expr ast.Expr, env *Env) (A0Value, error) {
	if expr == nil {
		return NewNull(), nil
	}

	// Check time budget during expression evaluation for tight loops
	if ev.budget.TimeMs != nil {
		if err := ev.checkTimeBudget(); err != nil {
			return nil, err
		}
	}

	switch e := expr.(type) {
	case *ast.IntLiteral:
		return NewNumber(float64(e.Value)), nil

	case *ast.FloatLiteral:
		return NewNumber(e.Value), nil

	case *ast.BoolLiteral:
		return NewBool(e.Value), nil

	case *ast.StrLiteral:
		return NewString(e.Value), nil

	case *ast.NullLiteral:
		return NewNull(), nil

	case *ast.IdentPath:
		return ev.evalIdentPath(e, env)

	case *ast.RecordExpr:
		return ev.evalRecord(e, env)

	case *ast.ListExpr:
		return ev.evalList(e, env)

	case *ast.BinaryExpr:
		return ev.evalBinaryOp(e, env)

	case *ast.UnaryExpr:
		return ev.evalUnary(e, env)

	case *ast.IfExpr:
		return ev.evalIfExpr(e, env)

	case *ast.IfBlockExpr:
		return ev.evalIfBlockExpr(e, env)

	case *ast.ForExpr:
		return ev.evalForExpr(e, env)

	case *ast.MatchExpr:
		return ev.evalMatchExpr(e, env)

	case *ast.TryExpr:
		return ev.evalTryExpr(e, env)

	case *ast.FilterBlockExpr:
		return ev.evalFilterBlockExpr(e, env)

	case *ast.LoopExpr:
		return ev.evalLoopExpr(e, env)

	case *ast.AssertExpr:
		return ev.evalAssertExpr(e, env)

	case *ast.CheckExpr:
		return ev.evalCheckExpr(e, env)

	case *ast.CallExpr:
		return ev.evalCallExpr(e, env)

	case *ast.DoExpr:
		return ev.evalDoExpr(e, env)

	case *ast.FnCallExpr:
		return ev.evalFnCallExpr(e, env)

	default:
		return nil, &A0RuntimeError{
			Code:    diagnostics.EType,
			Message: fmt.Sprintf("unsupported expression type: %T", expr),
		}
	}
}

func (ev *evaluator) evalIdentPath(e *ast.IdentPath, env *Env) (A0Value, error) {
	val, ok := env.Get(e.Parts[0])
	if !ok {
		span := e.Span
		return nil, &A0RuntimeError{
			Code:    diagnostics.EUnbound,
			Message: fmt.Sprintf("unbound variable '%s'", e.Parts[0]),
			Span:    &span,
		}
	}

	// Traverse dotted path
	for i := 1; i < len(e.Parts); i++ {
		rec, ok := val.(A0Record)
		if !ok {
			span := e.Span
			return nil, &A0RuntimeError{
				Code:    diagnostics.EPath,
				Message: fmt.Sprintf("cannot access '%s' on non-record value", e.Parts[i]),
				Span:    &span,
			}
		}
		fieldVal, found := rec.Get(e.Parts[i])
		if !found {
			span := e.Span
			return nil, &A0RuntimeError{
				Code:    diagnostics.EPath,
				Message: fmt.Sprintf("record has no field '%s'", e.Parts[i]),
				Span:    &span,
			}
		}
		val = fieldVal
	}

	return val, nil
}

func (ev *evaluator) evalRecord(e *ast.RecordExpr, env *Env) (A0Value, error) {
	rec := &A0Record{Pairs: make([]KeyValue, 0, len(e.Pairs))}

	for _, entry := range e.Pairs {
		switch p := entry.(type) {
		case *ast.RecordPair:
			val, err := ev.evalExpr(p.Value, env)
			if err != nil {
				return nil, err
			}
			rec.Set(p.Key, val)

		case *ast.SpreadPair:
			val, err := ev.evalExpr(p.Expr, env)
			if err != nil {
				return nil, err
			}
			spreadRec, ok := val.(A0Record)
			if !ok {
				span := p.Span
				return nil, &A0RuntimeError{
					Code:    diagnostics.EType,
					Message: "spread operand must be a record",
					Span:    &span,
				}
			}
			for _, kv := range spreadRec.Pairs {
				rec.Set(kv.Key, kv.Value)
			}
		}
	}

	return *rec, nil
}

func (ev *evaluator) evalList(e *ast.ListExpr, env *Env) (A0Value, error) {
	items := make([]A0Value, 0, len(e.Elements))
	for _, elem := range e.Elements {
		val, err := ev.evalExpr(elem, env)
		if err != nil {
			return nil, err
		}
		items = append(items, val)
	}
	return NewList(items), nil
}

func (ev *evaluator) evalBinaryOp(e *ast.BinaryExpr, env *Env) (A0Value, error) {
	left, err := ev.evalExpr(e.Left, env)
	if err != nil {
		return nil, err
	}
	right, err := ev.evalExpr(e.Right, env)
	if err != nil {
		return nil, err
	}

	span := e.Span

	switch e.Op {
	case ast.OpAdd:
		// Number + Number or String + String
		if lNum, ok := left.(A0Number); ok {
			if rNum, ok := right.(A0Number); ok {
				return NewNumber(lNum.Value + rNum.Value), nil
			}
		}
		if lStr, ok := left.(A0String); ok {
			if rStr, ok := right.(A0String); ok {
				return NewString(lStr.Value + rStr.Value), nil
			}
		}
		return nil, &A0RuntimeError{
			Code:    diagnostics.EType,
			Message: fmt.Sprintf("Operator '+' requires two numbers or two strings, got %s and %s.", typeNameOf(left), typeNameOf(right)),
			Span:    &span,
		}

	case ast.OpSub, ast.OpMul, ast.OpDiv, ast.OpMod:
		lNum, lOk := left.(A0Number)
		rNum, rOk := right.(A0Number)
		if !lOk || !rOk {
			return nil, &A0RuntimeError{
				Code:    diagnostics.EType,
				Message: fmt.Sprintf("'%s' requires two numbers", string(e.Op)),
				Span:    &span,
			}
		}
		switch e.Op {
		case ast.OpSub:
			return NewNumber(lNum.Value - rNum.Value), nil
		case ast.OpMul:
			return NewNumber(lNum.Value * rNum.Value), nil
		case ast.OpDiv:
			if rNum.Value == 0 {
				return nil, &A0RuntimeError{Code: diagnostics.EType, Message: "division by zero", Span: &span}
			}
			return NewNumber(lNum.Value / rNum.Value), nil
		case ast.OpMod:
			if rNum.Value == 0 {
				return nil, &A0RuntimeError{Code: diagnostics.EType, Message: "modulo by zero", Span: &span}
			}
			return NewNumber(math.Mod(lNum.Value, rNum.Value)), nil
		}

	case ast.OpEqEq:
		return NewBool(DeepEqual(left, right)), nil

	case ast.OpNeq:
		return NewBool(!DeepEqual(left, right)), nil

	case ast.OpGt, ast.OpLt, ast.OpGtEq, ast.OpLtEq:
		if lNum, ok := left.(A0Number); ok {
			if rNum, ok := right.(A0Number); ok {
				switch e.Op {
				case ast.OpGt:
					return NewBool(lNum.Value > rNum.Value), nil
				case ast.OpLt:
					return NewBool(lNum.Value < rNum.Value), nil
				case ast.OpGtEq:
					return NewBool(lNum.Value >= rNum.Value), nil
				case ast.OpLtEq:
					return NewBool(lNum.Value <= rNum.Value), nil
				}
			}
		}
		if lStr, ok := left.(A0String); ok {
			if rStr, ok := right.(A0String); ok {
				switch e.Op {
				case ast.OpGt:
					return NewBool(lStr.Value > rStr.Value), nil
				case ast.OpLt:
					return NewBool(lStr.Value < rStr.Value), nil
				case ast.OpGtEq:
					return NewBool(lStr.Value >= rStr.Value), nil
				case ast.OpLtEq:
					return NewBool(lStr.Value <= rStr.Value), nil
				}
			}
		}
		return nil, &A0RuntimeError{
			Code:    diagnostics.EType,
			Message: fmt.Sprintf("'%s' requires two numbers or two strings", string(e.Op)),
			Span:    &span,
		}
	}

	return NewNull(), nil
}

func (ev *evaluator) evalUnary(e *ast.UnaryExpr, env *Env) (A0Value, error) {
	operand, err := ev.evalExpr(e.Operand, env)
	if err != nil {
		return nil, err
	}
	if num, ok := operand.(A0Number); ok {
		return NewNumber(-num.Value), nil
	}
	span := e.Span
	return nil, &A0RuntimeError{
		Code:    diagnostics.EType,
		Message: "unary '-' requires a number",
		Span:    &span,
	}
}

func (ev *evaluator) evalIfExpr(e *ast.IfExpr, env *Env) (A0Value, error) {
	cond, err := ev.evalExpr(e.Cond, env)
	if err != nil {
		return nil, err
	}
	if Truthiness(cond) {
		return ev.evalExpr(e.Then, env)
	}
	return ev.evalExpr(e.Else, env)
}

func (ev *evaluator) evalIfBlockExpr(e *ast.IfBlockExpr, env *Env) (A0Value, error) {
	cond, err := ev.evalExpr(e.Cond, env)
	if err != nil {
		return nil, err
	}
	if Truthiness(cond) {
		childEnv := env.Child()
		return ev.executeBlock(e.ThenBody, childEnv)
	}
	if e.ElseBody != nil {
		childEnv := env.Child()
		return ev.executeBlock(e.ElseBody, childEnv)
	}
	return NewNull(), nil
}

func (ev *evaluator) evalForExpr(e *ast.ForExpr, env *Env) (A0Value, error) {
	listVal, err := ev.evalExpr(e.List, env)
	if err != nil {
		return nil, err
	}
	list, ok := listVal.(A0List)
	if !ok {
		span := e.Span
		return nil, &A0RuntimeError{
			Code:    diagnostics.EForNotList,
			Message: "for expression requires a list",
			Span:    &span,
		}
	}

	span := e.Span
	ev.emit(TraceForStart, &span)

	results := make([]A0Value, 0, len(list.Items))
	for _, item := range list.Items {
		if err := ev.checkTimeBudget(); err != nil {
			return nil, err
		}
		if err := ev.checkIterationBudget(); err != nil {
			return nil, err
		}
		ev.tracker.Iterations++

		childEnv := env.Child()
		childEnv.Set(e.Binding, item)
		val, err := ev.executeBlock(e.Body, childEnv)
		if err != nil {
			return nil, err
		}
		results = append(results, val)
	}

	ev.emit(TraceForEnd, &span)
	return NewList(results), nil
}

func (ev *evaluator) evalMatchExpr(e *ast.MatchExpr, env *Env) (A0Value, error) {
	subject, err := ev.evalExpr(e.Subject, env)
	if err != nil {
		return nil, err
	}
	rec, ok := subject.(A0Record)
	if !ok {
		span := e.Span
		return nil, &A0RuntimeError{
			Code:    diagnostics.EMatchNotRecord,
			Message: "match subject must be a record",
			Span:    &span,
		}
	}

	span := e.Span
	ev.emit(TraceMatchStart, &span)

	if okVal, found := rec.Get("ok"); found && e.OkArm != nil {
		childEnv := env.Child()
		childEnv.Set(e.OkArm.Binding, okVal)
		val, err := ev.executeBlock(e.OkArm.Body, childEnv)
		ev.emit(TraceMatchEnd, &span)
		return val, err
	}

	if errVal, found := rec.Get("err"); found && e.ErrArm != nil {
		childEnv := env.Child()
		childEnv.Set(e.ErrArm.Binding, errVal)
		val, err := ev.executeBlock(e.ErrArm.Body, childEnv)
		ev.emit(TraceMatchEnd, &span)
		return val, err
	}

	ev.emit(TraceMatchEnd, &span)
	return nil, &A0RuntimeError{
		Code:    diagnostics.EMatchNoArm,
		Message: "no matching arm in match expression",
		Span:    &span,
	}
}

func (ev *evaluator) evalTryExpr(e *ast.TryExpr, env *Env) (A0Value, error) {
	span := e.Span
	ev.emit(TraceTryStart, &span)

	tryEnv := env.Child()
	val, err := ev.executeBlock(e.TryBody, tryEnv)
	if err != nil {
		if rtErr, ok := err.(*A0RuntimeError); ok {
			// Catch the error
			catchEnv := env.Child()
			errRec := NewRecord([]KeyValue{
				{Key: "code", Value: NewString(rtErr.Code)},
				{Key: "message", Value: NewString(rtErr.Message)},
			})
			catchEnv.Set(e.CatchBinding, errRec)
			result, catchErr := ev.executeBlock(e.CatchBody, catchEnv)
			ev.emit(TraceTryEnd, &span)
			return result, catchErr
		}
		ev.emit(TraceTryEnd, &span)
		return nil, err
	}
	ev.emit(TraceTryEnd, &span)
	return val, nil
}

func (ev *evaluator) evalFilterBlockExpr(e *ast.FilterBlockExpr, env *Env) (A0Value, error) {
	listVal, err := ev.evalExpr(e.List, env)
	if err != nil {
		return nil, err
	}
	list, ok := listVal.(A0List)
	if !ok {
		span := e.Span
		return nil, &A0RuntimeError{
			Code:    diagnostics.EType,
			Message: "filter block requires a list",
			Span:    &span,
		}
	}

	span := e.Span
	ev.emit(TraceFilterStart, &span)

	var results []A0Value
	for _, item := range list.Items {
		if err := ev.checkTimeBudget(); err != nil {
			return nil, err
		}
		if err := ev.checkIterationBudget(); err != nil {
			return nil, err
		}
		ev.tracker.Iterations++

		childEnv := env.Child()
		if e.Binding != "" {
			childEnv.Set(e.Binding, item)
		}
		val, err := ev.executeBlock(e.Body, childEnv)
		if err != nil {
			return nil, err
		}
		if Truthiness(val) {
			results = append(results, item)
		}
	}

	ev.emit(TraceFilterEnd, &span)
	return NewList(results), nil
}

func (ev *evaluator) evalLoopExpr(e *ast.LoopExpr, env *Env) (A0Value, error) {
	var current A0Value = NewNull()
	if e.Init != nil {
		var err error
		current, err = ev.evalExpr(e.Init, env)
		if err != nil {
			return nil, err
		}
	}

	var times int64 = 1
	if e.Times != nil {
		timesVal, err := ev.evalExpr(e.Times, env)
		if err != nil {
			return nil, err
		}
		if num, ok := timesVal.(A0Number); ok {
			times = int64(num.Value)
		}
	}

	if times < 0 {
		span := e.Span
		return nil, &A0RuntimeError{
			Code:    diagnostics.EType,
			Message: "loop times must be non-negative",
			Span:    &span,
		}
	}

	span := e.Span
	ev.emit(TraceLoopStart, &span)

	for i := int64(0); i < times; i++ {
		if err := ev.checkTimeBudget(); err != nil {
			return nil, err
		}
		if err := ev.checkIterationBudget(); err != nil {
			return nil, err
		}
		ev.tracker.Iterations++

		childEnv := env.Child()
		if e.Binding != "" {
			childEnv.Set(e.Binding, current)
		}
		val, err := ev.executeBlock(e.Body, childEnv)
		if err != nil {
			return nil, err
		}
		current = val
	}

	ev.emit(TraceLoopEnd, &span)
	return current, nil
}

func (ev *evaluator) evalAssertExpr(e *ast.AssertExpr, env *Env) (A0Value, error) {
	argsVal, err := ev.evalExpr(e.Args, env)
	if err != nil {
		return nil, err
	}

	rec, ok := argsVal.(A0Record)
	if !ok {
		span := e.Span
		return nil, &A0RuntimeError{
			Code:    diagnostics.EType,
			Message: "assert requires a record argument",
			Span:    &span,
		}
	}

	thatVal, _ := rec.Get("that")
	msgVal, _ := rec.Get("msg")
	msg := ""
	if s, ok := msgVal.(A0String); ok {
		msg = s.Value
	}

	ok = Truthiness(thatVal)
	span := e.Span
	evidence := Evidence{
		Kind: "assert",
		OK:   ok,
		Msg:  msg,
		Span: &span,
	}
	ev.evidence = append(ev.evidence, evidence)
	ev.emit(TraceEvidence, &span)

	// Return evidence as record
	evRecord := NewRecord([]KeyValue{
		{Key: "kind", Value: NewString("assert")},
		{Key: "ok", Value: NewBool(ok)},
		{Key: "msg", Value: NewString(msg)},
	})

	if !ok {
		// Assert is fatal
		return nil, &A0RuntimeError{
			Code:    diagnostics.EAssert,
			Message: fmt.Sprintf("assertion failed: %s", msg),
			Span:    &span,
		}
	}

	return evRecord, nil
}

func (ev *evaluator) evalCheckExpr(e *ast.CheckExpr, env *Env) (A0Value, error) {
	argsVal, err := ev.evalExpr(e.Args, env)
	if err != nil {
		return nil, err
	}

	rec, ok := argsVal.(A0Record)
	if !ok {
		span := e.Span
		return nil, &A0RuntimeError{
			Code:    diagnostics.EType,
			Message: "check requires a record argument",
			Span:    &span,
		}
	}

	thatVal, _ := rec.Get("that")
	msgVal, _ := rec.Get("msg")
	msg := ""
	if s, ok := msgVal.(A0String); ok {
		msg = s.Value
	}

	ok = Truthiness(thatVal)
	span := e.Span
	evidence := Evidence{
		Kind: "check",
		OK:   ok,
		Msg:  msg,
		Span: &span,
	}
	ev.evidence = append(ev.evidence, evidence)
	ev.emit(TraceEvidence, &span)

	// Return evidence as record
	evRecord := NewRecord([]KeyValue{
		{Key: "kind", Value: NewString("check")},
		{Key: "ok", Value: NewBool(ok)},
		{Key: "msg", Value: NewString(msg)},
	})

	return evRecord, nil
}

func (ev *evaluator) evalCallExpr(e *ast.CallExpr, env *Env) (A0Value, error) {
	toolName := strings.Join(e.Tool.Parts, ".")

	// Check tool exists
	tool, ok := ev.opts.Tools[toolName]
	if !ok {
		span := e.Span
		return nil, &A0RuntimeError{
			Code:    diagnostics.EUnknownTool,
			Message: fmt.Sprintf("unknown tool '%s'", toolName),
			Span:    &span,
		}
	}

	// Evaluate args
	argsVal, err := ev.evalExpr(e.Args, env)
	if err != nil {
		return nil, err
	}
	argsRec, ok := argsVal.(A0Record)
	if !ok {
		span := e.Span
		return nil, &A0RuntimeError{
			Code:    diagnostics.EToolArgs,
			Message: "tool arguments must be a record",
			Span:    &span,
		}
	}

	// Budget check
	if ev.budget.MaxToolCalls != nil && ev.tracker.ToolCalls >= *ev.budget.MaxToolCalls {
		return nil, &A0RuntimeError{
			Code:    diagnostics.EBudget,
			Message: "tool call budget exceeded",
		}
	}
	ev.tracker.ToolCalls++

	span := e.Span
	ev.emitWithData(TraceToolStart, &span, map[string]string{"tool": toolName})

	result, err := tool.Execute(ev.ctx, &argsRec)

	ev.emit(TraceToolEnd, &span)

	if err != nil {
		return nil, &A0RuntimeError{
			Code:    diagnostics.ETool,
			Message: fmt.Sprintf("tool '%s' error: %s", toolName, err.Error()),
			Span:    &span,
		}
	}

	if bErr := ev.trackBytesWritten(result); bErr != nil {
		return nil, bErr
	}

	return result, nil
}

func (ev *evaluator) evalDoExpr(e *ast.DoExpr, env *Env) (A0Value, error) {
	toolName := strings.Join(e.Tool.Parts, ".")

	tool, ok := ev.opts.Tools[toolName]
	if !ok {
		span := e.Span
		return nil, &A0RuntimeError{
			Code:    diagnostics.EUnknownTool,
			Message: fmt.Sprintf("unknown tool '%s'", toolName),
			Span:    &span,
		}
	}

	argsVal, err := ev.evalExpr(e.Args, env)
	if err != nil {
		return nil, err
	}
	argsRec, ok := argsVal.(A0Record)
	if !ok {
		span := e.Span
		return nil, &A0RuntimeError{
			Code:    diagnostics.EToolArgs,
			Message: "tool arguments must be a record",
			Span:    &span,
		}
	}

	if ev.budget.MaxToolCalls != nil && ev.tracker.ToolCalls >= *ev.budget.MaxToolCalls {
		return nil, &A0RuntimeError{
			Code:    diagnostics.EBudget,
			Message: "tool call budget exceeded",
		}
	}
	ev.tracker.ToolCalls++

	span := e.Span
	ev.emitWithData(TraceToolStart, &span, map[string]string{"tool": toolName})

	result, err := tool.Execute(ev.ctx, &argsRec)

	ev.emit(TraceToolEnd, &span)

	if err != nil {
		return nil, &A0RuntimeError{
			Code:    diagnostics.ETool,
			Message: fmt.Sprintf("tool '%s' error: %s", toolName, err.Error()),
			Span:    &span,
		}
	}

	if bErr := ev.trackBytesWritten(result); bErr != nil {
		return nil, bErr
	}

	return result, nil
}

func (ev *evaluator) evalFnCallExpr(e *ast.FnCallExpr, env *Env) (A0Value, error) {
	fnName := strings.Join(e.Name.Parts, ".")

	// Evaluate args first
	argsVal, err := ev.evalExpr(e.Args, env)
	if err != nil {
		return nil, err
	}
	argsRec, ok := argsVal.(A0Record)
	if !ok {
		span := e.Span
		return nil, &A0RuntimeError{
			Code:    diagnostics.EType,
			Message: "function arguments must be a record",
			Span:    &span,
		}
	}

	// Check user-defined functions first
	if uf, ok := ev.userFns[fnName]; ok {
		span := e.Span
		ev.emit(TraceFnCallStart, &span)

		childEnv := uf.closure.Child()
		// Bind params from args record
		for _, param := range uf.decl.Params {
			val, found := argsRec.Get(param)
			if !found {
				val = NewNull()
			}
			childEnv.Set(param, val)
		}

		result, err := ev.executeBlock(uf.decl.Body, childEnv)
		ev.emit(TraceFnCallEnd, &span)
		if err != nil {
			return nil, err
		}
		return result, nil
	}

	// Check stdlib
	if stdFn, ok := ev.opts.Stdlib[fnName]; ok {
		// Special handling for map/reduce/filter which take function args
		if fnName == "map" {
			return ev.evalMapCall(&argsRec, env, e)
		}
		if fnName == "reduce" {
			return ev.evalReduceCall(&argsRec, env, e)
		}
		if fnName == "filter" {
			// Check if fn: or by: args are present — if fn:, dispatch specially
			_, hasFn := argsRec.Get("fn")
			_, hasBy := argsRec.Get("by")
			if hasFn || hasBy {
				return ev.evalFilterFnCall(&argsRec, env, e)
			}
		}

		span := e.Span
		ev.emit(TraceFnCallStart, &span)
		result, err := stdFn.Execute(&argsRec)
		ev.emit(TraceFnCallEnd, &span)
		if err != nil {
			return nil, &A0RuntimeError{
				Code:    diagnostics.EFn,
				Message: fmt.Sprintf("stdlib '%s' error: %s", fnName, err.Error()),
				Span:    &span,
			}
		}
		return result, nil
	}

	span := e.Span
	return nil, &A0RuntimeError{
		Code:    diagnostics.EUnknownFn,
		Message: fmt.Sprintf("unknown function '%s'", fnName),
		Span:    &span,
	}
}

func (ev *evaluator) evalMapCall(args *A0Record, env *Env, e *ast.FnCallExpr) (A0Value, error) {
	span := e.Span
	ev.emit(TraceMapStart, &span)

	listVal, _ := args.Get("in")
	fnName := ""
	if fnVal, ok := args.Get("fn"); ok {
		if s, ok := fnVal.(A0String); ok {
			fnName = s.Value
		}
	}

	list, ok := listVal.(A0List)
	if !ok {
		return nil, &A0RuntimeError{
			Code:    diagnostics.EType,
			Message: "map requires a list",
			Span:    &span,
		}
	}

	uf, found := ev.userFns[fnName]
	if !found {
		return nil, &A0RuntimeError{
			Code:    diagnostics.EUnknownFn,
			Message: fmt.Sprintf("unknown function '%s'", fnName),
			Span:    &span,
		}
	}

	results := make([]A0Value, 0, len(list.Items))
	for _, item := range list.Items {
		if err := ev.checkIterationBudget(); err != nil {
			return nil, err
		}
		ev.tracker.Iterations++

		childEnv := ev.bindFnParams(uf, item)
		result, err := ev.executeBlock(uf.decl.Body, childEnv)
		if err != nil {
			return nil, err
		}
		results = append(results, result)
	}

	ev.emit(TraceMapEnd, &span)
	return NewList(results), nil
}

func (ev *evaluator) evalReduceCall(args *A0Record, env *Env, e *ast.FnCallExpr) (A0Value, error) {
	span := e.Span
	ev.emit(TraceReduceStart, &span)

	listVal, _ := args.Get("in")
	initVal, _ := args.Get("init")
	fnName := ""
	if fnVal, ok := args.Get("fn"); ok {
		if s, ok := fnVal.(A0String); ok {
			fnName = s.Value
		}
	}

	list, ok := listVal.(A0List)
	if !ok {
		return nil, &A0RuntimeError{
			Code:    diagnostics.EType,
			Message: "reduce requires a list",
			Span:    &span,
		}
	}

	uf, found := ev.userFns[fnName]
	if !found {
		return nil, &A0RuntimeError{
			Code:    diagnostics.EUnknownFn,
			Message: fmt.Sprintf("unknown function '%s'", fnName),
			Span:    &span,
		}
	}

	acc := initVal
	if acc == nil {
		acc = NewNull()
	}

	for _, item := range list.Items {
		if err := ev.checkIterationBudget(); err != nil {
			return nil, err
		}
		ev.tracker.Iterations++

		// Bind positionally: params[0]=acc, params[1]=item
		childEnv := uf.closure.Child()
		if len(uf.decl.Params) >= 1 {
			childEnv.Set(uf.decl.Params[0], acc)
		}
		if len(uf.decl.Params) >= 2 {
			childEnv.Set(uf.decl.Params[1], item)
		}

		result, err := ev.executeBlock(uf.decl.Body, childEnv)
		if err != nil {
			return nil, err
		}
		acc = result
	}

	ev.emit(TraceReduceEnd, &span)
	return acc, nil
}

func (ev *evaluator) evalFilterFnCall(args *A0Record, env *Env, e *ast.FnCallExpr) (A0Value, error) {
	span := e.Span

	listVal, _ := args.Get("in")
	_, hasFn := args.Get("fn")
	_, hasBy := args.Get("by")

	// Both fn and by present → error
	if hasFn && hasBy {
		return nil, &A0RuntimeError{
			Code:    diagnostics.EFn,
			Message: "filter: cannot specify both 'fn' and 'by'",
			Span:    &span,
		}
	}

	list, ok := listVal.(A0List)
	if !ok {
		return nil, &A0RuntimeError{
			Code:    diagnostics.EType,
			Message: "filter: 'in' must be a list",
			Span:    &span,
		}
	}

	ev.emit(TraceFilterStart, &span)

	if hasBy {
		// by: mode — keep record items where item[by] is truthy
		byVal, _ := args.Get("by")
		byStr, ok := byVal.(A0String)
		if !ok {
			return nil, &A0RuntimeError{
				Code:    diagnostics.EFn,
				Message: "filter: 'by' must be a string",
				Span:    &span,
			}
		}

		var results []A0Value
		for _, item := range list.Items {
			if err := ev.checkIterationBudget(); err != nil {
				return nil, err
			}
			ev.tracker.Iterations++

			rec, ok := item.(A0Record)
			if !ok {
				continue // discard non-records
			}
			val, found := rec.Get(byStr.Value)
			if found && Truthiness(val) {
				results = append(results, item)
			}
		}

		ev.emit(TraceFilterEnd, &span)
		return NewList(results), nil
	}

	// fn: mode — call named user function per item
	fnVal, _ := args.Get("fn")
	fnStr, ok := fnVal.(A0String)
	if !ok {
		return nil, &A0RuntimeError{
			Code:    diagnostics.EFn,
			Message: "filter: 'fn' must be a string",
			Span:    &span,
		}
	}

	uf, found := ev.userFns[fnStr.Value]
	if !found {
		return nil, &A0RuntimeError{
			Code:    diagnostics.EUnknownFn,
			Message: fmt.Sprintf("unknown function '%s'", fnStr.Value),
			Span:    &span,
		}
	}

	var results []A0Value
	for _, item := range list.Items {
		if err := ev.checkIterationBudget(); err != nil {
			return nil, err
		}
		ev.tracker.Iterations++

		childEnv := ev.bindFnParams(uf, item)
		result, err := ev.executeBlock(uf.decl.Body, childEnv)
		if err != nil {
			return nil, err
		}
		// Check the first value of the result record for truthiness
		// (fn returns { ok: bool }, filter checks the first value)
		keep := false
		if rec, ok := result.(A0Record); ok && len(rec.Pairs) > 0 {
			keep = Truthiness(rec.Pairs[0].Value)
		} else {
			keep = Truthiness(result)
		}
		if keep {
			results = append(results, item)
		}
	}

	ev.emit(TraceFilterEnd, &span)
	return NewList(results), nil
}

// bindFnParams creates a child env from a user function's closure and binds item to parameters.
// Single param: bind item directly. Multi-param + record item: destructure fields.
// Multi-param + non-record: E_TYPE error.
func (ev *evaluator) bindFnParams(uf *userFn, item A0Value) *Env {
	childEnv := uf.closure.Child()
	if len(uf.decl.Params) == 1 {
		// Single param: bind item directly
		childEnv.Set(uf.decl.Params[0], item)
	} else if rec, ok := item.(A0Record); ok {
		// Multi-param + record: destructure fields
		for _, param := range uf.decl.Params {
			val, found := rec.Get(param)
			if !found {
				val = NewNull()
			}
			childEnv.Set(param, val)
		}
	} else {
		// Multi-param + non-record: bind first param to item, rest to null
		for i, param := range uf.decl.Params {
			if i == 0 {
				childEnv.Set(param, item)
			} else {
				childEnv.Set(param, NewNull())
			}
		}
	}
	return childEnv
}

// trackBytesWritten checks tool result for bytes field and tracks it against budget.
func (ev *evaluator) trackBytesWritten(result A0Value) error {
	if result == nil {
		return nil
	}
	rec, ok := result.(A0Record)
	if !ok {
		return nil
	}
	bytesVal, found := rec.Get("bytes")
	if !found {
		return nil
	}
	if num, ok := bytesVal.(A0Number); ok {
		ev.tracker.BytesWritten += int64(num.Value)
		if ev.budget.MaxBytesWritten != nil && ev.tracker.BytesWritten > *ev.budget.MaxBytesWritten {
			return &A0RuntimeError{
				Code:    diagnostics.EBudget,
				Message: fmt.Sprintf("bytes written budget exceeded (max %d)", *ev.budget.MaxBytesWritten),
			}
		}
	}
	return nil
}

// DeepEqual recursively compares two A0 values.
// typeNameOf returns the A0 type name for error messages.
func typeNameOf(v A0Value) string {
	switch v.(type) {
	case A0Null:
		return "null"
	case A0Bool:
		return "boolean"
	case A0Number:
		return "number"
	case A0String:
		return "string"
	case A0List:
		return "list"
	case A0Record:
		return "record"
	default:
		return "unknown"
	}
}

func DeepEqual(a, b A0Value) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}

	switch av := a.(type) {
	case A0Null:
		_, ok := b.(A0Null)
		return ok

	case A0Bool:
		bv, ok := b.(A0Bool)
		return ok && av.Value == bv.Value

	case A0Number:
		bv, ok := b.(A0Number)
		return ok && av.Value == bv.Value

	case A0String:
		bv, ok := b.(A0String)
		return ok && av.Value == bv.Value

	case A0List:
		bv, ok := b.(A0List)
		if !ok || len(av.Items) != len(bv.Items) {
			return false
		}
		for i := range av.Items {
			if !DeepEqual(av.Items[i], bv.Items[i]) {
				return false
			}
		}
		return true

	case A0Record:
		bv, ok := b.(A0Record)
		if !ok || len(av.Pairs) != len(bv.Pairs) {
			return false
		}
		for _, kv := range av.Pairs {
			bVal, found := bv.Get(kv.Key)
			if !found || !DeepEqual(kv.Value, bVal) {
				return false
			}
		}
		return true
	}

	return false
}
