from cryptography.fernet import Fernet
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.secret import Secret
from app.core.config import get_settings

settings = get_settings()


def _get_cipher():
    from base64 import urlsafe_b64encode
    if settings.debug:
        key = Fernet.generate_key()
    else:
        raw = settings.secret_key.encode()
        padded = raw.ljust(32, b"_")[:32]
        key = urlsafe_b64encode(padded)
    return Fernet(key)


class SecretService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.cipher = _get_cipher()

    async def list_secrets(self, user_id: int, scope: str = "user") -> list[Secret]:
        result = await self.db.execute(
            select(Secret).where(
                Secret.user_id == user_id,
                Secret.scope == scope,
            )
        )
        return result.scalars().all()

    async def create_secret(self, user_id: int, name: str, value: str, scope: str = "user") -> Secret:
        encrypted = self.cipher.encrypt(value.encode()).decode()
        secret = Secret(
            user_id=user_id,
            name=name,
            value_encrypted=encrypted,
            scope=scope,
        )
        self.db.add(secret)
        await self.db.commit()
        await self.db.refresh(secret)
        return secret

    async def get_secret_value(self, secret_id: int) -> str:
        result = await self.db.execute(select(Secret).where(Secret.id == secret_id))
        secret = result.scalar_one_or_none()
        if not secret:
            raise ValueError("Secret not found")
        return self.cipher.decrypt(secret.value_encrypted.encode()).decode()

    async def delete_secret(self, secret_id: int) -> bool:
        result = await self.db.execute(delete(Secret).where(Secret.id == secret_id))
        await self.db.commit()
        return result.rowcount > 0
