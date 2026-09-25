package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"biosample-cold-custody-tracking/backend/internal/dto"
	"biosample-cold-custody-tracking/backend/internal/model"
	"biosample-cold-custody-tracking/backend/internal/repository"
	"biosample-cold-custody-tracking/backend/internal/util"
)

type AliquotService interface {
	List(context.Context, uint) ([]model.SpecimenAliquot, error)
	Register(context.Context, Actor, uint, dto.RegisterAliquotsRequest) (*model.Specimen, error)
}

type aliquotService struct {
	repo         repository.AliquotRepository
	specimenRepo repository.SpecimenRepository
	audit        AuditService
}

func NewAliquotService(repo repository.AliquotRepository, specimenRepo repository.SpecimenRepository, audit AuditService) AliquotService {
	return &aliquotService{repo: repo, specimenRepo: specimenRepo, audit: audit}
}

func (s *aliquotService) List(ctx context.Context, specimenID uint) ([]model.SpecimenAliquot, error) {
	if _, err := s.specimenRepo.Find(ctx, specimenID); err != nil {
		return nil, err
	}
	return s.repo.List(ctx, specimenID)
}

func (s *aliquotService) Register(ctx context.Context, actor Actor, specimenID uint, input dto.RegisterAliquotsRequest) (*model.Specimen, error) {
	registeredAt := time.Now().UTC()
	seen := make(map[string]struct{}, len(input.Tubes))
	tubes := make([]model.SpecimenAliquot, 0, len(input.Tubes))
	for _, tubeInput := range input.Tubes {
		tube := model.SpecimenAliquot{
			SpecimenID:       specimenID,
			TubeCode:         tubeInput.TubeCode,
			VolumeML:         tubeInput.VolumeML,
			Batch:            1, // placeholder; the repository assigns the real batch number
			RegisteredByID:   actor.ID,
			RegisteredByName: actor.Name,
			RegisteredAt:     registeredAt,
			Notes:            tubeInput.Notes,
		}
		tube.Normalize()
		if err := tube.Validate(); err != nil {
			return nil, util.BadRequest(err.Error())
		}
		if _, exists := seen[tube.TubeCode]; exists {
			return nil, util.BadRequest(fmt.Sprintf("冻存管编号 %s 在本批次中重复", tube.TubeCode))
		}
		seen[tube.TubeCode] = struct{}{}
		tubes = append(tubes, tube)
	}
	updated, before, err := s.repo.RegisterBatch(ctx, specimenID, tubes)
	if err != nil {
		return nil, mapAliquotError(err)
	}
	specimen, err := s.specimenRepo.Find(ctx, updated.ID)
	if err != nil {
		return nil, err
	}
	if err := s.audit.Record(ctx, actor, "specimen.aliquoted", "Specimen", specimen.ID, before, specimen); err != nil {
		return nil, err
	}
	return specimen, nil
}

func mapAliquotError(err error) error {
	var exceeded *repository.AliquotVolumeExceededError
	switch {
	case errors.As(err, &exceeded):
		return util.Conflict(fmt.Sprintf("本批分装合计 %.3f mL 超过剩余体积 %.3f mL，整批未写入", exceeded.Requested, exceeded.Remaining))
	case errors.Is(err, repository.ErrSpecimenNotAliquotable):
		return util.Conflict("已冻存、放行或销毁的样本不能登记分装")
	case errors.Is(err, repository.ErrDuplicateTubeCode):
		return util.Conflict("冻存管编号已存在，请更换后重新登记")
	default:
		return err
	}
}
