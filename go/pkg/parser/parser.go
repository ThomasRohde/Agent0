// Package parser implements the A0 language parser.
package parser

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/thomasrohde/agent0/go/pkg/ast"
	"github.com/thomasrohde/agent0/go/pkg/diagnostics"
	"github.com/thomasrohde/agent0/go/pkg/lexer"
)

type parser struct {
	tokens []lexer.Token
	pos    int
	diags  []diagnostics.Diagnostic
}

// Parse tokenizes source and parses it into an AST.
func Parse(source, filename string) (*ast.Program, []diagnostics.Diagnostic) {
	tokens, err := lexer.Tokenize(source, filename)
	if err != nil {
		if le, ok := err.(*lexer.LexError); ok {
			return nil, []diagnostics.Diagnostic{le.Diag}
		}
		return nil, []diagnostics.Diagnostic{diagnostics.MakeDiag(diagnostics.ELex, err.Error(), nil, "")}
	}

	p := &parser{tokens: tokens, pos: 0}
	prog := p.parseProgram(filename)
	if len(p.diags) > 0 {
		return nil, p.diags
	}
	return prog, nil
}

func (p *parser) current() lexer.Token {
	if p.pos >= len(p.tokens) {
		return p.tokens[len(p.tokens)-1] // EOF
	}
	return p.tokens[p.pos]
}

func (p *parser) peek() lexer.TokenType {
	return p.current().Type
}

func (p *parser) peekAt(offset int) lexer.TokenType {
	idx := p.pos + offset
	if idx >= len(p.tokens) {
		return lexer.TokEOF
	}
	return p.tokens[idx].Type
}

func (p *parser) advance() lexer.Token {
	tok := p.current()
	if p.pos < len(p.tokens)-1 {
		p.pos++
	}
	return tok
}

func (p *parser) expect(typ lexer.TokenType) (lexer.Token, bool) {
	tok := p.current()
	if tok.Type != typ {
		p.addError(fmt.Sprintf("expected %s, got '%s'", tokenName(typ), tok.Value), &tok.Span)
		return tok, false
	}
	return p.advance(), true
}

func (p *parser) addError(msg string, span *ast.Span) {
	p.diags = append(p.diags, diagnostics.MakeDiag(diagnostics.EParse, msg, span, ""))
}

func (p *parser) spanFrom(start ast.Span) ast.Span {
	cur := p.current().Span
	return ast.Span{
		File:      start.File,
		StartLine: start.StartLine,
		StartCol:  start.StartCol,
		EndLine:   cur.StartLine,
		EndCol:    cur.StartCol,
	}
}

func (p *parser) spanFromTo(start, end ast.Span) ast.Span {
	return ast.Span{
		File:      start.File,
		StartLine: start.StartLine,
		StartCol:  start.StartCol,
		EndLine:   end.EndLine,
		EndCol:    end.EndCol,
	}
}

func tokenName(t lexer.TokenType) string {
	switch t {
	case lexer.TokLBrace:
		return "'{'"
	case lexer.TokRBrace:
		return "'}'"
	case lexer.TokLBracket:
		return "'['"
	case lexer.TokRBracket:
		return "']'"
	case lexer.TokLParen:
		return "'('"
	case lexer.TokRParen:
		return "')'"
	case lexer.TokColon:
		return "':'"
	case lexer.TokComma:
		return "','"
	case lexer.TokEquals:
		return "'='"
	case lexer.TokArrow:
		return "'->'"
	case lexer.TokIdent:
		return "identifier"
	case lexer.TokStringLit:
		return "string"
	case lexer.TokIntLit:
		return "integer"
	case lexer.TokEOF:
		return "end of file"
	default:
		return fmt.Sprintf("token(%d)", t)
	}
}

// isKeyword returns true if the token type is a keyword.
func isKeyword(t lexer.TokenType) bool {
	return t >= lexer.TokCap && t <= lexer.TokLoop
}

// isRecordKey returns true if the token can be used as a record key.
func isRecordKey(t lexer.TokenType) bool {
	return t == lexer.TokIdent || isKeyword(t)
}

// --- Program ---

