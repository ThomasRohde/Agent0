package help

import (
	"strings"
	"testing"
)

func TestQUICKREFNonEmpty(t *testing.T) {
	if len(QUICKREF) == 0 {
		t.Fatal("QUICKREF is empty")
	}
}

func TestQUICKREFContainsVersion(t *testing.T) {
	if !strings.Contains(QUICKREF, "v0.5") {
		t.Error("QUICKREF does not contain version string v0.5")
	}
}

func TestQUICKREFListsTopics(t *testing.T) {
	for _, topic := range TopicList {
		if !strings.Contains(QUICKREF, topic) {
			t.Errorf("QUICKREF does not mention topic %q", topic)
		}
	}
}

func TestTopicListMatchesTopics(t *testing.T) {
	for _, name := range TopicList {
		if _, ok := Topics[name]; !ok {
			t.Errorf("TopicList entry %q not in Topics map", name)
		}
	}
}

func TestAllExpectedTopics(t *testing.T) {
	expected := []string{"syntax", "types", "tools", "stdlib", "caps", "budget", "flow", "diagnostics", "examples"}
	for _, e := range expected {
		if _, ok := Topics[e]; !ok {
			t.Errorf("missing expected topic %q", e)
		}
	}
	if len(Topics) != len(expected) {
		t.Errorf("expected %d topics, got %d", len(expected), len(Topics))
	}
}

func TestTopicsNonEmpty(t *testing.T) {
	for name, content := range Topics {
		if len(content) == 0 {
			t.Errorf("topic %q has empty content", name)
		}
	}
}

func TestMatchTopicExact(t *testing.T) {
	name, content, err := MatchTopic("syntax")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if name != "syntax" {
		t.Errorf("expected name 'syntax', got %q", name)
	}
	if content == "" {
		t.Error("expected non-empty content")
	}
}

func TestMatchTopicPrefix(t *testing.T) {
	name, _, err := MatchTopic("diag")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if name != "diagnostics" {
		t.Errorf("expected 'diagnostics', got %q", name)
	}
}

func TestMatchTopicPrefixExamples(t *testing.T) {
	name, _, err := MatchTopic("ex")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if name != "examples" {
		t.Errorf("expected 'examples', got %q", name)
	}
}

func TestMatchTopicUnknown(t *testing.T) {
	_, _, err := MatchTopic("nonexistent")
	if err == nil {
		t.Error("expected error for unknown topic")
	}
}

func TestMatchTopicPrototypePollution(t *testing.T) {
	_, _, err := MatchTopic("constructor")
	if err == nil {
		t.Error("expected error for constructor")
	}
	_, _, err = MatchTopic("__proto__")
	if err == nil {
		t.Error("expected error for __proto__")
	}
}

func TestStdlibIndex(t *testing.T) {
	idx := StdlibIndex()
	if !strings.Contains(idx, "Total:") {
		t.Error("StdlibIndex missing Total: line")
	}
	if !strings.Contains(idx, "parse.json") {
		t.Error("StdlibIndex missing parse.json")
	}
	if !strings.Contains(idx, "merge") {
		t.Error("StdlibIndex missing merge")
	}
}

func TestStdlibIndexCount(t *testing.T) {
	idx := StdlibIndex()
	if !strings.Contains(idx, "Total: 36 functions") {
		t.Errorf("StdlibIndex should report 36 functions, got:\n%s", idx)
	}
}

func TestMatchTopicAllExact(t *testing.T) {
	for _, topic := range TopicList {
		name, content, err := MatchTopic(topic)
		if err != nil {
			t.Errorf("MatchTopic(%q) error: %v", topic, err)
			continue
		}
		if name != topic {
			t.Errorf("MatchTopic(%q) returned name %q", topic, name)
		}
		if content == "" {
			t.Errorf("MatchTopic(%q) returned empty content", topic)
		}
	}
}
