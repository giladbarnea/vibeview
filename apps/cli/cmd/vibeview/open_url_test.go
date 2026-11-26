package main

import (
	"strings"
	"testing"

	"github.com/driangle/vibeview/apps/lib/session"
)

func TestOpenURL_OneFileOpensItsSessionPage(t *testing.T) {
	one, err := session.LoadFromPaths([]string{"../../testdata/fixtures/session_with_tools.jsonl"})
	if err != nil {
		t.Fatal(err)
	}
	two, err := session.LoadFromPaths([]string{
		"../../testdata/fixtures/session_with_tools.jsonl",
		"../../testdata/fixtures/session_edge_cases.jsonl",
	})
	if err != nil {
		t.Fatal(err)
	}

	got := openURL("http://localhost:4880", one)
	want := "http://localhost:4880/session/" + one.GetSessions()[0].SessionID
	if got != want || !strings.Contains(got, "/session/") || strings.HasSuffix(got, "/session/") {
		t.Errorf("one file: got %q, want %q", got, want)
	}
	if got := openURL("http://localhost:4880", two); got != "http://localhost:4880" {
		t.Errorf("two files: got %q, want the sessions list", got)
	}
	if got := openURL("http://localhost:4880", nil); got != "http://localhost:4880" {
		t.Errorf("no files: got %q, want the sessions list", got)
	}
}