func (p *parser) parseProgram(filename string) *ast.Program {
	startSpan := p.current().Span

	var headers []ast.Header
	var stmts []ast.Stmt

	// Parse headers (cap, budget, import at top level)
	for p.peek() != lexer.TokEOF {
		switch p.peek() {
		case lexer.TokCap:
			h := p.parseCapDecl()
			if h == nil {
				return nil
			}
			headers = append(headers, h)
		case lexer.TokBudget:
			h := p.parseBudgetDecl()
			if h == nil {
				return nil
			}
			headers = append(headers, h)
		case lexer.TokImport:
			h := p.parseImportDecl()
			if h == nil {
				return nil
			}
			headers = append(headers, h)
		default:
			goto parseStmts
		}
	}

parseStmts:
	for p.peek() != lexer.TokEOF {
		stmt := p.parseStmt()
		if stmt == nil {
			return nil
		}
		stmts = append(stmts, stmt)
	}

	return &ast.Program{
		Span:       p.spanFrom(startSpan),
		Headers:    headers,
		Statements: stmts,
	}
}

// --- Headers ---

func (p *parser) parseCapDecl() *ast.CapDecl {
	start := p.advance() // consume 'cap'
	rec := p.parseRecordExpr()
	if rec == nil {
		return nil
	}
	return &ast.CapDecl{
		Span:         p.spanFromTo(start.Span, rec.Span),
		Capabilities: rec,
	}
}

func (p *parser) parseBudgetDecl() *ast.BudgetDecl {
	start := p.advance() // consume 'budget'
	rec := p.parseRecordExpr()
	if rec == nil {
		return nil
	}
	return &ast.BudgetDecl{
		Span:   p.spanFromTo(start.Span, rec.Span),
		Budget: rec,
	}
}

func (p *parser) parseImportDecl() *ast.ImportDecl {
	start := p.advance() // consume 'import'
	pathTok, ok := p.expect(lexer.TokStringLit)
	if !ok {
		return nil
	}
	if _, ok := p.expect(lexer.TokAs); !ok {
		return nil
	}
	aliasTok, ok := p.expect(lexer.TokIdent)
	if !ok {
		return nil
	}
	return &ast.ImportDecl{
		Span:  p.spanFromTo(start.Span, aliasTok.Span),
		Path:  pathTok.Value,
		Alias: aliasTok.Value,
	}
}

// --- Statements ---

func (p *parser) parseStmt() ast.Stmt {
	switch p.peek() {
	case lexer.TokLet:
		s := p.parseLetStmt()
		if s == nil {
			return nil
		}
		return s
	case lexer.TokReturn:
		s := p.parseReturnStmt()
		if s == nil {
			return nil
		}
		return s
	case lexer.TokFn:
		s := p.parseFnDecl()
		if s == nil {
			return nil
		}
		return s
	default:
		s := p.parseExprStmt()
		if s == nil {
			return nil
		}
		return s
	}
}

func (p *parser) parseLetStmt() *ast.LetStmt {
	start := p.advance() // consume 'let'
	nameTok, ok := p.expect(lexer.TokIdent)
	if !ok {
		return nil
	}
	if _, ok := p.expect(lexer.TokEquals); !ok {
		return nil
	}
	value := p.parseExpr()
	if value == nil {
		return nil
	}
	return &ast.LetStmt{
		Span:  p.spanFromTo(start.Span, value.NodeSpan()),
		Name:  nameTok.Value,
		Value: value,
	}
}

func (p *parser) parseReturnStmt() *ast.ReturnStmt {
	start := p.advance() // consume 'return'
	value := p.parseExpr()
	if value == nil {
		return nil
	}
	return &ast.ReturnStmt{
		Span:  p.spanFromTo(start.Span, value.NodeSpan()),
		Value: value,
	}
}

func (p *parser) parseFnDecl() *ast.FnDecl {
	start := p.advance() // consume 'fn'
	nameTok, ok := p.expect(lexer.TokIdent)
	if !ok {
		return nil
	}

	// Parse params: { param1, param2, ... }
	if _, ok := p.expect(lexer.TokLBrace); !ok {
		return nil
	}
	var params []string
	for p.peek() != lexer.TokRBrace && p.peek() != lexer.TokEOF {
		paramTok, ok := p.expect(lexer.TokIdent)
		if !ok {
			return nil
		}
		params = append(params, paramTok.Value)
		if p.peek() == lexer.TokComma {
			p.advance()
		}
	}
	if _, ok := p.expect(lexer.TokRBrace); !ok {
		return nil
	}

	// Parse body block
	body := p.parseBlock()
	if body == nil {
		return nil
	}

	lastSpan := start.Span
	if len(body) > 0 {
		lastSpan = body[len(body)-1].NodeSpan()
	}

	return &ast.FnDecl{
		Span:   p.spanFromTo(start.Span, lastSpan),
		Name:   nameTok.Value,
		Params: params,
		Body:   body,
	}
}

