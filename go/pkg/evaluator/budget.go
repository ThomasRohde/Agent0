package evaluator

// Budget holds the resource limits for a program execution.
type Budget struct {
	TimeMs          *int64
	MaxToolCalls    *int64
	MaxBytesWritten *int64
	MaxIterations   *int64
}

// BudgetTracker tracks resource consumption during execution.
type BudgetTracker struct {
	ToolCalls    int64
	BytesWritten int64
	Iterations   int64
	StartMs      int64
}
