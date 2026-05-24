package auth

import (
	"errors"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

const MinPasswordLength = 10

func HashPassword(password string) (string, error) {
	if err := ValidatePassword(password); err != nil {
		return "", err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

func VerifyPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

func ValidatePassword(password string) error {
	if len(strings.TrimSpace(password)) < MinPasswordLength {
		return errors.New("password must be at least 10 characters")
	}
	return nil
}
