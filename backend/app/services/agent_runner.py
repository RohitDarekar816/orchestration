import asyncio
import json
import os
import traceback
from datetime import datetime, timezone

import docker
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.ws_manager import active_sessions
from app.models.agent import AgentRun, AgentStatus
from app.models.log import AgentLog

settings = get_settings()


class LocalAgentRunner:
    """Runs agents on the local machine (for dev use)."""

    def __init__(self, agent_run: AgentRun, db: AsyncSession):
        self.agent_run = agent_run
        self.db = db
        self.process: asyncio.subprocess.Process | None = None
        self.work_dir = os.path.join(settings.agent_work_dir, str(agent_run.id))

    def _get_command_and_input(self) -> tuple[list[str], str | None]:
        prompt = self.agent_run.prompt
        agent = self.agent_run.agent_type

        if agent == "opencode":
            return ["opencode", "run", prompt or ""], None
        elif agent == "claude-code":
            return ["claude", "--print"], prompt
        elif agent == "codex":
            return ["codex", "exec", "--yolo", "--sandbox", "danger-full-access", prompt or ""], None
        elif agent == "gemini-cli":
            return ["gemini", "-p", prompt or ""], None
        elif agent == "custom":
            return [], prompt
        return [], None

    async def run(self):
        os.makedirs(self.work_dir, exist_ok=True)
        cmd, stdin_input = self._get_command_and_input()
        if not cmd:
            await self._log("error", "Unknown agent type or no command defined")
            await self._update_status(AgentStatus.FAILED)
            return

        env = os.environ.copy()
        if self.agent_run.env_vars:
            try:
                extra = json.loads(self.agent_run.env_vars)
                env.update(extra)
            except json.JSONDecodeError:
                pass

        await self._update_status(AgentStatus.RUNNING)

        try:
            stdin_pipe = asyncio.subprocess.PIPE if stdin_input is not None else asyncio.subprocess.DEVNULL
            self.process = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=stdin_pipe,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=self.work_dir,
                env=env,
            )

            if stdin_input is not None:
                self.process.stdin.write(stdin_input.encode())
                await self.process.stdin.drain()
                self.process.stdin.close()

            async def _read_stream(stream, stream_name):
                while True:
                    line = await stream.readline()
                    if not line:
                        break
                    text = line.decode().rstrip("\n").rstrip("\r")
                    if text:
                        await self._log(stream_name, text)
                        await self._broadcast(stream_name, text)

            stdout_task = asyncio.create_task(_read_stream(self.process.stdout, "stdout"))
            stderr_task = asyncio.create_task(_read_stream(self.process.stderr, "stderr"))

            done, pending = await asyncio.wait(
                {stdout_task, stderr_task},
                timeout=self.agent_run.max_runtime,
            )

            for task in pending:
                task.cancel()

            exit_code = await self.process.wait()
            self.agent_run.exit_code = exit_code
            self.agent_run.finished_at = datetime.now(timezone.utc)
            self.agent_run.status = AgentStatus.COMPLETED if exit_code == 0 else AgentStatus.FAILED
            await self.db.commit()

        except TimeoutError:
            if self.process:
                self.process.kill()
            await self._log("error", "Agent run timed out")
            await self._update_status(AgentStatus.FAILED)
        except Exception as e:
            await self._log("error", f"{type(e).__name__}: {e}")
            for line in traceback.format_exc().splitlines():
                await self._log("error", line)
            await self._update_status(AgentStatus.FAILED)

    async def _update_status(self, status: AgentStatus):
        self.agent_run.status = status
        if status == AgentStatus.RUNNING:
            self.agent_run.started_at = datetime.now(timezone.utc)
        elif status in (AgentStatus.COMPLETED, AgentStatus.FAILED, AgentStatus.CANCELLED):
            self.agent_run.finished_at = datetime.now(timezone.utc)
        await self.db.commit()

    async def _log(self, stream: str, content: str):
        log = AgentLog(agent_run_id=self.agent_run.id, stream=stream, content=content)
        self.db.add(log)
        await self.db.commit()

    async def _broadcast(self, stream: str, content: str):
        ws = active_sessions.get(self.agent_run.id)
        if ws:
            try:
                ts = datetime.now(timezone.utc).isoformat()
                await ws.send_json({"stream": stream, "content": content, "timestamp": ts})
            except Exception:
                active_sessions.pop(self.agent_run.id, None)

    async def cancel(self):
        if self.process and self.process.returncode is None:
            self.process.kill()
            await self._update_status(AgentStatus.CANCELLED)

    async def stream_logs(self):
        result = await self.db.execute(
            select(AgentLog).where(AgentLog.agent_run_id == self.agent_run.id).order_by(AgentLog.timestamp)
        )
        return result.scalars().all()


