from datetime import datetime
import uuid

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class TimestampedModel(ORMModel):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class Message(BaseModel):
    message: str


class Pagination(BaseModel):
    offset: int = Field(0, ge=0)
    limit: int = Field(50, ge=1, le=200)
