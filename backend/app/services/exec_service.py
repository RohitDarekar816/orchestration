import asyncio
import os
import tempfile

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.server import Server
from app.services.secret_service import SecretService


class ExecService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_server_env(self, server: Server) -> dict[str, str]:
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

    async def exec(self, server: Server, command: str, timeout: int = 60) -> dict:
        env = await self.get_server_env(server)

        if server.auth_type == "key":
            with tempfile.NamedTemporaryFile(mode="w", delete=False) as f:
                f.write(env.get("OZ_SSH_KEY", ""))
                key_path = f.name
            os.chmod(key_path, 0o600)

            ssh_cmd = [
                "ssh",
                "-i", key_path,
                "-p", str(server.port),
                "-o", "StrictHostKeyChecking=no",
                "-o", "ConnectTimeout=10",
                f"{server.username}@{server.host}",
                command,
            ]
        else:
            password = env.get("OZ_SSH_PASSWORD", "")
            ssh_cmd = [
                "sshpass", "-p", password,
                "ssh",
                "-p", str(server.port),
                "-o", "StrictHostKeyChecking=no",
                "-o", "ConnectTimeout=10",
                f"{server.username}@{server.host}",
                command,
            ]

        try:
            proc = await asyncio.wait_for(
                asyncio.create_subprocess_exec(
                    *ssh_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                ),
                timeout=timeout,
            )
            stdout, stderr = await proc.communicate()
            return {
                "exit_code": proc.returncode or 0,
                "stdout": stdout.decode("utf-8", errors="replace"),
                "stderr": stderr.decode("utf-8", errors="replace"),
            }
        except asyncio.TimeoutError:
            return {"exit_code": -1, "stdout": "", "stderr": f"Command timed out after {timeout}s"}
        finally:
            if server.auth_type == "key":
                try:
                    os.unlink(key_path)
                except OSError:
                    pass