class DockerAgentRunner:
    """Runs agents in Docker containers (for production/server use)."""

    def __init__(self, agent_run: AgentRun, db: AsyncSession):
        self.agent_run = agent_run
        self.db = db
        self.container = None
        self.client = docker.from_env()

    async def run(self):
        await self._update_status(AgentStatus.RUNNING)

        env_vars = {}
        if self.agent_run.env_vars:
            try:
                env_vars = json.loads(self.agent_run.env_vars)
            except json.JSONDecodeError:
                pass

        # claude-code reads its prompt from stdin; pass it via env var so the
        # entrypoint can pipe it in without any shell escaping issues.
        if self.agent_run.agent_type == "claude-code":
            env_vars["OZ_PROMPT"] = self.agent_run.prompt or ""

        # oz-local uses the local llama-cpp server.
        if self.agent_run.agent_type == "oz-local" and settings.oz_llamacpp_url:
            env_vars.setdefault("OPENAI_BASE_URL", settings.oz_llamacpp_url)
            env_vars.setdefault("OPENAI_API_KEY", "sk-local")

        # opencode: free opencode/* models need no credentials.
        # Inject NVIDIA key only if the model requires it.
        if self.agent_run.agent_type == "opencode":
            model = settings.oz_opencode_model or ""
            if not model.startswith("opencode/"):
                if settings.oz_nvidia_api_key:
                    env_vars.setdefault("NVIDIA_API_KEY", settings.oz_nvidia_api_key)
                elif settings.oz_llamacpp_url:
                    env_vars.setdefault("OPENAI_BASE_URL", settings.oz_llamacpp_url)
                    env_vars.setdefault("OPENAI_API_KEY", "sk-local")

        cmd = self._build_cmd()
        image = self.agent_run.image or "oz-agent:latest"

        # Network mode is host so VPN routes on the host are reachable from
        # inside the container. Override with OZ_AGENT_NETWORK env var if needed.
        network_mode = settings.oz_agent_network

        def _run_sync():
            return self.client.containers.run(
                image=image,
                command=cmd,
                environment=env_vars,
                working_dir="/workspace",
                # noexec removed: agents must be able to write and execute scripts.
                # /tmp is a separate tmpfs so SSH keys and temp scripts are isolated.
                tmpfs={
                    "/workspace": "rw,nosuid,size=256m",
                    "/tmp": "rw,nosuid,nodev,size=64m",
                },
                # Docker socket lets the agent manage containers on the host.
                volumes={"/var/run/docker.sock": {"bind": "/var/run/docker.sock", "mode": "rw"}},
                detach=True,
                network_mode=network_mode,
                mem_limit="4g",
                cpu_period=100000,
                cpu_quota=400000,
            )

        loop = asyncio.get_event_loop()
        self.container = await loop.run_in_executor(None, _run_sync)

        self.agent_run.container_id = self.container.id
        await self.db.commit()

        try:
            result = await loop.run_in_executor(
                None,
                lambda: self.container.wait(timeout=self.agent_run.max_runtime),
            )
            exit_code = result["StatusCode"]

            # Collect stdout and stderr separately so callers can distinguish
            # clean output (stdout) from debug/trace (stderr).
            stdout_raw = self.container.logs(stdout=True, stderr=False).decode()
            stderr_raw = self.container.logs(stdout=False, stderr=True).decode()
            for line in stdout_raw.splitlines():
                if line.strip():
                    await self._log("stdout", line)
            for line in stderr_raw.splitlines():
                if line.strip():
                    await self._log("stderr", line)

            self.agent_run.exit_code = exit_code
            self.agent_run.status = AgentStatus.COMPLETED if exit_code == 0 else AgentStatus.FAILED
            self.agent_run.finished_at = datetime.now(timezone.utc)
            await self.db.commit()

        except Exception as e:
            import traceback

            await self._log("error", f"{type(e).__name__}: {e}")
            for line in traceback.format_exc().splitlines():
                await self._log("error", line)
            self.agent_run.error = str(e)
            await self._update_status(AgentStatus.FAILED)
        finally:

            def _cleanup():
                if self.container:
                    try:
                        self.container.remove(force=True)
                    except Exception:
                        pass

            await loop.run_in_executor(None, _cleanup)

    def _build_cmd(self) -> list[str]:
        prompt = self.agent_run.prompt or ""
        agent_type = self.agent_run.agent_type

        if agent_type == "claude-code":
            # Prompt is passed via OZ_PROMPT env var (set in run()) to avoid
            # any shell escaping issues with multiline or quoted content.
            return ["bash", "-c", "printf '%s' \"$OZ_PROMPT\" | claude --print"]
        elif agent_type == "codex":
            return ["codex", "exec", "--yolo", "--sandbox", "danger-full-access", prompt]
        elif agent_type == "opencode":
            cmd = ["opencode", "run", "--dangerously-skip-permissions"]
            if settings.oz_opencode_model:
                cmd += ["-m", settings.oz_opencode_model]
            preamble = (
                "SSH RULE: When using sshpass, ALWAYS wrap the password in single quotes. "
                "Correct form: sshpass -p 'PASSWORD' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 USER@HOST 'COMMAND'\n"
                "OUTPUT RULE: After completing the task, write ONE plain-English sentence summarising the result. "
                "No markdown, no code blocks, no bullet points.\n\n"
            )
            cmd += [preamble + prompt]
            return cmd
        elif agent_type == "oz-local":
            return ["python3", "/usr/local/bin/oz-local", prompt]
        elif agent_type == "gemini-cli":
            return ["gemini", "-p", prompt]
        return ["bash", "-c", prompt]

    async def _update_status(self, status: AgentStatus):
        self.agent_run.status = status
        if status == AgentStatus.RUNNING:
            self.agent_run.started_at = datetime.now(timezone.utc)
        elif status in (AgentStatus.COMPLETED, AgentStatus.FAILED, AgentStatus.CANCELLED):
            self.agent_run.finished_at = datetime.now(timezone.utc)
        await self.db.commit()

    async def _log(self, stream: str, content: str):
        log = AgentLog(agent_run_id=self.agent_run.id, stream=stream, content=content)
        self.db.add(log)
        await self.db.commit()
        await self._broadcast(stream, content)

    async def _broadcast(self, stream: str, content: str):
        ws = active_sessions.get(self.agent_run.id)
        if ws:
            try:
                ts = datetime.now(timezone.utc).isoformat()
                await ws.send_json({"stream": stream, "content": content, "timestamp": ts})
            except Exception:
                active_sessions.pop(self.agent_run.id, None)

    async def cancel(self):
        if self.container:

            def _kill():
                try:
                    self.container.kill()
                    self.container.remove(force=True)
                except Exception:
                    pass

            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, _kill)
            await self._update_status(AgentStatus.CANCELLED)


def get_runner(agent_run: AgentRun, db: AsyncSession):
    if settings.oz_runner == "docker":
        return DockerAgentRunner(agent_run, db)
    return LocalAgentRunner(agent_run, db)