func (p *parser) parseExprStmt() *ast.ExprStmt {
	expr := p.parseExpr()
	if expr == nil {
		return nil
	}

	var target *ast.IdentPath
	endSpan := expr.NodeSpan()
	if p.peek() == lexer.TokArrow {
		p.advance() // consume '->'
		ip := p.parseIdentPath()
		if ip == nil {
			return nil
		}
		target = ip
		endSpan = ip.Span
	}

	return &ast.ExprStmt{
		Span:   p.spanFromTo(expr.NodeSpan(), endSpan),
		Expr:   expr,
		Target: target,
	}
}

// --- Block ---

func (p *parser) parseBlock() []ast.Stmt {
	if _, ok := p.expect(lexer.TokLBrace); !ok {
		return nil
	}
	var stmts []ast.Stmt
	for p.peek() != lexer.TokRBrace && p.peek() != lexer.TokEOF {
		stmt := p.parseStmt()
		if stmt == nil {
			return nil
		}
		stmts = append(stmts, stmt)
	}
	if _, ok := p.expect(lexer.TokRBrace); !ok {
		return nil
	}
	return stmts
}

// --- Expressions ---

func (p *parser) parseExpr() ast.Expr {
	switch p.peek() {
	case lexer.TokIf:
		return p.parseIf()
	case lexer.TokFor:
		return p.parseFor()
	case lexer.TokMatch:
		return p.parseMatch()
	case lexer.TokCallQ:
		return p.parseCallExpr()
	case lexer.TokDo:
		return p.parseDoExpr()
	case lexer.TokAssert:
		return p.parseAssertExpr()
	case lexer.TokCheck:
		return p.parseCheckExpr()
	case lexer.TokTry:
		return p.parseTryExpr()
	case lexer.TokFilter:
		return p.parseFilter()
	case lexer.TokLoop:
		return p.parseLoop()
	default:
		return p.parseComparison()
	}
}

func (p *parser) parseIf() ast.Expr {
	start := p.advance() // consume 'if'

	if p.peek() == lexer.TokLParen {
		// Block if: if (cond) { body } else { body }
		return p.parseIfBlock(start)
	}
	// Inline if: if { cond: ..., then: ..., else: ... }
	return p.parseIfInline(start)
}

func (p *parser) parseIfBlock(start lexer.Token) ast.Expr {
	p.advance() // consume '('
	cond := p.parseExpr()
	if cond == nil {
		return nil
	}
	if _, ok := p.expect(lexer.TokRParen); !ok {
		return nil
	}

	thenBody := p.parseBlock()
	if thenBody == nil {
		return nil
	}

	var elseBody []ast.Stmt
	if p.peek() == lexer.TokElse {
		p.advance() // consume 'else'
		elseBody = p.parseBlock()
		if elseBody == nil {
			return nil
		}
	}

	endSpan := start.Span
	if len(elseBody) > 0 {
		endSpan = elseBody[len(elseBody)-1].NodeSpan()
	} else if len(thenBody) > 0 {
		endSpan = thenBody[len(thenBody)-1].NodeSpan()
	}

	return &ast.IfBlockExpr{
		Span:     p.spanFromTo(start.Span, endSpan),
		Cond:     cond,
		ThenBody: thenBody,
		ElseBody: elseBody,
	}
}

