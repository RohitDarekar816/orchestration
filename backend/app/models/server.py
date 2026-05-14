from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from app.core.database import Base


class Server(Base):
    __tablename__ = "servers"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    host = Column(String, nullable=False)
    port = Column(Integer, default=22)
    username = Column(String, nullable=False)
    auth_type = Column(String, nullable=False)  # "key" or "password"
    ssh_key_secret_id = Column(Integer, ForeignKey("secrets.id"), nullable=True)
    ssh_password_secret_id = Column(Integer, ForeignKey("secrets.id"), nullable=True)
    tags = Column(Text, nullable=True)  # JSON list, e.g. ["production", "web"]
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User")
    ssh_key_secret = relationship("Secret", foreign_keys=[ssh_key_secret_id])
    ssh_password_secret = relationship("Secret", foreign_keys=[ssh_password_secret_id])
