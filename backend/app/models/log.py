from sqlalchemy import Column, Integer, String, Text, DateTime, Sequence, func
from app.core.database import Base


class AgentLog(Base):
    __tablename__ = "agent_logs"

    id = Column(Integer, primary_key=True, index=True)
    agent_run_id = Column(Integer, nullable=False, index=True)
    stream = Column(String, default="stdout")
    content = Column(Text, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)