func (p *parser) parseIfInline(start lexer.Token) ast.Expr {
	// Parse as record: { cond: expr, then: expr, else: expr }
	rec := p.parseRecordExpr()
	if rec == nil {
		return nil
	}

	// Extract cond, then, else from record pairs
	var condExpr, thenExpr, elseExpr ast.Expr
	for _, entry := range rec.Pairs {
		pair, ok := entry.(*ast.RecordPair)
		if !ok {
			continue
		}
		switch pair.Key {
		case "cond":
			condExpr = pair.Value
		case "then":
			thenExpr = pair.Value
		case "else":
			elseExpr = pair.Value
		}
	}

	if condExpr == nil || thenExpr == nil || elseExpr == nil {
		span := rec.Span
		p.addError("if expression requires 'cond', 'then', and 'else' fields", &span)
		return nil
	}

	return &ast.IfExpr{
		Span: p.spanFromTo(start.Span, rec.Span),
		Cond: condExpr,
		Then: thenExpr,
		Else: elseExpr,
	}
}

func (p *parser) parseFor() ast.Expr {
	start := p.advance() // consume 'for'

	// Parse config record: { in: expr, as: "binding" }
	rec := p.parseRecordExpr()
	if rec == nil {
		return nil
	}

	var listExpr ast.Expr
	var binding string
	for _, entry := range rec.Pairs {
		pair, ok := entry.(*ast.RecordPair)
		if !ok {
			continue
		}
		switch pair.Key {
		case "in":
			listExpr = pair.Value
		case "as":
			if strLit, ok := pair.Value.(*ast.StrLiteral); ok {
				binding = strLit.Value
			}
		}
	}

	if listExpr == nil {
		span := rec.Span
		p.addError("for expression requires 'in' field", &span)
		return nil
	}
	if binding == "" {
		span := rec.Span
		p.addError("for expression requires 'as' field with string binding name", &span)
		return nil
	}

	body := p.parseBlock()
	if body == nil {
		return nil
	}

	return &ast.ForExpr{
		Span:    p.spanFromTo(start.Span, p.current().Span),
		List:    listExpr,
		Binding: binding,
		Body:    body,
	}
}

func (p *parser) parseMatch() ast.Expr {
	start := p.advance() // consume 'match'

	subject := p.parseExpr()
	if subject == nil {
		return nil
	}

	if _, ok := p.expect(lexer.TokLBrace); !ok {
		return nil
	}

	var okArm, errArm *ast.MatchArm

	for p.peek() != lexer.TokRBrace && p.peek() != lexer.TokEOF {
		tag := p.current()
		if tag.Type != lexer.TokIdent || (tag.Value != "ok" && tag.Value != "err") {
			p.addError(fmt.Sprintf("expected 'ok' or 'err' in match arm, got '%s'", tag.Value), &tag.Span)
			return nil
		}
		p.advance()

		// Parse binding: { name } or just an identifier
		var bindingName string
		if p.peek() == lexer.TokLBrace {
			p.advance()
			bTok, ok := p.expect(lexer.TokIdent)
			if !ok {
				return nil
			}
			bindingName = bTok.Value
			if _, ok := p.expect(lexer.TokRBrace); !ok {
				return nil
			}
		} else if p.peek() == lexer.TokIdent {
			bTok := p.advance()
			bindingName = bTok.Value
		}

		body := p.parseBlock()
		if body == nil {
			return nil
		}

		arm := &ast.MatchArm{
			Span:    p.spanFromTo(tag.Span, p.current().Span),
			Tag:     tag.Value,
			Binding: bindingName,
			Body:    body,
		}

		if tag.Value == "ok" {
			okArm = arm
		} else {
			errArm = arm
		}
	}

	if _, ok := p.expect(lexer.TokRBrace); !ok {
		return nil
	}

	return &ast.MatchExpr{
		Span:    p.spanFromTo(start.Span, p.current().Span),
		Subject: subject,
		OkArm:   okArm,
		ErrArm:  errArm,
	}
}

func (p *parser) parseCallExpr() ast.Expr {
	start := p.advance() // consume 'call?'
	tool := p.parseIdentPath()
	if tool == nil {
		return nil
	}
	args := p.parseRecordExpr()
	if args == nil {
		return nil
	}
	return &ast.CallExpr{
		Span: p.spanFromTo(start.Span, args.Span),
		Tool: tool,
		Args: args,
	}
}

func (p *parser) parseDoExpr() ast.Expr {
	start := p.advance() // consume 'do'
	tool := p.parseIdentPath()
	if tool == nil {
		return nil
	}
	args := p.parseRecordExpr()
	if args == nil {
		return nil
	}
	return &ast.DoExpr{
		Span: p.spanFromTo(start.Span, args.Span),
		Tool: tool,
		Args: args,
	}
}

