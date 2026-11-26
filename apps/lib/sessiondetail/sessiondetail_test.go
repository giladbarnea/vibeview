package sessiondetail_test

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/driangle/vibeview/apps/lib/session"
	"github.com/driangle/vibeview/apps/lib/sessiondetail"
)

func TestBuild_ReturnsEveryMessageInFileOrder(t *testing.T) {
	claudeDir, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	const count = 500
	var lines []string
	var want []string
	for i := 0; i < count; i++ {
		uuid := fmt.Sprintf("m-%03d", i)
		role := []string{"user", "assistant"}[i%2]
		lines = append(lines, fmt.Sprintf(
			`{"type":%q,"uuid":%q,"timestamp":%d,"message":{"role":%q,"content":[{"type":"text","text":"message %d"}]}}`,
			role, uuid, 1700000000000+int64(i)*1000, role, i))
		want = append(want, uuid)
	}
	path := filepath.Join(claudeDir, "session.jsonl")
	if err := os.WriteFile(path, []byte(strings.Join(lines, "\n")+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	detail, err := sessiondetail.Build(claudeDir, session.SessionMeta{SessionID: "s1", FilePath: path})
	if err != nil {
		t.Fatal(err)
	}

	var got []string
	for _, message := range detail.Messages {
		got = append(got, message.UUID)
	}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Errorf("message UUIDs out of file order or missing: got %d messages, first 5 %v; want %d, first 5 %v",
			len(got), got[:min(5, len(got))], len(want), want[:5])
	}
}
