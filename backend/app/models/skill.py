from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.core.database import Base
import app.models.user  # noqa: ensure User model is registered


class Skill(Base):
    __tablename__ = "skills"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, unique=True, nullable=False)
    description = Column(Text, nullable=True)
    agent_type = Column(String, nullable=False)
    system_prompt = Column(Text, nullable=True)
    tools = Column(Text, nullable=True)
    env_template = Column(Text, nullable=True)
    image = Column(String, nullable=True)
    max_runtime = Column(Integer, default=3600)
    version = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User")