func (p *parser) parseAssertExpr() ast.Expr {
	start := p.advance() // consume 'assert'
	args := p.parseRecordExpr()
	if args == nil {
		return nil
	}
	return &ast.AssertExpr{
		Span: p.spanFromTo(start.Span, args.Span),
		Args: args,
	}
}

func (p *parser) parseCheckExpr() ast.Expr {
	start := p.advance() // consume 'check'
	args := p.parseRecordExpr()
	if args == nil {
		return nil
	}
	return &ast.CheckExpr{
		Span: p.spanFromTo(start.Span, args.Span),
		Args: args,
	}
}

func (p *parser) parseTryExpr() ast.Expr {
	start := p.advance() // consume 'try'
	tryBody := p.parseBlock()
	if tryBody == nil {
		return nil
	}
	if _, ok := p.expect(lexer.TokCatch); !ok {
		return nil
	}
	// Catch binding can be a string literal or an identifier
	var binding string
	if p.peek() == lexer.TokStringLit {
		tok := p.advance()
		binding = tok.Value
	} else if p.peek() == lexer.TokIdent {
		tok := p.advance()
		binding = tok.Value
	} else {
		tok := p.current()
		p.addError(fmt.Sprintf("expected catch binding name, got '%s'", tok.Value), &tok.Span)
		return nil
	}

	catchBody := p.parseBlock()
	if catchBody == nil {
		return nil
	}

	return &ast.TryExpr{
		Span:         p.spanFromTo(start.Span, p.current().Span),
		TryBody:      tryBody,
		CatchBinding: binding,
		CatchBody:    catchBody,
	}
}

func (p *parser) parseFilter() ast.Expr {
	start := p.advance() // consume 'filter'

	// Parse config record
	rec := p.parseRecordExpr()
	if rec == nil {
		return nil
	}

	// If next token is '{', it's a filter block (has body)
	if p.peek() == lexer.TokLBrace {
		var listExpr ast.Expr
		var binding string
		for _, entry := range rec.Pairs {
			pair, ok := entry.(*ast.RecordPair)
			if !ok {
				continue
			}
			switch pair.Key {
			case "in":
				listExpr = pair.Value
			case "as":
				if strLit, ok := pair.Value.(*ast.StrLiteral); ok {
					binding = strLit.Value
				}
			}
		}

		if listExpr == nil {
			span := rec.Span
			p.addError("filter block requires 'in' field", &span)
			return nil
		}

		body := p.parseBlock()
		if body == nil {
			return nil
		}

		return &ast.FilterBlockExpr{
			Span:    p.spanFromTo(start.Span, p.current().Span),
			List:    listExpr,
			Binding: binding,
			Body:    body,
		}
	}

	// Otherwise it's a stdlib filter call
	return &ast.FnCallExpr{
		Span: p.spanFromTo(start.Span, rec.Span),
		Name: &ast.IdentPath{Span: start.Span, Parts: []string{"filter"}},
		Args: rec,
	}
}

func (p *parser) parseLoop() ast.Expr {
	start := p.advance() // consume 'loop'

	rec := p.parseRecordExpr()
	if rec == nil {
		return nil
	}

	var initExpr, timesExpr ast.Expr
	var binding string
	for _, entry := range rec.Pairs {
		pair, ok := entry.(*ast.RecordPair)
		if !ok {
			continue
		}
		switch pair.Key {
		case "in":
			initExpr = pair.Value
		case "times":
			timesExpr = pair.Value
		case "as":
			if strLit, ok := pair.Value.(*ast.StrLiteral); ok {
				binding = strLit.Value
			}
		}
	}

	body := p.parseBlock()
	if body == nil {
		return nil
	}

	return &ast.LoopExpr{
		Span:    p.spanFromTo(start.Span, p.current().Span),
		Init:    initExpr,
		Times:   timesExpr,
		Binding: binding,
		Body:    body,
	}
}

// --- Precedence climbing ---

