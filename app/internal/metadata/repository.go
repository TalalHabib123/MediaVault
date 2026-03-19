package metadata

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

func (r *Repository) GetOptions() (*Options, error) {
	companies, err := r.ListCompanies()
	if err != nil {
		return nil, err
	}

	people, err := r.ListPeople()
	if err != nil {
		return nil, err
	}

	categories, err := r.ListCategories()
	if err != nil {
		return nil, err
	}

	tags, err := r.ListTags()
	if err != nil {
		return nil, err
	}

	series, err := r.ListSeries()
	if err != nil {
		return nil, err
	}

	return &Options{
		Companies:  companies,
		People:     people,
		Categories: categories,
		Tags:       tags,
		Series:     series,
	}, nil
}

func (r *Repository) ListCompanies() ([]Company, error) {
	items := []Company{}
	err := r.db.Select(&items, `
		SELECT id, name, created_at, updated_at
		FROM companies
		ORDER BY LOWER(name) ASC
	`)
	return items, err
}

func (r *Repository) ListPeople() ([]Person, error) {
	items := []Person{}
	err := r.db.Select(&items, `
		SELECT id, name, created_at, updated_at
		FROM people
		ORDER BY LOWER(name) ASC
	`)
	return items, err
}

func (r *Repository) ListCategories() ([]Category, error) {
	items := []Category{}
	err := r.db.Select(&items, `
		SELECT
			c.id,
			c.name,
			c.kind,
			c.parent_id,
			COALESCE(p.name, '') AS parent_name,
			c.created_at,
			c.updated_at
		FROM categories c
		LEFT JOIN categories p ON p.id = c.parent_id
		ORDER BY c.kind ASC, LOWER(c.name) ASC
	`)
	return items, err
}

func (r *Repository) ListTags() ([]Tag, error) {
	items := []Tag{}
	err := r.db.Select(&items, `
		SELECT id, name, created_at, updated_at
		FROM tags
		ORDER BY LOWER(name) ASC
	`)
	return items, err
}

func (r *Repository) ListSeries() ([]Series, error) {
	items := []Series{}
	err := r.db.Select(&items, `
		SELECT
			s.id,
			s.name,
			s.company_id,
			COALESCE(c.name, '') AS company_name,
			s.created_at,
			s.updated_at
		FROM series s
		LEFT JOIN companies c ON c.id = s.company_id
		ORDER BY LOWER(s.name) ASC
	`)
	return items, err
}

