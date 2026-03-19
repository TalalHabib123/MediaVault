package appfs

import "os"

func FirstExisting(candidates ...string) string {
	for _, path := range candidates {
		if _, err := os.Stat(path); err == nil {
			return path
		}
	}
	if len(candidates) == 0 {
		return ""
	}
	return candidates[0]
}
