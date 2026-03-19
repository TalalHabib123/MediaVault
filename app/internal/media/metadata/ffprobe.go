package metadata

import (
	"context"
	"encoding/json"
	"os/exec"
	"strconv"
	"time"
)

type ProbeResult struct {
	Title           string
	DurationSeconds float64
	Width           int
	Height          int
	VideoCodec      string
	AudioCodec      string
	FilesizeBytes   int64
}

type ffprobeOutput struct {
	Streams []struct {
		CodecType string `json:"codec_type"`
		CodecName string `json:"codec_name"`
		Width     int    `json:"width"`
		Height    int    `json:"height"`
	} `json:"streams"`
	Format struct {
		Duration string            `json:"duration"`
		Size     string            `json:"size"`
		Tags     map[string]string `json:"tags"`
	} `json:"format"`
}

func Probe(ffprobePath string, sourcePath string) (*ProbeResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	cmd := exec.CommandContext(
		ctx,
		ffprobePath,
		"-v", "error",
		"-print_format", "json",
		"-show_format",
		"-show_streams",
		sourcePath,
	)

	out, err := cmd.Output()
	if err != nil {
		return nil, err
	}

	var parsed ffprobeOutput
	if err := json.Unmarshal(out, &parsed); err != nil {
		return nil, err
	}

	result := &ProbeResult{}

	if parsed.Format.Duration != "" {
		if v, err := strconv.ParseFloat(parsed.Format.Duration, 64); err == nil {
			result.DurationSeconds = v
		}
	}

	if parsed.Format.Size != "" {
		if v, err := strconv.ParseInt(parsed.Format.Size, 10, 64); err == nil {
			result.FilesizeBytes = v
		}
	}

	if parsed.Format.Tags != nil {
		if title := parsed.Format.Tags["title"]; title != "" {
			result.Title = title
		}
	}

	for _, stream := range parsed.Streams {
		switch stream.CodecType {
		case "video":
			if result.VideoCodec == "" {
				result.VideoCodec = stream.CodecName
			}
			if result.Width == 0 {
				result.Width = stream.Width
			}
			if result.Height == 0 {
				result.Height = stream.Height
			}
		case "audio":
			if result.AudioCodec == "" {
				result.AudioCodec = stream.CodecName
			}
		}
	}

	return result, nil
}