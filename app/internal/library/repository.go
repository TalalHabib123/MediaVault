package library

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
)

type Repository struct {
	db *sqlx.DB
}

func NewRepository(db *sqlx.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Upsert(item *MediaItem) (string, error) {
	var existingID int64
	err := r.db.Get(&existingID, `SELECT id FROM media_items WHERE source_path = ? LIMIT 1`, item.SourcePath)
	existed := err == nil

	now := time.Now().UTC().Format(time.RFC3339)

	if item.CreatedAt == "" {
		item.CreatedAt = now
	}
	item.UpdatedAt = now

	if strings.TrimSpace(item.TypeSource) == "" {
		item.TypeSource = "auto"
	}
	if strings.TrimSpace(item.TitleSource) == "" {
		item.TitleSource = "auto"
	}
	if strings.TrimSpace(item.SequenceSource) == "" {
		item.SequenceSource = "auto"
	}

	query := `
	INSERT INTO media_items (
		title,
		media_type,
		source_path,
		canonical_path,
		file_name,
		extension,
		duration_seconds,
		width,
		height,
		video_codec,
		audio_codec,
		filesize_bytes,
		season_number,
		episode_number,
		type_source,
		title_source,
		sequence_source,
		created_at,
		updated_at
	) VALUES (
		:title,
		:media_type,
		:source_path,
		:canonical_path,
		:file_name,
		:extension,
		:duration_seconds,
		:width,
		:height,
		:video_codec,
		:audio_codec,
		:filesize_bytes,
		:season_number,
		:episode_number,
		:type_source,
		:title_source,
		:sequence_source,
		:created_at,
		:updated_at
	)
	ON CONFLICT(source_path) DO UPDATE SET
		title = CASE
			WHEN media_items.title_source = 'manual' THEN media_items.title
			ELSE excluded.title
		END,
		media_type = CASE
			WHEN media_items.type_source = 'manual' THEN media_items.media_type
			ELSE excluded.media_type
		END,
		canonical_path = excluded.canonical_path,
		file_name = excluded.file_name,
		extension = excluded.extension,
		duration_seconds = excluded.duration_seconds,
		width = excluded.width,
		height = excluded.height,
		video_codec = excluded.video_codec,
		audio_codec = excluded.audio_codec,
		filesize_bytes = excluded.filesize_bytes,
		season_number = CASE
			WHEN media_items.sequence_source = 'manual' THEN media_items.season_number
			ELSE excluded.season_number
		END,
		episode_number = CASE
			WHEN media_items.sequence_source = 'manual' THEN media_items.episode_number
			ELSE excluded.episode_number
		END,
		type_source = CASE
			WHEN media_items.type_source = 'manual' THEN media_items.type_source
			ELSE excluded.type_source
		END,
		title_source = CASE
			WHEN media_items.title_source = 'manual' THEN media_items.title_source
			ELSE excluded.title_source
		END,
		sequence_source = CASE
			WHEN media_items.sequence_source = 'manual' THEN media_items.sequence_source
			ELSE excluded.sequence_source
		END,
		updated_at = excluded.updated_at
	`

	_, err = r.db.NamedExec(query, item)
	if err != nil {
		return "", err
	}

	if existed {
		return "updated", nil
	}
	return "inserted", nil
}

func (r *Repository) List(q string, mediaType string, taggedStatus string, limit int, offset int) ([]MediaItem, int, error) {
	if limit <= 0 {
		limit = 100
	}
	if limit > 500 {
		limit = 500
	}
	if offset < 0 {
		offset = 0
	}

	taggedExpr := `
		CASE
			WHEN media_items.company_id IS NOT NULL
				OR media_items.series_id IS NOT NULL
				OR EXISTS (SELECT 1 FROM media_people mp WHERE mp.media_id = media_items.id)
				OR EXISTS (SELECT 1 FROM media_categories mc WHERE mc.media_id = media_items.id)
				OR EXISTS (SELECT 1 FROM media_tags mt WHERE mt.media_id = media_items.id)
			THEN 1
			ELSE 0
		END
	`

	whereParts := []string{"1 = 1"}
	args := []any{}

	if strings.TrimSpace(q) != "" {
		whereParts = append(whereParts, `(LOWER(media_items.title) LIKE ? OR LOWER(media_items.file_name) LIKE ? OR LOWER(media_items.source_path) LIKE ? OR LOWER(COALESCE(companies.name, '')) LIKE ? OR LOWER(COALESCE(series.name, '')) LIKE ?)`)
		like := "%" + strings.ToLower(strings.TrimSpace(q)) + "%"
		args = append(args, like, like, like, like, like)
	}

	if strings.TrimSpace(mediaType) != "" && mediaType != "all" {
		whereParts = append(whereParts, `media_items.media_type = ?`)
		args = append(args, mediaType)
	}

	switch strings.TrimSpace(taggedStatus) {
	case "tagged":
		whereParts = append(whereParts, taggedExpr+` = 1`)
	case "untagged":
		whereParts = append(whereParts, taggedExpr+` = 0`)
	}

	whereSQL := strings.Join(whereParts, " AND ")

	var total int
	countQuery := `
		SELECT COUNT(*)
		FROM media_items
		LEFT JOIN companies ON companies.id = media_items.company_id
		LEFT JOIN series ON series.id = media_items.series_id
		WHERE ` + whereSQL
	if err := r.db.Get(&total, countQuery, args...); err != nil {
		return []MediaItem{}, 0, err
	}

	listQuery := `
	SELECT
		media_items.id,
		media_items.title,
		media_items.media_type,
		media_items.source_path,
		media_items.canonical_path,
		media_items.file_name,
		media_items.extension,
		media_items.duration_seconds,
		media_items.width,
		media_items.height,
		media_items.video_codec,
		media_items.audio_codec,
		media_items.filesize_bytes,
		media_items.season_number,
		media_items.episode_number,
		media_items.type_source,
		media_items.title_source,
		media_items.sequence_source,
		media_items.company_id,
		COALESCE(companies.name, '') AS company_name,
		media_items.series_id,
		COALESCE(series.name, '') AS series_name,
		` + taggedExpr + ` AS is_tagged,
		media_items.created_at,
		media_items.updated_at
	FROM media_items
	LEFT JOIN companies ON companies.id = media_items.company_id
	LEFT JOIN series ON series.id = media_items.series_id
	WHERE ` + whereSQL + `
	ORDER BY media_items.updated_at DESC, media_items.id DESC
	LIMIT ? OFFSET ?
	`

	listArgs := append(args, limit, offset)

	items := []MediaItem{}
	if err := r.db.Select(&items, listQuery, listArgs...); err != nil {
		return []MediaItem{}, 0, err
	}

	return items, total, nil
}

func (r *Repository) GetByID(id int64) (*MediaItem, error) {
	taggedExpr := `
		CASE
			WHEN media_items.company_id IS NOT NULL
				OR media_items.series_id IS NOT NULL
				OR EXISTS (SELECT 1 FROM media_people mp WHERE mp.media_id = media_items.id)
				OR EXISTS (SELECT 1 FROM media_categories mc WHERE mc.media_id = media_items.id)
				OR EXISTS (SELECT 1 FROM media_tags mt WHERE mt.media_id = media_items.id)
			THEN 1
			ELSE 0
		END
	`

	query := `
	SELECT
		media_items.id,
		media_items.title,
		media_items.media_type,
		media_items.source_path,
		media_items.canonical_path,
		media_items.file_name,
		media_items.extension,
		media_items.duration_seconds,
		media_items.width,
		media_items.height,
		media_items.video_codec,
		media_items.audio_codec,
		media_items.filesize_bytes,
		media_items.season_number,
		media_items.episode_number,
		media_items.type_source,
		media_items.title_source,
		media_items.sequence_source,
		media_items.company_id,
		COALESCE(companies.name, '') AS company_name,
		media_items.series_id,
		COALESCE(series.name, '') AS series_name,
		` + taggedExpr + ` AS is_tagged,
		media_items.created_at,
		media_items.updated_at
	FROM media_items
	LEFT JOIN companies ON companies.id = media_items.company_id
	LEFT JOIN series ON series.id = media_items.series_id
	WHERE media_items.id = ?
	LIMIT 1
	`

	var item MediaItem
	err := r.db.Get(&item, query, id)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("media item not found")
		}
		return nil, err
	}

	return &item, nil
}

