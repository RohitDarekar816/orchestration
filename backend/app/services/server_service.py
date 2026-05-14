import json

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.server import Server
from app.services.secret_service import SecretService


class ServerService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_servers(self, user_id: int) -> list[Server]:
        result = await self.db.execute(
            select(Server).where(Server.user_id == user_id).order_by(Server.name)
        )
        return result.scalars().all()

    async def get_server(self, server_id: int, user_id: int) -> Server | None:
        result = await self.db.execute(
            select(Server).where(Server.id == server_id, Server.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_server_by_name(self, name: str, user_id: int) -> Server | None:
        result = await self.db.execute(
            select(Server).where(Server.name == name, Server.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def create_server(
        self,
        user_id: int,
        name: str,
        host: str,
        username: str,
        auth_type: str,
        port: int = 22,
        ssh_key_secret_id: int | None = None,
        ssh_password_secret_id: int | None = None,
        tags: list[str] | None = None,
        description: str | None = None,
    ) -> Server:
        server = Server(
            user_id=user_id,
            name=name,
            host=host,
            port=port,
            username=username,
            auth_type=auth_type,
            ssh_key_secret_id=ssh_key_secret_id,
            ssh_password_secret_id=ssh_password_secret_id,
            tags=json.dumps(tags or []),
            description=description,
        )
        self.db.add(server)
        await self.db.commit()
        await self.db.refresh(server)
        return server

    async def update_server(self, server_id: int, user_id: int, **kwargs) -> Server | None:
        server = await self.get_server(server_id, user_id)
        if not server:
            return None
        for key, value in kwargs.items():
            if hasattr(server, key) and value is not None:
                setattr(server, key, value)
        await self.db.commit()
        await self.db.refresh(server)
        return server

    async def delete_server(self, server_id: int, user_id: int) -> bool:
        result = await self.db.execute(
            delete(Server).where(Server.id == server_id, Server.user_id == user_id)
        )
        await self.db.commit()
        return result.rowcount > 0

    async def get_server_env(self, server: Server) -> dict[str, str]:
        """Decrypt and return SSH credentials as env vars for injection into agent runs."""
        secret_svc = SecretService(self.db)
        env: dict[str, str] = {
            "OZ_SSH_HOST": server.host,
            "OZ_SSH_PORT": str(server.port),
            "OZ_SSH_USER": server.username,
            "OZ_SSH_AUTH_TYPE": server.auth_type,
        }

        if server.auth_type == "key" and server.ssh_key_secret_id:
            env["OZ_SSH_KEY"] = await secret_svc.get_secret_value(server.ssh_key_secret_id)

        if server.auth_type == "password" and server.ssh_password_secret_id:
            env["OZ_SSH_PASSWORD"] = await secret_svc.get_secret_value(server.ssh_password_secret_id)

        return env

    @staticmethod
    def build_server_prompt_context(server: Server) -> str:
        """Return a prompt prefix that tells the agent how to connect to the server."""
        lines = [
            "## Target Server",
            f"- Name: {server.name}",
            f"- Host: {server.host}",
            f"- Port: {server.port}",
            f"- User: {server.username}",
            f"- Auth: {server.auth_type}",
        ]

        if server.auth_type == "key":
            lines += [
                "",
                "The SSH private key is available in the env var OZ_SSH_KEY.",
                "Before SSHing, write it to a temp file:",
                "  echo \"$OZ_SSH_KEY\" > /tmp/oz_ssh_key && chmod 600 /tmp/oz_ssh_key",
                f"  ssh -i /tmp/oz_ssh_key -p {server.port} -o StrictHostKeyChecking=no {server.username}@{server.host} '<command>'",
            ]
        elif server.auth_type == "password":
            lines += [
                "",
                "The SSH password is available in the env var OZ_SSH_PASSWORD.",
                f"Use sshpass: sshpass -p \"$OZ_SSH_PASSWORD\" ssh -p {server.port} -o StrictHostKeyChecking=no {server.username}@{server.host} '<command>'",
            ]

        return "\n".join(lines)
