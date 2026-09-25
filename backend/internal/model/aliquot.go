package model

import (
	"fmt"
	"regexp"
	"strings"
	"time"
)

var tubeCodePattern = regexp.MustCompile(`^[A-Z0-9][A-Z0-9-]{2,49}$`)

// SpecimenAliquot is the tube-level ledger entry recorded when a specimen is aliquoted.
type SpecimenAliquot struct {
	Base
	SpecimenID       uint      `gorm:"index;not null" json:"specimenId"`
	TubeCode         string    `gorm:"size:50;uniqueIndex;not null" json:"tubeCode"`
	VolumeML         float64   `gorm:"type:numeric(12,3);not null" json:"volumeMl"`
	Batch            int       `gorm:"not null;default:1" json:"batch"`
	RegisteredByID   uint      `gorm:"index;not null" json:"registeredById"`
	RegisteredByName string    `gorm:"size:100;not null" json:"registeredByName"`
	RegisteredAt     time.Time `gorm:"index;not null" json:"registeredAt"`
	Notes            string    `gorm:"size:500" json:"notes,omitempty"`
}

func (a *SpecimenAliquot) Normalize() {
	a.TubeCode = strings.ToUpper(strings.TrimSpace(a.TubeCode))
	a.RegisteredByName = strings.TrimSpace(a.RegisteredByName)
	a.Notes = strings.TrimSpace(a.Notes)
}

func (a SpecimenAliquot) Validate() error {
	if a.SpecimenID == 0 {
		return fmt.Errorf("specimen is required")
	}
	if !tubeCodePattern.MatchString(a.TubeCode) {
		return fmt.Errorf("tube code must contain 3-50 uppercase letters, numbers or hyphens")
	}
	if a.VolumeML <= 0 || a.VolumeML > 10000 {
		return fmt.Errorf("tube volume must be greater than zero and at most 10000 ml")
	}
	if a.Batch < 1 {
		return fmt.Errorf("aliquot batch must be at least 1")
	}
	if a.RegisteredByID == 0 || a.RegisteredByName == "" {
		return fmt.Errorf("registrar identity is required")
	}
	if len([]rune(a.RegisteredByName)) > 100 {
		return fmt.Errorf("registrar name cannot exceed 100 characters")
	}
	if a.RegisteredAt.IsZero() {
		return fmt.Errorf("registered time is required")
	}
	if len([]rune(a.Notes)) > 500 {
		return fmt.Errorf("tube notes cannot exceed 500 characters")
	}
	return nil
}