func (r *Repository) UpdateEditable(id int64, input UpdateEditableInput) error {
	title := strings.TrimSpace(input.Title)
	if title == "" {
		return fmt.Errorf("title is required")
	}

	mediaType := normalizeMediaType(input.MediaType)
	season := input.SeasonNumber
	episode := input.EpisodeNumber

	if mediaType != "series_episode" {
		season = 0
		episode = 0
	}

	now := time.Now().UTC().Format(time.RFC3339)

	query := `
	UPDATE media_items
	SET
		title = ?,
		media_type = ?,
		season_number = ?,
		episode_number = ?,
		title_source = 'manual',
		type_source = 'manual',
		sequence_source = 'manual',
		updated_at = ?
	WHERE id = ?
	`

	result, err := r.db.Exec(query, title, mediaType, season, episode, now, id)
	if err != nil {
		return err
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return fmt.Errorf("media item not found")
	}

	return nil
}

func (r *Repository) UpdateManagedPath(id int64, path string, fileName string) error {
	now := time.Now().UTC().Format(time.RFC3339)

	result, err := r.db.Exec(`
		UPDATE media_items
		SET
			source_path = ?,
			canonical_path = ?,
			file_name = ?,
			updated_at = ?
		WHERE id = ?
	`, path, path, fileName, now, id)
	if err != nil {
		return err
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return fmt.Errorf("media item not found")
	}

	return nil
}

