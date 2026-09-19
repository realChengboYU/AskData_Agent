from fastapi import APIRouter

from app.schemas import AskRequest, AskResponse
from app.services.ask_engine import answer_question

router = APIRouter(prefix="/api", tags=["ask"])


@router.post("/ask", response_model=AskResponse)
def ask(payload: AskRequest) -> AskResponse:
    result = answer_question(payload.question)
    return AskResponse(
        question=result["question"],
        answer=result["answer"],
        reasoning=result["reasoning"],
        sql=result["sql"],
        chart=result["chart"],
    )
