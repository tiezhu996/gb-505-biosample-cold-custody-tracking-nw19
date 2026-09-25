package dto

type AliquotTubeInput struct {
	TubeCode string  `json:"tubeCode" binding:"required,min=3,max=50"`
	VolumeML float64 `json:"volumeMl" binding:"required,gt=0,lte=10000"`
	Notes    string  `json:"notes" binding:"max=500"`
}

type RegisterAliquotsRequest struct {
	Tubes []AliquotTubeInput `json:"tubes" binding:"required,min=1,max=100,dive"`
}
