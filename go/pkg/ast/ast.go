// Package ast defines the A0 language AST node types.
package ast

// Span represents a source location range.
type Span struct {
	File      string `json:"file"`
	StartLine int    `json:"startLine"`
	StartCol  int    `json:"startCol"`
	EndLine   int    `json:"endLine"`
	EndCol    int    `json:"endCol"`
}

// Node is the interface implemented by all AST nodes.
type Node interface {
	Kind() string
	NodeSpan() Span
}

// BinaryOp represents a binary operator.
type BinaryOp string

const (
	OpAdd  BinaryOp = "+"
	OpSub  BinaryOp = "-"
	OpMul  BinaryOp = "*"
	OpDiv  BinaryOp = "/"
	OpMod  BinaryOp = "%"
	OpGt   BinaryOp = ">"
	OpLt   BinaryOp = "<"
	OpGtEq BinaryOp = ">="
	OpLtEq BinaryOp = "<="
	OpEqEq BinaryOp = "=="
	OpNeq  BinaryOp = "!="
)

// UnaryOp represents a unary operator.
type UnaryOp string

const (
	OpNeg UnaryOp = "-"
)

// --- Expr is the interface for all expression nodes ---

type Expr interface {
	Node
	exprNode() // sealed marker
}

// --- Stmt is the interface for all statement nodes ---

type Stmt interface {
	Node
	stmtNode() // sealed marker
}

// --- Header is the interface for all header declaration nodes ---

type Header interface {
	Node
	headerNode() // sealed marker
}

// --- Literal Expressions ---

type IntLiteral struct {
	Span  Span
	Value int64
}

func (n *IntLiteral) Kind() string    { return "IntLiteral" }
func (n *IntLiteral) NodeSpan() Span  { return n.Span }
func (n *IntLiteral) exprNode()       {}

type FloatLiteral struct {
	Span  Span
	Value float64
}

func (n *FloatLiteral) Kind() string    { return "FloatLiteral" }
func (n *FloatLiteral) NodeSpan() Span  { return n.Span }
func (n *FloatLiteral) exprNode()       {}

type BoolLiteral struct {
	Span  Span
	Value bool
}

func (n *BoolLiteral) Kind() string    { return "BoolLiteral" }
func (n *BoolLiteral) NodeSpan() Span  { return n.Span }
func (n *BoolLiteral) exprNode()       {}

type StrLiteral struct {
	Span  Span
	Value string
}

func (n *StrLiteral) Kind() string    { return "StrLiteral" }
func (n *StrLiteral) NodeSpan() Span  { return n.Span }
func (n *StrLiteral) exprNode()       {}

type NullLiteral struct {
	Span Span
}

func (n *NullLiteral) Kind() string    { return "NullLiteral" }
func (n *NullLiteral) NodeSpan() Span  { return n.Span }
func (n *NullLiteral) exprNode()       {}

// --- Identifiers ---

type IdentPath struct {
	Span  Span
	Parts []string
}

func (n *IdentPath) Kind() string    { return "IdentPath" }
func (n *IdentPath) NodeSpan() Span  { return n.Span }
func (n *IdentPath) exprNode()       {}

// --- Collections ---

// RecordEntry is a union of RecordPair and SpreadPair in record expressions.
type RecordEntry interface {
	Node
	recordEntryNode() // sealed marker
}

type RecordPair struct {
	Span  Span
	Key   string
	Value Expr
}

func (n *RecordPair) Kind() string       { return "RecordPair" }
func (n *RecordPair) NodeSpan() Span     { return n.Span }
func (n *RecordPair) recordEntryNode()   {}

type SpreadPair struct {
	Span Span
	Expr Expr
}

func (n *SpreadPair) Kind() string       { return "SpreadPair" }
func (n *SpreadPair) NodeSpan() Span     { return n.Span }
func (n *SpreadPair) recordEntryNode()   {}

type RecordExpr struct {
	Span  Span
	Pairs []RecordEntry
}

func (n *RecordExpr) Kind() string    { return "RecordExpr" }
func (n *RecordExpr) NodeSpan() Span  { return n.Span }
func (n *RecordExpr) exprNode()       {}

type ListExpr struct {
	Span     Span
	Elements []Expr
}

func (n *ListExpr) Kind() string    { return "ListExpr" }
func (n *ListExpr) NodeSpan() Span  { return n.Span }
func (n *ListExpr) exprNode()       {}

// --- Tool/Effect Expressions ---

type CallExpr struct {
	Span Span
	Tool *IdentPath
	Args *RecordExpr
}

func (n *CallExpr) Kind() string    { return "CallExpr" }
func (n *CallExpr) NodeSpan() Span  { return n.Span }
func (n *CallExpr) exprNode()       {}

type DoExpr struct {
	Span Span
	Tool *IdentPath
	Args *RecordExpr
}

func (n *DoExpr) Kind() string    { return "DoExpr" }
func (n *DoExpr) NodeSpan() Span  { return n.Span }
func (n *DoExpr) exprNode()       {}

type AssertExpr struct {
	Span Span
	Args *RecordExpr
}

func (n *AssertExpr) Kind() string    { return "AssertExpr" }
func (n *AssertExpr) NodeSpan() Span  { return n.Span }
func (n *AssertExpr) exprNode()       {}

type CheckExpr struct {
	Span Span
	Args *RecordExpr
}

func (n *CheckExpr) Kind() string    { return "CheckExpr" }
func (n *CheckExpr) NodeSpan() Span  { return n.Span }
func (n *CheckExpr) exprNode()       {}

type FnCallExpr struct {
	Span Span
	Name *IdentPath
	Args *RecordExpr
}

