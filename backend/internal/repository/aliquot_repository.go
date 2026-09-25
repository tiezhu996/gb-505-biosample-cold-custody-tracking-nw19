package repository

import (
	"context"
	"errors"
	"fmt"
	"math"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"biosample-cold-custody-tracking/backend/internal/constants"
	"biosample-cold-custody-tracking/backend/internal/model"
	"biosample-cold-custody-tracking/backend/internal/util"
)

var (
	ErrSpecimenNotAliquotable = errors.New("specimen state does not allow aliquot registration")
	ErrDuplicateTubeCode      = errors.New("tube code is already registered")
)

// AliquotVolumeExceededError reports that one registration batch exceeds the remaining volume.
type AliquotVolumeExceededError struct {
	Requested float64
	Remaining float64
}

func (e *AliquotVolumeExceededError) Error() string {
	return fmt.Sprintf("aliquot batch volume %.3f ml exceeds remaining volume %.3f ml", e.Requested, e.Remaining)
}

type AliquotRepository interface {
	List(context.Context, uint) ([]model.SpecimenAliquot, error)
	RegisterBatch(context.Context, uint, []model.SpecimenAliquot) (*model.Specimen, model.Specimen, error)
}

type aliquotRepository struct{ db *gorm.DB }

func NewAliquotRepository(db *gorm.DB) AliquotRepository {
	return &aliquotRepository{db: db}
}

func (r *aliquotRepository) List(ctx context.Context, specimenID uint) ([]model.SpecimenAliquot, error) {
	items := make([]model.SpecimenAliquot, 0)
	err := r.db.WithContext(ctx).
		Where("specimen_id = ?", specimenID).
		Order("registered_at DESC, id DESC").
		Find(&items).Error
	return items, err
}

// RegisterBatch locks the parent specimen, validates the batch against the remaining
// volume and writes every tube plus the parent update in one transaction. Any failure
// leaves the parent volume, aliquot count and state untouched.
func (r *aliquotRepository) RegisterBatch(ctx context.Context, specimenID uint, tubes []model.SpecimenAliquot) (*model.Specimen, model.Specimen, error) {
	var specimen model.Specimen
	var before model.Specimen
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&specimen, specimenID).Error; err != nil {
			return err
		}
		before = specimen
		if specimen.State != constants.SpecimenStateReceived && specimen.State != constants.SpecimenStateAliquoted {
			return ErrSpecimenNotAliquotable
		}
		requested := 0.0
		for _, tube := range tubes {
			requested += tube.VolumeML
		}
		if requested-specimen.VolumeML > 1e-9 {
			return &AliquotVolumeExceededError{Requested: requested, Remaining: specimen.VolumeML}
		}
		var batch int
		if err := tx.Model(&model.SpecimenAliquot{}).
			Where("specimen_id = ?", specimenID).
			Select("COALESCE(MAX(batch), 0) + 1").
			Scan(&batch).Error; err != nil {
			return err
		}
		for i := range tubes {
			tubes[i].SpecimenID = specimen.ID
			tubes[i].Batch = batch
			if err := tx.Create(&tubes[i]).Error; err != nil {
				if util.IsUniqueViolation(err) {
					return ErrDuplicateTubeCode
				}
				return err
			}
		}
		specimen.VolumeML = math.Round((specimen.VolumeML-requested)*1000) / 1000
		specimen.AliquotCount += len(tubes)
		specimen.State = constants.SpecimenStateAliquoted
		specimen.Normalize()
		if err := specimen.Validate(); err != nil {
			return fmt.Errorf("validate aliquoted specimen: %w", err)
		}
		return tx.Save(&specimen).Error
	})
	if err != nil {
		return nil, model.Specimen{}, err
	}
	return &specimen, before, nil
}
