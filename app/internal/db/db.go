package db

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/jmoiron/sqlx"
	_ "modernc.org/sqlite"
)

type pragmaColumn struct {
	CID       int    `db:"cid"`
	Name      string `db:"name"`
	Type      string `db:"type"`
	NotNull   int    `db:"notnull"`
	DfltValue any    `db:"dflt_value"`
	PK        int    `db:"pk"`
}

func Open(rootDir string) (*sqlx.DB, error) {
	dataDir := filepath.Join(rootDir, "data")
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, err
	}

	dbPath := filepath.Join(rootDir, "data", "app.db")
	dsn := fmt.Sprintf(
		"file:%s?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)",
		filepath.ToSlash(dbPath),
	)

	db, err := sqlx.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}

	if err := db.Ping(); err != nil {
		return nil, err
	}

	if err := ensureSchema(db); err != nil {
		return nil, err
	}

	return db, nil
}

func ensureSchema(db *sqlx.DB) error {
	if err := createMediaItemsTable(db); err != nil {
		return err
	}
	if err := createMetadataTables(db); err != nil {
		return err
	}
	if err := migrateMediaItemsTable(db); err != nil {
		return err
	}
	if err := ensureIndexes(db); err != nil {
		return err
	}
	return nil
}

func createMediaItemsTable(db *sqlx.DB) error {
	schema := `
	CREATE TABLE IF NOT EXISTS media_items (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		title TEXT NOT NULL,
		media_type TEXT NOT NULL DEFAULT 'video',
		source_path TEXT NOT NULL UNIQUE,
		canonical_path TEXT NOT NULL DEFAULT '',
		file_name TEXT NOT NULL DEFAULT '',
		extension TEXT NOT NULL DEFAULT '',
		duration_seconds REAL NOT NULL DEFAULT 0,
		width INTEGER NOT NULL DEFAULT 0,
		height INTEGER NOT NULL DEFAULT 0,
		video_codec TEXT NOT NULL DEFAULT '',
		audio_codec TEXT NOT NULL DEFAULT '',
		filesize_bytes INTEGER NOT NULL DEFAULT 0,
		season_number INTEGER NOT NULL DEFAULT 0,
		episode_number INTEGER NOT NULL DEFAULT 0,
		type_source TEXT NOT NULL DEFAULT 'auto',
		title_source TEXT NOT NULL DEFAULT 'auto',
		sequence_source TEXT NOT NULL DEFAULT 'auto',
		company_id INTEGER NULL,
		series_id INTEGER NULL,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);
	`
	_, err := db.Exec(schema)
	return err
}

func createMetadataTables(db *sqlx.DB) error {
	queries := []string{
		`
		CREATE TABLE IF NOT EXISTS companies (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);
		`,
		`
		CREATE TABLE IF NOT EXISTS people (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);
		`,
		`
		CREATE TABLE IF NOT EXISTS categories (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			kind TEXT NOT NULL,
			parent_id INTEGER NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			FOREIGN KEY(parent_id) REFERENCES categories(id) ON DELETE SET NULL
		);
		`,
		`
		CREATE TABLE IF NOT EXISTS tags (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);
		`,
		`
		CREATE TABLE IF NOT EXISTS series (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			company_id INTEGER NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE SET NULL
		);
		`,
		`
		CREATE TABLE IF NOT EXISTS media_people (
			media_id INTEGER NOT NULL,
			person_id INTEGER NOT NULL,
			PRIMARY KEY(media_id, person_id),
			FOREIGN KEY(media_id) REFERENCES media_items(id) ON DELETE CASCADE,
			FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
		);
		`,
		`
		CREATE TABLE IF NOT EXISTS media_categories (
			media_id INTEGER NOT NULL,
			category_id INTEGER NOT NULL,
			PRIMARY KEY(media_id, category_id),
			FOREIGN KEY(media_id) REFERENCES media_items(id) ON DELETE CASCADE,
			FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE CASCADE
		);
		`,
		`
		CREATE TABLE IF NOT EXISTS media_tags (
			media_id INTEGER NOT NULL,
			tag_id INTEGER NOT NULL,
			PRIMARY KEY(media_id, tag_id),
			FOREIGN KEY(media_id) REFERENCES media_items(id) ON DELETE CASCADE,
			FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
		);
		`,
	}

	for _, query := range queries {
		if _, err := db.Exec(query); err != nil {
			return err
		}
	}

	return nil
}

