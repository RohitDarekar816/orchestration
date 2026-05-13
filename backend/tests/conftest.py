import os

os.environ["DATABASE_URL"] = "sqlite+aiosqlite://"
os.environ["SECRET_KEY"] = "test-secret-key-for-testing-only"
os.environ["REDIS_URL"] = "redis://localhost:6379/0"
os.environ["OZ_RUNNER"] = "local"

from collections.abc import AsyncGenerator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.core.database as db_module
from app.core.auth import create_access_token, hash_password
from app.core.database import Base
from app.main import app
from app.models.user import User


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine("sqlite+aiosqlite://", echo=False)

    old_engine = db_module.engine
    old_session = db_module.async_session

    db_module.engine = engine
    db_module.async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with db_module.async_session() as session:
        yield session

    db_module.engine = old_engine
    db_module.async_session = old_session
    await engine.dispose()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def user(db_session: AsyncSession) -> User:
    u = User(
        email="test@test.com",
        hashed_password=hash_password("test123"),
        full_name="Test User",
    )
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)
    return u


@pytest_asyncio.fixture
async def auth_token(user: User) -> str:
    return create_access_token({"sub": str(user.id), "email": user.email})


@pytest_asyncio.fixture
async def auth_headers(auth_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {auth_token}"}
