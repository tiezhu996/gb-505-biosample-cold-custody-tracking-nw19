package repository

import (
	"context"
	"errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"biosample-cold-custody-tracking/backend/internal/constants"
	"biosample-cold-custody-tracking/backend/internal/model"
)

var (
	// ErrAliquotStateChanged 表示事务内发现父样本状态与预读时不一致。
	ErrAliquotStateChanged = errors.New("specimen state changed before aliquot registration")
	// ErrAliquotTubeCodeExists 表示同一父样本下管编号已存在。
	ErrAliquotTubeCodeExists = errors.New("aliquot tube code already exists for specimen")
	// ErrAliquotVolumeExceeded 表示本批冻存管合计体积超过父样本剩余体积。
	ErrAliquotVolumeExceeded = errors.New("aliquot batch volume exceeds remaining specimen volume")
)

// AliquotRegistration 是一次整批冻存管登记的事务入参。
type AliquotRegistration struct {
	SpecimenID  uint
	ExpectState constants.SpecimenState
	Tubes       []model.AliquotTube
	TotalML     float64
}

type AliquotRepository interface {
	ListBySpecimen(context.Context, uint) ([]model.AliquotTube, error)
	RegisterBatch(context.Context, AliquotRegistration) ([]model.AliquotTube, *model.Specimen, model.Specimen, error)
}

type aliquotRepository struct{ db *gorm.DB }

func NewAliquotRepository(db *gorm.DB) AliquotRepository {
	return &aliquotRepository{db: db}
}

func (r *aliquotRepository) ListBySpecimen(ctx context.Context, specimenID uint) ([]model.AliquotTube, error) {
	tubes := make([]model.AliquotTube, 0)
	err := r.db.WithContext(ctx).Where("specimen_id = ?", specimenID).
		Order("id ASC").Find(&tubes).Error
	return tubes, err
}

func (r *aliquotRepository) RegisterBatch(ctx context.Context, input AliquotRegistration) ([]model.AliquotTube, *model.Specimen, model.Specimen, error) {
	created := make([]model.AliquotTube, 0, len(input.Tubes))
	var specimen model.Specimen
	var before model.Specimen
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&specimen, input.SpecimenID).Error; err != nil {
			return err
		}
		before = specimen
		if specimen.State != input.ExpectState || !specimen.CanRegisterAliquots() {
			return ErrAliquotStateChanged
		}
		codes := make([]string, 0, len(input.Tubes))
		for _, tube := range input.Tubes {
			codes = append(codes, tube.TubeCode)
		}
		var conflict int64
		if err := tx.Model(&model.AliquotTube{}).
			Where("specimen_id = ? AND tube_code IN ?", input.SpecimenID, codes).
			Count(&conflict).Error; err != nil {
			return err
		}
		if conflict > 0 {
			return ErrAliquotTubeCodeExists
		}
		if input.TotalML > specimen.VolumeML+1e-6 {
			return ErrAliquotVolumeExceeded
		}
		if err := tx.Create(&input.Tubes).Error; err != nil {
			return err
		}
		remaining := model.RoundVolume3(specimen.VolumeML - input.TotalML)
		if remaining < 0 {
			remaining = 0
		}
		specimen.VolumeML = remaining
		specimen.AliquotCount += len(input.Tubes)
		specimen.State = constants.SpecimenStateAliquoted
		if err := specimen.Validate(); err != nil {
			return err
		}
		if err := tx.Save(&specimen).Error; err != nil {
			return err
		}
		created = input.Tubes
		return nil
	})
	if err != nil {
		return nil, nil, model.Specimen{}, err
	}
	return created, &specimen, before, nil
}
