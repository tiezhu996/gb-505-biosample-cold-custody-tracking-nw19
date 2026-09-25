package service

import (
	"context"
	"errors"
	"strings"

	"biosample-cold-custody-tracking/backend/internal/dto"
	"biosample-cold-custody-tracking/backend/internal/model"
	"biosample-cold-custody-tracking/backend/internal/repository"
	"biosample-cold-custody-tracking/backend/internal/util"
)

type AliquotService interface {
	ListBySpecimen(context.Context, uint) ([]model.AliquotTube, error)
	Register(context.Context, Actor, uint, dto.RegisterAliquotsRequest) (*dto.AliquotBatchResult, error)
}

type aliquotService struct {
	repo         repository.AliquotRepository
	specimenRepo repository.SpecimenRepository
	audit        AuditService
}

func NewAliquotService(repo repository.AliquotRepository, specimenRepo repository.SpecimenRepository, audit AuditService) AliquotService {
	return &aliquotService{repo: repo, specimenRepo: specimenRepo, audit: audit}
}

func (s *aliquotService) ListBySpecimen(ctx context.Context, specimenID uint) ([]model.AliquotTube, error) {
	return s.repo.ListBySpecimen(ctx, specimenID)
}

func (s *aliquotService) Register(ctx context.Context, actor Actor, specimenID uint, input dto.RegisterAliquotsRequest) (*dto.AliquotBatchResult, error) {
	current, err := s.specimenRepo.Find(ctx, specimenID)
	if err != nil {
		return nil, err
	}
	if !current.CanRegisterAliquots() {
		return nil, util.Conflict("已冻存、放行或销毁的样本不能登记分装")
	}

	tubes := make([]model.AliquotTube, 0, len(input.Tubes))
	seen := make(map[string]struct{}, len(input.Tubes))
	totalML := 0.0
	for _, entry := range input.Tubes {
		code := strings.TrimSpace(entry.TubeCode)
		tube := model.AliquotTube{
			SpecimenID:       specimenID,
			TubeCode:         code,
			VolumeML:         model.RoundVolume3(entry.VolumeML),
			RegisteredByID:   actor.ID,
			RegisteredByName: strings.TrimSpace(actor.Name),
		}
		tube.Normalize()
		if validateErr := tube.Validate(); validateErr != nil {
			return nil, util.BadRequest(validateErr.Error())
		}
		upper := strings.ToUpper(tube.TubeCode)
		if _, duplicate := seen[upper]; duplicate {
			return nil, util.BadRequest("本批登记中存在重复管编号: " + tube.TubeCode)
		}
		seen[upper] = struct{}{}
		tubes = append(tubes, tube)
		totalML += tube.VolumeML
	}
	totalML = model.RoundVolume3(totalML)
	if totalML > current.VolumeML+1e-6 {
		return nil, util.BadRequest("分装合计体积超过样本剩余体积，本批未写入；父样本体积、管数和状态保持不变")
	}

	registration := repository.AliquotRegistration{
		SpecimenID:  specimenID,
		ExpectState: current.State,
		Tubes:       tubes,
		TotalML:     totalML,
	}
	created, updated, before, err := s.repo.RegisterBatch(ctx, registration)
	if err != nil {
		switch {
		case errors.Is(err, repository.ErrAliquotStateChanged):
			return nil, util.Conflict("样本状态已被其他请求更新，请刷新后重试")
		case errors.Is(err, repository.ErrAliquotTubeCodeExists):
			return nil, util.Conflict("样本下已存在相同管编号，本批未写入")
		case errors.Is(err, repository.ErrAliquotVolumeExceeded):
			return nil, util.BadRequest("分装合计体积超过样本剩余体积，本批未写入；父样本体积、管数和状态保持不变")
		default:
			return nil, err
		}
	}
	if err := s.audit.Record(ctx, actor, "specimen.aliquoted", "Specimen", specimenID, before, updated); err != nil {
		return nil, err
	}
	result := &dto.AliquotBatchResult{
		Specimen:  updated,
		Tubes:     created,
		TotalML:   totalML,
		TubeCount: len(created),
	}
	return result, nil
}