func (p *parser) parseComparison() ast.Expr {
	left := p.parseAdditive()
	if left == nil {
		return nil
	}

	for {
		var op ast.BinaryOp
		switch p.peek() {
		case lexer.TokGt:
			op = ast.OpGt
		case lexer.TokLt:
			op = ast.OpLt
		case lexer.TokGtEq:
			op = ast.OpGtEq
		case lexer.TokLtEq:
			op = ast.OpLtEq
		case lexer.TokEqEq:
			op = ast.OpEqEq
		case lexer.TokBangEq:
			op = ast.OpNeq
		default:
			return left
		}
		p.advance()
		right := p.parseAdditive()
		if right == nil {
			return nil
		}
		left = &ast.BinaryExpr{
			Span:  p.spanFromTo(left.NodeSpan(), right.NodeSpan()),
			Op:    op,
			Left:  left,
			Right: right,
		}
	}
}

func (p *parser) parseAdditive() ast.Expr {
	left := p.parseMultiplicative()
	if left == nil {
		return nil
	}

	for {
		var op ast.BinaryOp
		switch p.peek() {
		case lexer.TokPlus:
			op = ast.OpAdd
		case lexer.TokMinus:
			op = ast.OpSub
		default:
			return left
		}
		p.advance()
		right := p.parseMultiplicative()
		if right == nil {
			return nil
		}
		left = &ast.BinaryExpr{
			Span:  p.spanFromTo(left.NodeSpan(), right.NodeSpan()),
			Op:    op,
			Left:  left,
			Right: right,
		}
	}
}

func (p *parser) parseMultiplicative() ast.Expr {
	left := p.parseUnary()
	if left == nil {
		return nil
	}

	for {
		var op ast.BinaryOp
		switch p.peek() {
		case lexer.TokStar:
			op = ast.OpMul
		case lexer.TokSlash:
			op = ast.OpDiv
		case lexer.TokPercent:
			op = ast.OpMod
		default:
			return left
		}
		p.advance()
		right := p.parseUnary()
		if right == nil {
			return nil
		}
		left = &ast.BinaryExpr{
			Span:  p.spanFromTo(left.NodeSpan(), right.NodeSpan()),
			Op:    op,
			Left:  left,
			Right: right,
		}
	}
}

func (p *parser) parseUnary() ast.Expr {
	if p.peek() == lexer.TokMinus {
		start := p.advance()
		operand := p.parseUnary()
		if operand == nil {
			return nil
		}
		return &ast.UnaryExpr{
			Span:    p.spanFromTo(start.Span, operand.NodeSpan()),
			Op:      ast.OpNeg,
			Operand: operand,
		}
	}
	return p.parsePrimary()
}

func (p *parser) parsePrimary() ast.Expr {
	switch p.peek() {
	case lexer.TokLParen:
		// Grouped expression
		p.advance()
		expr := p.parseExpr()
		if expr == nil {
			return nil
		}
		if _, ok := p.expect(lexer.TokRParen); !ok {
			return nil
		}
		return expr

	case lexer.TokLBrace:
		// Record literal
		rec := p.parseRecordExpr()
		if rec == nil {
			return nil
		}
		return rec

	case lexer.TokLBracket:
		return p.parseListExpr()

	case lexer.TokIntLit:
		tok := p.advance()
		val, _ := strconv.ParseInt(tok.Value, 10, 64)
		return &ast.IntLiteral{Span: tok.Span, Value: val}

	case lexer.TokFloatLit:
		tok := p.advance()
		val, _ := strconv.ParseFloat(tok.Value, 64)
		return &ast.FloatLiteral{Span: tok.Span, Value: val}

	case lexer.TokStringLit:
		tok := p.advance()
		return &ast.StrLiteral{Span: tok.Span, Value: tok.Value}

	case lexer.TokTrue:
		tok := p.advance()
		return &ast.BoolLiteral{Span: tok.Span, Value: true}

	case lexer.TokFalse:
		tok := p.advance()
		return &ast.BoolLiteral{Span: tok.Span, Value: false}

	case lexer.TokNull:
		tok := p.advance()
		return &ast.NullLiteral{Span: tok.Span}

	case lexer.TokIdent:
		return p.parseIdentOrFnCall()

	default:
		tok := p.current()
		p.addError(fmt.Sprintf("unexpected token '%s'", tok.Value), &tok.Span)
		return nil
	}
}

