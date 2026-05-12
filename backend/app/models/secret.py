from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.core.database import Base


class Secret(Base):
    __tablename__ = "secrets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    value_encrypted = Column(Text, nullable=False)
    scope = Column(String, default="user")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")