func (r *Repository) GetEpisodeNavigation(id int64) (*int64, *int64, error) {
	item, err := r.GetByID(id)
	if err != nil {
		return nil, nil, err
	}

	if item.MediaType != "series_episode" || item.SeriesID == nil {
		return nil, nil, nil
	}

	prevID, err := r.findAdjacentEpisode(*item.SeriesID, item.SeasonNumber, item.EpisodeNumber, item.ID, true)
	if err != nil {
		return nil, nil, err
	}

	nextID, err := r.findAdjacentEpisode(*item.SeriesID, item.SeasonNumber, item.EpisodeNumber, item.ID, false)
	if err != nil {
		return nil, nil, err
	}

	return prevID, nextID, nil
}

func (r *Repository) findAdjacentEpisode(seriesID int64, seasonNumber int, episodeNumber int, currentID int64, previous bool) (*int64, error) {
	type row struct {
		ID int64 `db:"id"`
	}

	var result row
	var err error

	if previous {
		err = r.db.Get(&result, `
			SELECT id
			FROM media_items
			WHERE series_id = ?
			  AND media_type = 'series_episode'
			  AND (
				season_number < ?
				OR (season_number = ? AND episode_number < ?)
				OR (season_number = ? AND episode_number = ? AND id < ?)
			  )
			ORDER BY season_number DESC, episode_number DESC, id DESC
			LIMIT 1
		`, seriesID, seasonNumber, seasonNumber, episodeNumber, seasonNumber, episodeNumber, currentID)
	} else {
		err = r.db.Get(&result, `
			SELECT id
			FROM media_items
			WHERE series_id = ?
			  AND media_type = 'series_episode'
			  AND (
				season_number > ?
				OR (season_number = ? AND episode_number > ?)
				OR (season_number = ? AND episode_number = ? AND id > ?)
			  )
			ORDER BY season_number ASC, episode_number ASC, id ASC
			LIMIT 1
		`, seriesID, seasonNumber, seasonNumber, episodeNumber, seasonNumber, episodeNumber, currentID)
	}

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return &result.ID, nil
}

func normalizeMediaType(value string) string {
	switch strings.TrimSpace(value) {
	case "series_episode":
		return "series_episode"
	case "movie":
		return "movie"
	default:
		return "video"
	}
}

