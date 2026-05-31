package library

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"
)

type ReconcileService struct {
	Repo *Repository
}

type ReconcileSummary struct {
	Checked       int      `json:"checked"`
	MarkedMissing int      `json:"marked_missing"`
	Restored      int      `json:"restored"`
	Errors        []string `json:"errors"`
}

func NewReconcileService(repo *Repository) *ReconcileService {
	return &ReconcileService{Repo: repo}
}

func (s *ReconcileService) Reconcile(ctx context.Context) (*ReconcileSummary, error) {
	if s == nil || s.Repo == nil {
		return nil, fmt.Errorf("library repository is not configured")
	}

	items, err := s.Repo.ListForReconciliation()
	if err != nil {
		return nil, err
	}

	summary := &ReconcileSummary{
		Errors: []string{},
	}

	for _, item := range items {
		select {
		case <-ctx.Done():
			return summary, ctx.Err()
		default:
		}

		summary.Checked++
		path := currentMediaPath(&item)
		if strings.TrimSpace(path) == "" {
			summary.Errors = append(summary.Errors, fmt.Sprintf("#%d has no current media path", item.ID))
			continue
		}

		info, statErr := os.Stat(path)
		if statErr != nil {
			if os.IsNotExist(statErr) {
				if item.MissingAt == "" {
					if err := s.Repo.MarkMissing(item.ID, time.Now().UTC().Format(time.RFC3339)); err != nil {
						summary.Errors = append(summary.Errors, fmt.Sprintf("%s: %v", path, err))
						continue
					}
					summary.MarkedMissing++
				}
				continue
			}

			summary.Errors = append(summary.Errors, fmt.Sprintf("%s: %v", path, statErr))
			continue
		}

		if info.IsDir() {
			if item.MissingAt == "" {
				if err := s.Repo.MarkMissing(item.ID, time.Now().UTC().Format(time.RFC3339)); err != nil {
					summary.Errors = append(summary.Errors, fmt.Sprintf("%s: %v", path, err))
					continue
				}
				summary.MarkedMissing++
			}
			continue
		}

		if item.MissingAt != "" {
			if err := s.Repo.ClearMissing(item.ID); err != nil {
				summary.Errors = append(summary.Errors, fmt.Sprintf("%s: %v", path, err))
				continue
			}
			summary.Restored++
		}
	}

	return summary, nil
}

func currentMediaPath(item *MediaItem) string {
	if item == nil {
		return ""
	}
	if strings.TrimSpace(item.CanonicalPath) != "" {
		return item.CanonicalPath
	}
	return item.SourcePath
}
