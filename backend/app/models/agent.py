import enum

from sqlalchemy import Column, DateTime, Enum, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from app.core.database import Base


class AgentStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    PAUSED = "paused"


class AgentRun(Base):
    __tablename__ = "agent_runs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    skill_id = Column(Integer, ForeignKey("skills.id"), nullable=True)
    agent_type = Column(String, nullable=False)
    status = Column(Enum(AgentStatus), default=AgentStatus.PENDING)
    prompt = Column(Text, nullable=True)
    image = Column(String, default="oz-agent:latest")
    target_repos = Column(Text, nullable=True)
    env_vars = Column(Text, nullable=True)
    max_runtime = Column(Integer, default=3600)
    cost_limit = Column(Float, default=50.0)
    container_id = Column(String, nullable=True)
    exit_code = Column(Integer, nullable=True)
    error = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")
    skill = relationship("Skill")