func (r *Repository) CreateCompany(input CreateCompanyInput) (*Company, error) {
	name := normalizeName(input.Name)
	if name == "" {
		return nil, fmt.Errorf("company name is required")
	}

	var existing Company
	err := r.db.Get(&existing, `
		SELECT id, name, created_at, updated_at
		FROM companies
		WHERE LOWER(name) = LOWER(?)
		LIMIT 1
	`, name)
	if err == nil {
		return &existing, nil
	}
	if err != sql.ErrNoRows {
		return nil, err
	}

	now := time.Now().UTC().Format(time.RFC3339)
	result, err := r.db.Exec(`
		INSERT INTO companies (name, created_at, updated_at)
		VALUES (?, ?, ?)
	`, name, now, now)
	if err != nil {
		return nil, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}

	return &Company{
		ID:        id,
		Name:      name,
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

func (r *Repository) CreatePerson(input CreatePersonInput) (*Person, error) {
	name := normalizeName(input.Name)
	if name == "" {
		return nil, fmt.Errorf("person name is required")
	}

	var existing Person
	err := r.db.Get(&existing, `
		SELECT id, name, created_at, updated_at
		FROM people
		WHERE LOWER(name) = LOWER(?)
		LIMIT 1
	`, name)
	if err == nil {
		return &existing, nil
	}
	if err != sql.ErrNoRows {
		return nil, err
	}

	now := time.Now().UTC().Format(time.RFC3339)
	result, err := r.db.Exec(`
		INSERT INTO people (name, created_at, updated_at)
		VALUES (?, ?, ?)
	`, name, now, now)
	if err != nil {
		return nil, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}

	return &Person{
		ID:        id,
		Name:      name,
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

func (r *Repository) CreateTag(input CreateTagInput) (*Tag, error) {
	name := normalizeName(input.Name)
	if name == "" {
		return nil, fmt.Errorf("tag name is required")
	}

	var existing Tag
	err := r.db.Get(&existing, `
		SELECT id, name, created_at, updated_at
		FROM tags
		WHERE LOWER(name) = LOWER(?)
		LIMIT 1
	`, name)
	if err == nil {
		return &existing, nil
	}
	if err != sql.ErrNoRows {
		return nil, err
	}

	now := time.Now().UTC().Format(time.RFC3339)
	result, err := r.db.Exec(`
		INSERT INTO tags (name, created_at, updated_at)
		VALUES (?, ?, ?)
	`, name, now, now)
	if err != nil {
		return nil, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}

	return &Tag{
		ID:        id,
		Name:      name,
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

func (r *Repository) CreateCategory(input CreateCategoryInput) (*Category, error) {
	name := normalizeName(input.Name)
	kind := strings.TrimSpace(strings.ToLower(input.Kind))

	if name == "" {
		return nil, fmt.Errorf("category name is required")
	}
	if kind != "main" && kind != "sub" {
		return nil, fmt.Errorf("category kind must be main or sub")
	}
	if kind == "main" {
		input.ParentID = nil
	}
	if kind == "sub" && input.ParentID == nil {
		return nil, fmt.Errorf("sub category requires a parent main category")
	}

	var existing Category
	err := r.db.Get(&existing, `
		SELECT
			c.id,
			c.name,
			c.kind,
			c.parent_id,
			COALESCE(p.name, '') AS parent_name,
			c.created_at,
			c.updated_at
		FROM categories c
		LEFT JOIN categories p ON p.id = c.parent_id
		WHERE LOWER(c.name) = LOWER(?)
		  AND c.kind = ?
		  AND (
			(c.parent_id IS NULL AND ? IS NULL)
			OR c.parent_id = ?
		  )
		LIMIT 1
	`, name, kind, input.ParentID, input.ParentID)
	if err == nil {
		return &existing, nil
	}
	if err != sql.ErrNoRows {
		return nil, err
	}

	now := time.Now().UTC().Format(time.RFC3339)
	result, err := r.db.Exec(`
		INSERT INTO categories (name, kind, parent_id, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?)
	`, name, kind, input.ParentID, now, now)
	if err != nil {
		return nil, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}

	parentName := ""
	if input.ParentID != nil {
		_ = r.db.Get(&parentName, `SELECT name FROM categories WHERE id = ? LIMIT 1`, *input.ParentID)
	}

	return &Category{
		ID:         id,
		Name:       name,
		Kind:       kind,
		ParentID:   input.ParentID,
		ParentName: parentName,
		CreatedAt:  now,
		UpdatedAt:  now,
	}, nil
}

func (r *Repository) CreateSeries(input CreateSeriesInput) (*Series, error) {
	name := normalizeName(input.Name)
	if name == "" {
		return nil, fmt.Errorf("series name is required")
	}

	var existing Series
	err := r.db.Get(&existing, `
		SELECT
			s.id,
			s.name,
			s.company_id,
			COALESCE(c.name, '') AS company_name,
			s.created_at,
			s.updated_at
		FROM series s
		LEFT JOIN companies c ON c.id = s.company_id
		WHERE LOWER(s.name) = LOWER(?)
		  AND (
			(s.company_id IS NULL AND ? IS NULL)
			OR s.company_id = ?
		  )
		LIMIT 1
	`, name, input.CompanyID, input.CompanyID)
	if err == nil {
		return &existing, nil
	}
	if err != sql.ErrNoRows {
		return nil, err
	}

	now := time.Now().UTC().Format(time.RFC3339)
	result, err := r.db.Exec(`
		INSERT INTO series (name, company_id, created_at, updated_at)
		VALUES (?, ?, ?, ?)
	`, name, input.CompanyID, now, now)
	if err != nil {
		return nil, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}

	companyName := ""
	if input.CompanyID != nil {
		_ = r.db.Get(&companyName, `SELECT name FROM companies WHERE id = ? LIMIT 1`, *input.CompanyID)
	}

	return &Series{
		ID:          id,
		Name:        name,
		CompanyID:   input.CompanyID,
		CompanyName: companyName,
		CreatedAt:   now,
		UpdatedAt:   now,
	}, nil
}

func (r *Repository) GetAssignments(mediaID int64) (*MediaAssignments, error) {
	assignments := &MediaAssignments{
		PersonIDs:   []int64{},
		CategoryIDs: []int64{},
		TagIDs:      []int64{},
	}

	type row struct {
		CompanyID sql.NullInt64 `db:"company_id"`
		SeriesID  sql.NullInt64 `db:"series_id"`
	}

	var ids row
	if err := r.db.Get(&ids, `
		SELECT company_id, series_id
		FROM media_items
		WHERE id = ?
		LIMIT 1
	`, mediaID); err != nil {
		return nil, err
	}

	if ids.CompanyID.Valid {
		assignments.CompanyID = &ids.CompanyID.Int64
	}
	if ids.SeriesID.Valid {
		assignments.SeriesID = &ids.SeriesID.Int64
	}

	if err := r.db.Select(&assignments.PersonIDs, `
		SELECT person_id
		FROM media_people
		WHERE media_id = ?
		ORDER BY person_id ASC
	`, mediaID); err != nil {
		return nil, err
	}

	if err := r.db.Select(&assignments.CategoryIDs, `
		SELECT category_id
		FROM media_categories
		WHERE media_id = ?
		ORDER BY category_id ASC
	`, mediaID); err != nil {
		return nil, err
	}

	if err := r.db.Select(&assignments.TagIDs, `
		SELECT tag_id
		FROM media_tags
		WHERE media_id = ?
		ORDER BY tag_id ASC
	`, mediaID); err != nil {
		return nil, err
	}

	if assignments.PersonIDs == nil {
		assignments.PersonIDs = []int64{}
	}
	if assignments.CategoryIDs == nil {
		assignments.CategoryIDs = []int64{}
	}
	if assignments.TagIDs == nil {
		assignments.TagIDs = []int64{}
	}

	return assignments, nil
}

func (r *Repository) ReplaceAssignments(mediaID int64, input UpdateAssignmentsInput) error {
	tx, err := r.db.Beginx()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	resolvedCompanyID := input.CompanyID
	resolvedSeriesID := input.SeriesID

	if input.SeriesID != nil {
		var seriesCompany sql.NullInt64
		err := tx.Get(&seriesCompany, `
			SELECT company_id
			FROM series
			WHERE id = ?
			LIMIT 1
		`, *input.SeriesID)
		if err != nil {
			if err == sql.ErrNoRows {
				return fmt.Errorf("selected series not found")
			}
			return err
		}

		if seriesCompany.Valid {
			value := seriesCompany.Int64
			resolvedCompanyID = &value
		}
	}

	now := time.Now().UTC().Format(time.RFC3339)

	result, err := tx.Exec(`
		UPDATE media_items
		SET company_id = ?, series_id = ?, updated_at = ?
		WHERE id = ?
	`, resolvedCompanyID, resolvedSeriesID, now, mediaID)
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

	if _, err := tx.Exec(`DELETE FROM media_people WHERE media_id = ?`, mediaID); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM media_categories WHERE media_id = ?`, mediaID); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM media_tags WHERE media_id = ?`, mediaID); err != nil {
		return err
	}

	for _, personID := range dedupeIDs(input.PersonIDs) {
		if _, err := tx.Exec(`
			INSERT INTO media_people (media_id, person_id)
			VALUES (?, ?)
		`, mediaID, personID); err != nil {
			return err
		}
	}

	for _, categoryID := range dedupeIDs(input.CategoryIDs) {
		if _, err := tx.Exec(`
			INSERT INTO media_categories (media_id, category_id)
			VALUES (?, ?)
		`, mediaID, categoryID); err != nil {
			return err
		}
	}

	for _, tagID := range dedupeIDs(input.TagIDs) {
		if _, err := tx.Exec(`
			INSERT INTO media_tags (media_id, tag_id)
			VALUES (?, ?)
		`, mediaID, tagID); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func dedupeIDs(values []int64) []int64 {
	seen := map[int64]bool{}
	out := make([]int64, 0, len(values))

	for _, value := range values {
		if value <= 0 {
			continue
		}
		if seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}

	return out
}

func normalizeName(value string) string {
	value = strings.TrimSpace(value)
	value = strings.Join(strings.Fields(value), " ")
	return value
}


func (r *Repository) ApplyBulkAssignments(mediaIDs []int64, input BulkApplyAssignmentsInput) (int, error) {
	ids := dedupeIDs(mediaIDs)
	if len(ids) == 0 {
		return 0, fmt.Errorf("no media ids provided")
	}

	tx, err := r.db.Beginx()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	resolvedSetCompany := input.SetCompany
	resolvedCompanyID := input.CompanyID

	if input.SetSeries && input.SeriesID != nil {
		var seriesCompany sql.NullInt64
		err := tx.Get(&seriesCompany, `
			SELECT company_id
			FROM series
			WHERE id = ?
			LIMIT 1
		`, *input.SeriesID)
		if err != nil {
			if err == sql.ErrNoRows {
				return 0, fmt.Errorf("selected series not found")
			}
			return 0, err
		}

		if seriesCompany.Valid {
			value := seriesCompany.Int64
			resolvedSetCompany = true
			resolvedCompanyID = &value
		}
	}

	now := time.Now().UTC().Format(time.RFC3339)
	updated := 0

	for _, mediaID := range ids {
		updateParts := []string{"updated_at = ?"}
		args := []any{now}

		if input.SetSeries {
			updateParts = append(updateParts, "series_id = ?")
			args = append(args, input.SeriesID)
		}

		if resolvedSetCompany {
			updateParts = append(updateParts, "company_id = ?")
			args = append(args, resolvedCompanyID)
		}

		args = append(args, mediaID)

		query := `UPDATE media_items SET ` + strings.Join(updateParts, ", ") + ` WHERE id = ?`
		result, err := tx.Exec(query, args...)
		if err != nil {
			return 0, err
		}

		rows, err := result.RowsAffected()
		if err != nil {
			return 0, err
		}
		if rows == 0 {
			continue
		}

		updated++

		for _, personID := range dedupeIDs(input.PersonIDs) {
			if _, err := tx.Exec(`
				INSERT OR IGNORE INTO media_people (media_id, person_id)
				VALUES (?, ?)
			`, mediaID, personID); err != nil {
				return 0, err
			}
		}

		for _, categoryID := range dedupeIDs(input.CategoryIDs) {
			if _, err := tx.Exec(`
				INSERT OR IGNORE INTO media_categories (media_id, category_id)
				VALUES (?, ?)
			`, mediaID, categoryID); err != nil {
				return 0, err
			}
		}

		for _, tagID := range dedupeIDs(input.TagIDs) {
			if _, err := tx.Exec(`
				INSERT OR IGNORE INTO media_tags (media_id, tag_id)
				VALUES (?, ?)
			`, mediaID, tagID); err != nil {
				return 0, err
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return 0, err
	}

	return updated, nil
}