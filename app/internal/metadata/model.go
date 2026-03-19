package metadata

type Company struct {
	ID        int64  `db:"id" json:"id"`
	Name      string `db:"name" json:"name"`
	CreatedAt string `db:"created_at" json:"created_at"`
	UpdatedAt string `db:"updated_at" json:"updated_at"`
}

type Person struct {
	ID        int64  `db:"id" json:"id"`
	Name      string `db:"name" json:"name"`
	CreatedAt string `db:"created_at" json:"created_at"`
	UpdatedAt string `db:"updated_at" json:"updated_at"`
}

type Category struct {
	ID         int64  `db:"id" json:"id"`
	Name       string `db:"name" json:"name"`
	Kind       string `db:"kind" json:"kind"`
	ParentID   *int64 `db:"parent_id" json:"parent_id"`
	ParentName string `db:"parent_name" json:"parent_name"`
	CreatedAt  string `db:"created_at" json:"created_at"`
	UpdatedAt  string `db:"updated_at" json:"updated_at"`
}

type Tag struct {
	ID        int64  `db:"id" json:"id"`
	Name      string `db:"name" json:"name"`
	CreatedAt string `db:"created_at" json:"created_at"`
	UpdatedAt string `db:"updated_at" json:"updated_at"`
}

type Series struct {
	ID          int64  `db:"id" json:"id"`
	Name        string `db:"name" json:"name"`
	CompanyID   *int64 `db:"company_id" json:"company_id"`
	CompanyName string `db:"company_name" json:"company_name"`
	CreatedAt   string `db:"created_at" json:"created_at"`
	UpdatedAt   string `db:"updated_at" json:"updated_at"`
}

type Options struct {
	Companies  []Company  `json:"companies"`
	People     []Person   `json:"people"`
	Categories []Category `json:"categories"`
	Tags       []Tag      `json:"tags"`
	Series     []Series   `json:"series"`
}

type MediaAssignments struct {
	CompanyID   *int64  `json:"company_id"`
	SeriesID    *int64  `json:"series_id"`
	PersonIDs   []int64 `json:"person_ids"`
	CategoryIDs []int64 `json:"category_ids"`
	TagIDs      []int64 `json:"tag_ids"`
}

type CreateCompanyInput struct {
	Name string `json:"name"`
}

type CreatePersonInput struct {
	Name string `json:"name"`
}

type CreateTagInput struct {
	Name string `json:"name"`
}

type CreateCategoryInput struct {
	Name     string `json:"name"`
	Kind     string `json:"kind"`
	ParentID *int64 `json:"parent_id"`
}

type CreateSeriesInput struct {
	Name      string `json:"name"`
	CompanyID *int64 `json:"company_id"`
}

type UpdateAssignmentsInput struct {
	CompanyID   *int64  `json:"company_id"`
	SeriesID    *int64  `json:"series_id"`
	PersonIDs   []int64 `json:"person_ids"`
	CategoryIDs []int64 `json:"category_ids"`
	TagIDs      []int64 `json:"tag_ids"`
}

type BulkApplyAssignmentsInput struct {
	SetCompany bool   `json:"set_company"`
	CompanyID  *int64 `json:"company_id"`

	SetSeries bool   `json:"set_series"`
	SeriesID  *int64 `json:"series_id"`

	PersonIDs   []int64 `json:"person_ids"`
	CategoryIDs []int64 `json:"category_ids"`
	TagIDs      []int64 `json:"tag_ids"`
}