func (r *Repository) SearchTagged(params SearchTaggedParams) ([]MediaItem, int, error) {
	page := params.Page
	if page <= 0 {
		page = 1
	}

	pageSize := params.PageSize
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}

	offset := (page - 1) * pageSize

	sortDir := "DESC"
	if strings.EqualFold(strings.TrimSpace(params.SortDir), "asc") {
		sortDir = "ASC"
	}

	taggedExpr := `
		CASE
			WHEN media_items.company_id IS NOT NULL
				OR media_items.series_id IS NOT NULL
				OR EXISTS (SELECT 1 FROM media_people mp WHERE mp.media_id = media_items.id)
				OR EXISTS (SELECT 1 FROM media_categories mc WHERE mc.media_id = media_items.id)
				OR EXISTS (SELECT 1 FROM media_tags mt WHERE mt.media_id = media_items.id)
			THEN 1
			ELSE 0
		END
	`

	joins := `
		FROM media_items
		LEFT JOIN companies ON companies.id = media_items.company_id
		LEFT JOIN series ON series.id = media_items.series_id
	`

	whereParts := []string{taggedExpr + ` = 1`}
	args := []any{}

	if q := strings.TrimSpace(params.Query); q != "" {
		like := "%" + strings.ToLower(q) + "%"
		whereParts = append(whereParts, `
			(
				LOWER(media_items.title) LIKE ?
				OR LOWER(media_items.file_name) LIKE ?
				OR LOWER(media_items.source_path) LIKE ?
				OR LOWER(COALESCE(companies.name, '')) LIKE ?
				OR LOWER(COALESCE(series.name, '')) LIKE ?
			)
		`)
		args = append(args, like, like, like, like, like)
	}

	if len(params.MediaTypes) > 0 {
		placeholders := buildPlaceholders(len(params.MediaTypes))
		whereParts = append(whereParts, `media_items.media_type IN (`+placeholders+`)`)
		for _, value := range params.MediaTypes {
			args = append(args, value)
		}
	}

	if len(params.CompanyIDs) > 0 {
		placeholders := buildPlaceholders(len(params.CompanyIDs))
		whereParts = append(whereParts, `media_items.company_id IN (`+placeholders+`)`)
		for _, value := range params.CompanyIDs {
			args = append(args, value)
		}
	}

	if len(params.SeriesIDs) > 0 {
		placeholders := buildPlaceholders(len(params.SeriesIDs))
		whereParts = append(whereParts, `media_items.series_id IN (`+placeholders+`)`)
		for _, value := range params.SeriesIDs {
			args = append(args, value)
		}
	}

	if len(params.PersonIDs) > 0 {
		placeholders := buildPlaceholders(len(params.PersonIDs))
		whereParts = append(whereParts, `
			EXISTS (
				SELECT 1
				FROM media_people mp
				WHERE mp.media_id = media_items.id
				  AND mp.person_id IN (`+placeholders+`)
			)
		`)
		for _, value := range params.PersonIDs {
			args = append(args, value)
		}
	}

	if len(params.TagIDs) > 0 {
		placeholders := buildPlaceholders(len(params.TagIDs))
		whereParts = append(whereParts, `
			EXISTS (
				SELECT 1
				FROM media_tags mt
				WHERE mt.media_id = media_items.id
				  AND mt.tag_id IN (`+placeholders+`)
			)
		`)
		for _, value := range params.TagIDs {
			args = append(args, value)
		}
	}

	if len(params.MainCategoryIDs) > 0 {
		mainPH := buildPlaceholders(len(params.MainCategoryIDs))
		whereParts = append(whereParts, `
			EXISTS (
				SELECT 1
				FROM media_categories mc
				JOIN categories c ON c.id = mc.category_id
				WHERE mc.media_id = media_items.id
				  AND (c.id IN (`+mainPH+`) OR c.parent_id IN (`+mainPH+`))
			)
		`)
		for _, value := range params.MainCategoryIDs {
			args = append(args, value)
		}
		for _, value := range params.MainCategoryIDs {
			args = append(args, value)
		}
	}

	if len(params.SubCategoryIDs) > 0 {
		subPH := buildPlaceholders(len(params.SubCategoryIDs))
		whereParts = append(whereParts, `
			EXISTS (
				SELECT 1
				FROM media_categories mc
				JOIN categories c ON c.id = mc.category_id
				WHERE mc.media_id = media_items.id
				  AND c.id IN (`+subPH+`)
			)
		`)
		for _, value := range params.SubCategoryIDs {
			args = append(args, value)
		}
	}

	whereSQL := strings.Join(whereParts, " AND ")

	countQuery := `SELECT COUNT(*) ` + joins + ` WHERE ` + whereSQL
	var total int
	if err := r.db.Get(&total, countQuery, args...); err != nil {
		return []MediaItem{}, 0, err
	}

	listQuery := `
		SELECT
			media_items.id,
			media_items.title,
			media_items.media_type,
			media_items.source_path,
			media_items.canonical_path,
			media_items.file_name,
			media_items.extension,
			media_items.duration_seconds,
			media_items.width,
			media_items.height,
			media_items.video_codec,
			media_items.audio_codec,
			media_items.filesize_bytes,
			media_items.season_number,
			media_items.episode_number,
			media_items.type_source,
			media_items.title_source,
			media_items.sequence_source,
			media_items.company_id,
			COALESCE(companies.name, '') AS company_name,
			media_items.series_id,
			COALESCE(series.name, '') AS series_name,
			` + taggedExpr + ` AS is_tagged,
			media_items.created_at,
			media_items.updated_at
	` + joins + `
		WHERE ` + whereSQL + `
		ORDER BY media_items.updated_at ` + sortDir + `, media_items.id ` + sortDir + `
		LIMIT ? OFFSET ?
	`

	listArgs := append(args, pageSize, offset)

	items := []MediaItem{}
	if err := r.db.Select(&items, listQuery, listArgs...); err != nil {
		return []MediaItem{}, 0, err
	}

	return items, total, nil
}

func buildPlaceholders(count int) string {
	if count <= 0 {
		return ""
	}

	parts := make([]string, count)
	for i := 0; i < count; i++ {
		parts[i] = "?"
	}
	return strings.Join(parts, ", ")
}