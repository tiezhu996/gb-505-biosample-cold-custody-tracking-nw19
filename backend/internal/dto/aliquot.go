package dto

import "biosample-cold-custody-tracking/backend/internal/model"

type RegisterAliquotTube struct {
	TubeCode string  `json:"tubeCode" binding:"required,min=3,max=50"`
	VolumeML float64 `json:"volumeMl" binding:"required,gt=0,lte=100000"`
}

type RegisterAliquotsRequest struct {
	Tubes []RegisterAliquotTube `json:"tubes" binding:"required,min=1,max=100,dive"`
}

type AliquotBatchResult struct {
	Specimen  *model.Specimen     `json:"specimen"`
	Tubes     []model.AliquotTube `json:"tubes"`
	TotalML   float64             `json:"totalMl"`
	TubeCount int                 `json:"tubeCount"`
}
