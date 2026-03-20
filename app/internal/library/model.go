package library

type MediaItem struct {
	ID              int64   `db:"id" json:"id"`
	Title           string  `db:"title" json:"title"`
	MediaType       string  `db:"media_type" json:"media_type"`
	SourcePath      string  `db:"source_path" json:"source_path"`
	CanonicalPath   string  `db:"canonical_path" json:"canonical_path"`
	FileName        string  `db:"file_name" json:"file_name"`
	Extension       string  `db:"extension" json:"extension"`
	DurationSeconds float64 `db:"duration_seconds" json:"duration_seconds"`
	Width           int     `db:"width" json:"width"`
	Height          int     `db:"height" json:"height"`
	VideoCodec      string  `db:"video_codec" json:"video_codec"`
	AudioCodec      string  `db:"audio_codec" json:"audio_codec"`
	FilesizeBytes   int64   `db:"filesize_bytes" json:"filesize_bytes"`
	SeasonNumber    int     `db:"season_number" json:"season_number"`
	EpisodeNumber   int     `db:"episode_number" json:"episode_number"`

	TypeSource     string `db:"type_source" json:"type_source"`
	TitleSource    string `db:"title_source" json:"title_source"`
	SequenceSource string `db:"sequence_source" json:"sequence_source"`

	CompanyID   *int64 `db:"company_id" json:"company_id"`
	CompanyName string `db:"company_name" json:"company_name"`

	SeriesID   *int64 `db:"series_id" json:"series_id"`
	SeriesName string `db:"series_name" json:"series_name"`

	IsTagged bool `db:"is_tagged" json:"is_tagged"`

	CreatedAt string `db:"created_at" json:"created_at"`
	UpdatedAt string `db:"updated_at" json:"updated_at"`
}

type UpdateEditableInput struct {
	Title         string `json:"title"`
	MediaType     string `json:"media_type"`
	SeasonNumber  int    `json:"season_number"`
	EpisodeNumber int    `json:"episode_number"`
}

type SearchTaggedParams struct {
	Query           string
	Page            int
	PageSize        int
	SortDir         string
	MediaTypes      []string
	CompanyIDs      []int64
	PersonIDs       []int64
	SeriesIDs       []int64
	MainCategoryIDs []int64
	SubCategoryIDs  []int64
	TagIDs          []int64
}