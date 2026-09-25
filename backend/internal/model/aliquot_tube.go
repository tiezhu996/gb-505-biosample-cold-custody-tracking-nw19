package model

import (
	"fmt"
	"regexp"
	"strings"
)

var aliquotTubeCodePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{2,49}$`)

// AliquotTube 是父样本的管级分装台账，每条记录对应一支冻存管。
type AliquotTube struct {
	Base
	SpecimenID       uint    `gorm:"index;uniqueIndex:uk_aliquot_tube_specimen_code,priority:1;not null" json:"specimenId"`
	TubeCode         string  `gorm:"size:50;uniqueIndex:uk_aliquot_tube_specimen_code,priority:2;not null" json:"tubeCode"`
	VolumeML         float64 `gorm:"type:numeric(12,3);not null" json:"volumeMl"`
	RegisteredByID   uint    `gorm:"not null" json:"registeredById"`
	RegisteredByName string  `gorm:"size:100;not null" json:"registeredByName"`
}

func (t *AliquotTube) Normalize() {
	t.TubeCode = strings.TrimSpace(t.TubeCode)
	t.RegisteredByName = strings.TrimSpace(t.RegisteredByName)
}

func (t AliquotTube) Validate() error {
	if !aliquotTubeCodePattern.MatchString(t.TubeCode) {
		return fmt.Errorf("tube code must contain 3-50 letters, numbers, underscores or hyphens")
	}
	if t.VolumeML <= 0 || t.VolumeML > 100000 {
		return fmt.Errorf("tube volume must be greater than zero and at most 100000 ml")
	}
	if length := len([]rune(t.RegisteredByName)); length < 2 || length > 100 {
		return fmt.Errorf("tube registrant must contain 2-100 characters")
	}
	return nil
}

// RoundVolume3 把体积规整到 numeric(12,3) 的三位小数，避免浮点累计误差。
func RoundVolume3(value float64) float64 {
	return float64(int64(value*1000+0.5)) / 1000
}