func migrateMediaItemsTable(db *sqlx.DB) error {
	existingColumns, err := getTableColumns(db, "media_items")
	if err != nil {
		return err
	}

	requiredColumns := []struct {
		Name string
		SQL  string
	}{
		{"media_type", `ALTER TABLE media_items ADD COLUMN media_type TEXT NOT NULL DEFAULT 'video'`},
		{"canonical_path", `ALTER TABLE media_items ADD COLUMN canonical_path TEXT NOT NULL DEFAULT ''`},
		{"file_name", `ALTER TABLE media_items ADD COLUMN file_name TEXT NOT NULL DEFAULT ''`},
		{"extension", `ALTER TABLE media_items ADD COLUMN extension TEXT NOT NULL DEFAULT ''`},
		{"duration_seconds", `ALTER TABLE media_items ADD COLUMN duration_seconds REAL NOT NULL DEFAULT 0`},
		{"width", `ALTER TABLE media_items ADD COLUMN width INTEGER NOT NULL DEFAULT 0`},
		{"height", `ALTER TABLE media_items ADD COLUMN height INTEGER NOT NULL DEFAULT 0`},
		{"video_codec", `ALTER TABLE media_items ADD COLUMN video_codec TEXT NOT NULL DEFAULT ''`},
		{"audio_codec", `ALTER TABLE media_items ADD COLUMN audio_codec TEXT NOT NULL DEFAULT ''`},
		{"filesize_bytes", `ALTER TABLE media_items ADD COLUMN filesize_bytes INTEGER NOT NULL DEFAULT 0`},
		{"season_number", `ALTER TABLE media_items ADD COLUMN season_number INTEGER NOT NULL DEFAULT 0`},
		{"episode_number", `ALTER TABLE media_items ADD COLUMN episode_number INTEGER NOT NULL DEFAULT 0`},
		{"type_source", `ALTER TABLE media_items ADD COLUMN type_source TEXT NOT NULL DEFAULT 'auto'`},
		{"title_source", `ALTER TABLE media_items ADD COLUMN title_source TEXT NOT NULL DEFAULT 'auto'`},
		{"sequence_source", `ALTER TABLE media_items ADD COLUMN sequence_source TEXT NOT NULL DEFAULT 'auto'`},
		{"company_id", `ALTER TABLE media_items ADD COLUMN company_id INTEGER NULL`},
		{"series_id", `ALTER TABLE media_items ADD COLUMN series_id INTEGER NULL`},
		{"created_at", `ALTER TABLE media_items ADD COLUMN created_at TEXT NOT NULL DEFAULT ''`},
		{"updated_at", `ALTER TABLE media_items ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`},
	}

	for _, column := range requiredColumns {
		if !existingColumns[column.Name] {
			if _, err := db.Exec(column.SQL); err != nil {
				return fmt.Errorf("failed adding column %s: %w", column.Name, err)
			}
		}
	}

	_, err = db.Exec(`
		UPDATE media_items
		SET
			media_type = CASE WHEN media_type IS NULL OR media_type = '' THEN 'video' ELSE media_type END,
			canonical_path = COALESCE(canonical_path, ''),
			file_name = COALESCE(file_name, ''),
			extension = COALESCE(extension, ''),
			duration_seconds = COALESCE(duration_seconds, 0),
			width = COALESCE(width, 0),
			height = COALESCE(height, 0),
			video_codec = COALESCE(video_codec, ''),
			audio_codec = COALESCE(audio_codec, ''),
			filesize_bytes = COALESCE(filesize_bytes, 0),
			season_number = COALESCE(season_number, 0),
			episode_number = COALESCE(episode_number, 0),
			type_source = CASE WHEN type_source IS NULL OR type_source = '' THEN 'auto' ELSE type_source END,
			title_source = CASE WHEN title_source IS NULL OR title_source = '' THEN 'auto' ELSE title_source END,
			sequence_source = CASE WHEN sequence_source IS NULL OR sequence_source = '' THEN 'auto' ELSE sequence_source END,
			created_at = CASE WHEN created_at IS NULL OR created_at = '' THEN updated_at ELSE created_at END,
			updated_at = COALESCE(updated_at, '')
	`)
	return err
}

func ensureIndexes(db *sqlx.DB) error {
	indexes := []string{
		`CREATE INDEX IF NOT EXISTS idx_media_items_media_type ON media_items(media_type)`,
		`CREATE INDEX IF NOT EXISTS idx_media_items_title ON media_items(title)`,
		`CREATE INDEX IF NOT EXISTS idx_media_items_updated_at ON media_items(updated_at)`,
		`CREATE INDEX IF NOT EXISTS idx_media_items_company_id ON media_items(company_id)`,
		`CREATE INDEX IF NOT EXISTS idx_media_items_series_id ON media_items(series_id)`,

		`CREATE INDEX IF NOT EXISTS idx_categories_kind ON categories(kind)`,
		`CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id)`,
		`CREATE INDEX IF NOT EXISTS idx_series_company_id ON series(company_id)`,

		`CREATE INDEX IF NOT EXISTS idx_media_people_media_id ON media_people(media_id)`,
		`CREATE INDEX IF NOT EXISTS idx_media_categories_media_id ON media_categories(media_id)`,
		`CREATE INDEX IF NOT EXISTS idx_media_tags_media_id ON media_tags(media_id)`,
	}

	for _, query := range indexes {
		if _, err := db.Exec(query); err != nil {
			return err
		}
	}

	return nil
}

func getTableColumns(db *sqlx.DB, tableName string) (map[string]bool, error) {
	var cols []pragmaColumn
	if err := db.Select(&cols, fmt.Sprintf("PRAGMA table_info(%s)", tableName)); err != nil {
		return nil, err
	}

	out := make(map[string]bool, len(cols))
	for _, col := range cols {
		out[col.Name] = true
	}
	return out, nil
}