func (n *FnCallExpr) Kind() string    { return "FnCallExpr" }
func (n *FnCallExpr) NodeSpan() Span  { return n.Span }
func (n *FnCallExpr) exprNode()       {}

// --- Control Flow ---

type IfExpr struct {
	Span Span
	Cond Expr
	Then Expr
	Else Expr
}

func (n *IfExpr) Kind() string    { return "IfExpr" }
func (n *IfExpr) NodeSpan() Span  { return n.Span }
func (n *IfExpr) exprNode()       {}

type IfBlockExpr struct {
	Span     Span
	Cond     Expr
	ThenBody []Stmt
	ElseBody []Stmt
}

func (n *IfBlockExpr) Kind() string    { return "IfBlockExpr" }
func (n *IfBlockExpr) NodeSpan() Span  { return n.Span }
func (n *IfBlockExpr) exprNode()       {}

type ForExpr struct {
	Span    Span
	List    Expr
	Binding string
	Body    []Stmt
}

func (n *ForExpr) Kind() string    { return "ForExpr" }
func (n *ForExpr) NodeSpan() Span  { return n.Span }
func (n *ForExpr) exprNode()       {}

type MatchArm struct {
	Span    Span
	Tag     string // "ok" or "err"
	Binding string
	Body    []Stmt
}

func (n *MatchArm) Kind() string    { return "MatchArm" }
func (n *MatchArm) NodeSpan() Span  { return n.Span }

type MatchExpr struct {
	Span    Span
	Subject Expr
	OkArm   *MatchArm
	ErrArm  *MatchArm
}

func (n *MatchExpr) Kind() string    { return "MatchExpr" }
func (n *MatchExpr) NodeSpan() Span  { return n.Span }
func (n *MatchExpr) exprNode()       {}

// --- Binary & Unary Expressions ---

type BinaryExpr struct {
	Span  Span
	Op    BinaryOp
	Left  Expr
	Right Expr
}

func (n *BinaryExpr) Kind() string    { return "BinaryExpr" }
func (n *BinaryExpr) NodeSpan() Span  { return n.Span }
func (n *BinaryExpr) exprNode()       {}

type UnaryExpr struct {
	Span    Span
	Op      UnaryOp
	Operand Expr
}

func (n *UnaryExpr) Kind() string    { return "UnaryExpr" }
func (n *UnaryExpr) NodeSpan() Span  { return n.Span }
func (n *UnaryExpr) exprNode()       {}

// --- Error Handling ---

type TryExpr struct {
	Span         Span
	TryBody      []Stmt
	CatchBinding string
	CatchBody    []Stmt
}

func (n *TryExpr) Kind() string    { return "TryExpr" }
func (n *TryExpr) NodeSpan() Span  { return n.Span }
func (n *TryExpr) exprNode()       {}

// --- v0.5: Filter and Loop ---

type FilterBlockExpr struct {
	Span    Span
	List    Expr
	Binding string
	Body    []Stmt
}

func (n *FilterBlockExpr) Kind() string    { return "FilterBlockExpr" }
func (n *FilterBlockExpr) NodeSpan() Span  { return n.Span }
func (n *FilterBlockExpr) exprNode()       {}

type LoopExpr struct {
	Span    Span
	Init    Expr
	Times   Expr
	Binding string
	Body    []Stmt
}

func (n *LoopExpr) Kind() string    { return "LoopExpr" }
func (n *LoopExpr) NodeSpan() Span  { return n.Span }
func (n *LoopExpr) exprNode()       {}

// --- Statements ---

type LetStmt struct {
	Span  Span
	Name  string
	Value Expr
}

func (n *LetStmt) Kind() string    { return "LetStmt" }
func (n *LetStmt) NodeSpan() Span  { return n.Span }
func (n *LetStmt) stmtNode()       {}

type ExprStmt struct {
	Span   Span
	Expr   Expr
	Target *IdentPath // optional -> name binding
}

func (n *ExprStmt) Kind() string    { return "ExprStmt" }
func (n *ExprStmt) NodeSpan() Span  { return n.Span }
func (n *ExprStmt) stmtNode()       {}

type ReturnStmt struct {
	Span  Span
	Value Expr
}

func (n *ReturnStmt) Kind() string    { return "ReturnStmt" }
func (n *ReturnStmt) NodeSpan() Span  { return n.Span }
func (n *ReturnStmt) stmtNode()       {}

type FnDecl struct {
	Span   Span
	Name   string
	Params []string
	Body   []Stmt
}

func (n *FnDecl) Kind() string    { return "FnDecl" }
func (n *FnDecl) NodeSpan() Span  { return n.Span }
func (n *FnDecl) stmtNode()       {}

// --- Headers ---

type CapDecl struct {
	Span         Span
	Capabilities *RecordExpr
}

func (n *CapDecl) Kind() string    { return "CapDecl" }
func (n *CapDecl) NodeSpan() Span  { return n.Span }
func (n *CapDecl) headerNode()     {}

type BudgetDecl struct {
	Span   Span
	Budget *RecordExpr
}

func (n *BudgetDecl) Kind() string    { return "BudgetDecl" }
func (n *BudgetDecl) NodeSpan() Span  { return n.Span }
func (n *BudgetDecl) headerNode()     {}

type ImportDecl struct {
	Span  Span
	Path  string
	Alias string
}

func (n *ImportDecl) Kind() string    { return "ImportDecl" }
func (n *ImportDecl) NodeSpan() Span  { return n.Span }
func (n *ImportDecl) headerNode()     {}

// --- Program ---

type Program struct {
	Span       Span
	Headers    []Header
	Statements []Stmt
}

func (n *Program) Kind() string    { return "Program" }
func (n *Program) NodeSpan() Span  { return n.Span }
