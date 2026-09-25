package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"biosample-cold-custody-tracking/backend/internal/dto"
	"biosample-cold-custody-tracking/backend/internal/service"
	"biosample-cold-custody-tracking/backend/internal/util"
)

type AliquotHandler struct{ service service.AliquotService }

func NewAliquotHandler(aliquotService service.AliquotService) *AliquotHandler {
	return &AliquotHandler{service: aliquotService}
}

func (h *AliquotHandler) List(c *gin.Context) {
	id, ok := util.ParseID(c)
	if !ok {
		return
	}
	items, err := h.service.List(c.Request.Context(), id)
	if err != nil {
		util.RespondError(c, err)
		return
	}
	util.Respond(c, http.StatusOK, items)
}

func (h *AliquotHandler) Register(c *gin.Context) {
	id, ok := util.ParseID(c)
	if !ok {
		return
	}
	var input dto.RegisterAliquotsRequest
	if !util.BindJSON(c, &input) {
		return
	}
	item, err := h.service.Register(c.Request.Context(), ActorFromContext(c), id, input)
	if err != nil {
		util.RespondError(c, err)
		return
	}
	util.Respond(c, http.StatusCreated, item)
}
