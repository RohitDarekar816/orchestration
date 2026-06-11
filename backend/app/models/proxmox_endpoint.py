from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from app.core.database import Base


class ProxmoxEndpoint(Base):
    __tablename__ = "proxmox_endpoints"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    # Proxmox API URL. Proxmox runs on port 8006 which Cloudflare Workers blocks.
    # Set up an nginx proxy: server:443 (HTTPS) → localhost:8006, then set api_url
    # to https://your-proxmox-host/api2/json
    api_url = Column(String, nullable=False)
    # Default node name (e.g. "pve"). Shown as a hint to the AI agent.
    default_node = Column(String, nullable=False, default="pve")
    # API token stored as reference to the encrypted Secrets vault.
    # Token format: USER@REALM!TOKENID=UUID  e.g. root@pam!oz-agent=xxxxxxxx
    token_secret_id = Column(Integer, ForeignKey("secrets.id"), nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User")
    token_secret = relationship("Secret", foreign_keys=[token_secret_id])
