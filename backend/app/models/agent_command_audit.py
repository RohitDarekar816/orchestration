from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func

from app.core.database import Base


class AgentCommandAudit(Base):
    __tablename__ = "agent_command_audit"

    id = Column(Integer, primary_key=True, index=True)
    agent_run_id = Column(Integer, nullable=False, index=True)
    server_id = Column(Integer, nullable=True, index=True)
    command = Column(Text, nullable=False)
    exit_code = Column(Integer, nullable=True)
    output = Column(Text, nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)