func (p *parser) parseIdentOrFnCall() ast.Expr {
	ip := p.parseIdentPath()
	if ip == nil {
		return nil
	}

	// If followed by '{', it's a function call
	if p.peek() == lexer.TokLBrace {
		args := p.parseRecordExpr()
		if args == nil {
			return nil
		}
		return &ast.FnCallExpr{
			Span: p.spanFromTo(ip.Span, args.Span),
			Name: ip,
			Args: args,
		}
	}

	return ip
}

func (p *parser) parseIdentPath() *ast.IdentPath {
	tok, ok := p.expect(lexer.TokIdent)
	if !ok {
		return nil
	}
	parts := []string{tok.Value}
	endSpan := tok.Span

	for p.peek() == lexer.TokDot {
		p.advance() // consume '.'
		next := p.current()
		if next.Type == lexer.TokIdent || isKeyword(next.Type) {
			p.advance()
			parts = append(parts, next.Value)
			endSpan = next.Span
		} else {
			p.addError(fmt.Sprintf("expected identifier after '.', got '%s'", next.Value), &next.Span)
			return nil
		}
	}

	return &ast.IdentPath{
		Span:  p.spanFromTo(tok.Span, endSpan),
		Parts: parts,
	}
}

func (p *parser) parseRecordExpr() *ast.RecordExpr {
	start, ok := p.expect(lexer.TokLBrace)
	if !ok {
		return nil
	}

	var entries []ast.RecordEntry

	for p.peek() != lexer.TokRBrace && p.peek() != lexer.TokEOF {
		if p.peek() == lexer.TokDotDotDot {
			// SpreadPair
			spreadStart := p.advance()
			expr := p.parseExpr()
			if expr == nil {
				return nil
			}
			entries = append(entries, &ast.SpreadPair{
				Span: p.spanFromTo(spreadStart.Span, expr.NodeSpan()),
				Expr: expr,
			})
		} else if isRecordKey(p.peek()) {
			// RecordPair: key: value (key can be dotted like fs.write)
			keyTok := p.advance()
			key := keyTok.Value

			// Handle dotted keys (e.g., fs.write, http.get)
			for p.peek() == lexer.TokDot {
				p.advance() // consume '.'
				next := p.current()
				if next.Type == lexer.TokIdent || isKeyword(next.Type) {
					p.advance()
					key += "." + next.Value
				} else {
					p.addError(fmt.Sprintf("expected identifier after '.' in record key, got '%s'", next.Value), &next.Span)
					return nil
				}
			}

			if _, ok := p.expect(lexer.TokColon); !ok {
				return nil
			}

			value := p.parseExpr()
			if value == nil {
				return nil
			}

			entries = append(entries, &ast.RecordPair{
				Span:  p.spanFromTo(keyTok.Span, value.NodeSpan()),
				Key:   key,
				Value: value,
			})
		} else {
			tok := p.current()
			p.addError(fmt.Sprintf("unexpected token '%s' in record", tok.Value), &tok.Span)
			return nil
		}

		if p.peek() == lexer.TokComma {
			p.advance()
		}
	}

	end, ok := p.expect(lexer.TokRBrace)
	if !ok {
		return nil
	}

	return &ast.RecordExpr{
		Span:  p.spanFromTo(start.Span, end.Span),
		Pairs: entries,
	}
}

func (p *parser) parseListExpr() *ast.ListExpr {
	start, ok := p.expect(lexer.TokLBracket)
	if !ok {
		return nil
	}

	var elements []ast.Expr

	for p.peek() != lexer.TokRBracket && p.peek() != lexer.TokEOF {
		elem := p.parseExpr()
		if elem == nil {
			return nil
		}
		elements = append(elements, elem)
		if p.peek() == lexer.TokComma {
			p.advance()
		}
	}

	end, ok := p.expect(lexer.TokRBracket)
	if !ok {
		return nil
	}

	return &ast.ListExpr{
		Span:     p.spanFromTo(start.Span, end.Span),
		Elements: elements,
	}
}

// IdentPathFromTool creates an IdentPath from a dotted tool name string.
func IdentPathFromTool(name string, span ast.Span) *ast.IdentPath {
	return &ast.IdentPath{
		Span:  span,
		Parts: strings.Split(name, "."),
	}
}
