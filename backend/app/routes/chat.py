import asyncio
import json
import os
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import create_access_token, get_current_user
from app.core.database import get_db
from app.models.agent import AgentRun, AgentStatus
from app.models.conversation import Conversation, Message
from app.models.user import User

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str


class ConversationCreate(BaseModel):
    title: str | None = None


SYSTEM_PROMPT = """You are Oz, an AI assistant for the Oz agent orchestration platform.
You help users manage and execute AI coding agents.

## Your Capabilities
You can have natural conversations AND execute tasks by creating agent runs on the Oz platform.

## How to Execute Tasks
When the user asks you to DO something (check servers, run code, analyze repos, etc.), launch an agent using the Oz CLI:

### Available commands:
- `oz agents launch --type <type> --prompt "<prompt>"` — Launch an agent to perform a task
- `oz agents get <id>` — Check agent status and results
- `oz agents logs <id>` — View agent output

### Agent types:
- `opencode` — General-purpose coding agent (recommended)
- `claude-code` — Claude Code agent
- `codex` — Codex CLI agent
- `gemini-cli` — Gemini CLI agent

### Usage:
1. Answer simple questions directly from your knowledge.
2. For tasks (check servers, analyze code, run commands), launch an agent.
3. Always check results before reporting back.
4. If an agent fails, explain why and suggest alternatives.
"""


@router.post("")
async def create_conversation(
    data: ConversationCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conv = Conversation(user_id=user.id, title=data.title or "New Chat")
    db.add(conv)
    await db.commit()
    await db.refresh(conv)
    return {"id": conv.id, "title": conv.title, "created_at": _dt(conv.created_at)}


@router.get("/conversations")
async def list_conversations(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Conversation).where(Conversation.user_id == user.id).order_by(Conversation.updated_at.desc())
    )
    return [
        {"id": c.id, "title": c.title, "created_at": _dt(c.created_at), "updated_at": _dt(c.updated_at)}
        for c in result.scalars().all()
    ]


@router.delete("/{conv_id}")
async def delete_conversation(
    conv_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Conversation).where(Conversation.id == conv_id, Conversation.user_id == user.id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Conversation not found")
    await db.execute(delete(Message).where(Message.conversation_id == conv_id))
    await db.execute(delete(Conversation).where(Conversation.id == conv_id))
    await db.commit()
    return {"message": "Conversation deleted"}


@router.get("/{conv_id}/messages")
async def get_messages(
    conv_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Conversation).where(Conversation.id == conv_id, Conversation.user_id == user.id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Conversation not found")

    msgs = await db.execute(select(Message).where(Message.conversation_id == conv_id).order_by(Message.created_at))
    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "agent_run_id": m.agent_run_id,
            "created_at": _dt(m.created_at),
        }
        for m in msgs.scalars().all()
    ]


@router.post("/{conv_id}/messages")
async def send_message(
    conv_id: int,
    data: ChatRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Conversation).where(Conversation.id == conv_id, Conversation.user_id == user.id))
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    user_msg = Message(conversation_id=conv_id, role="user", content=data.message)
    db.add(user_msg)
    await db.commit()

    if conv.title == "New Chat":
        conv.title = data.message[:50] + ("..." if len(data.message) > 50 else "")
        await db.commit()

    history = await db.execute(select(Message).where(Message.conversation_id == conv_id).order_by(Message.created_at))
    history_text = "".join(f"\n<{m.role.upper()}>\n{m.content}\n</{m.role.upper()}>\n" for m in history.scalars().all())

    prompt = (
        f"{SYSTEM_PROMPT}\n\n"
        f"## Conversation History\n{history_text}\n"
        f"<USER>\n{data.message}\n</USER>\n\n"
        "Respond to the user. If they ask you to do a task, use `oz agents launch` "
        "to create agent runs. Always wait for results before responding."
    )

    token = create_access_token({"sub": str(user.id), "email": user.email})

    agent_run = AgentRun(
        user_id=user.id,
        agent_type="opencode",
        prompt=prompt,
        status=AgentStatus.PENDING,
        env_vars=json.dumps({"OZ_API_URL": "http://localhost:8000/api", "OZ_AUTH_TOKEN": token}),
        max_runtime=300,
    )
    db.add(agent_run)
    await db.commit()
    await db.refresh(agent_run)

    return StreamingResponse(
        _stream_agent(conv_id, agent_run.id, token),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


async def _stream_agent(conv_id: int, agent_id: int, token: str):
    from app.core.database import async_session as new_session
    from app.services.agent_runner import get_runner

    full_response = ""
    queue: asyncio.Queue = asyncio.Queue()

    try:
        async with new_session() as session:
            result = await session.execute(select(AgentRun).where(AgentRun.id == agent_id))
            agent = result.scalar_one_or_none()
            if not agent:
                yield _sse("error", "Agent not found")
                return

            runner = get_runner(agent, session)
            cmd, stdin_input = runner._get_command_and_input()
            if not cmd:
                yield _sse("error", "No command defined")
                return

            env = os.environ.copy()
            if agent.env_vars:
                try:
                    env.update(json.loads(agent.env_vars))
                except json.JSONDecodeError:
                    pass

            await runner._update_status(AgentStatus.RUNNING)

            os.makedirs(runner.work_dir, exist_ok=True)

            stdin_pipe = asyncio.subprocess.PIPE if stdin_input is not None else asyncio.subprocess.DEVNULL
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=stdin_pipe,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=runner.work_dir,
                env=env,
            )

            if stdin_input is not None:
                proc.stdin.write(stdin_input.encode())
                await proc.stdin.drain()
                proc.stdin.close()

            async def _reader(stream, name):
                while True:
                    line = await stream.readline()
                    if not line:
                        break
                    text = _clean(line.decode())
                    if text:
                        await queue.put((name, text))

            readers = [
                asyncio.create_task(_reader(proc.stdout, "stdout")),
                asyncio.create_task(_reader(proc.stderr, "stderr")),
            ]

            while readers:
                get_task = asyncio.create_task(queue.get())
                done, pending = await asyncio.wait(
                    [get_task] + readers,
                    timeout=agent.max_runtime or 300,
                    return_when=asyncio.FIRST_COMPLETED,
                )
                if not done:
                    get_task.cancel()
                    for t in pending:
                        t.cancel()
                    proc.kill()
                    break

                for t in done:
                    if t in readers:
                        readers.remove(t)
                    elif t is get_task:
                        name, text = t.result()
                        full_response += text + "\n"
                        yield _sse(name, text)

                if get_task not in done:
                    get_task.cancel()

            while not queue.empty():
                try:
                    name, text = queue.get_nowait()
                    full_response += text + "\n"
                    yield _sse(name, text)
                except asyncio.QueueEmpty:
                    break

            exit_code = await proc.wait()
            agent.exit_code = exit_code
            agent.status = AgentStatus.COMPLETED if exit_code == 0 else AgentStatus.FAILED
            agent.finished_at = datetime.now(timezone.utc)
            await session.commit()

    except Exception as e:
        full_response += f"\nError: {type(e).__name__}: {e}"
        yield _sse("error", f"{type(e).__name__}: {e}")

    clean_response = _extract_response(full_response)
    yield _sse("done", clean_response)

    async with new_session() as db_session:
        msg = Message(conversation_id=conv_id, role="assistant", content=clean_response, agent_run_id=agent_id)
        db_session.add(msg)
        await db_session.commit()


_ansi_re = re.compile(r"\x1b\[[0-9;]*[a-zA-Z]")
_noise_re = re.compile(
    r"^(Reading |Building |Setting up |Processing triggers|Selecting previously|"
    r"Preparing to unpack|Unpacking |update-alternatives|"
    r"^\d+ upgraded, \d+ newly installed|"
    r"^(debconf|Warning|E:): |"
    r"Performing one time database migration|"
    r"sqlite-migration|Database migration complete|"
    r"^The `oz` CLI)"
)


def _clean(text: str) -> str:
    return _ansi_re.sub("", text).strip()


def _extract_response(raw: str) -> str:
    """Strip internal agent command traces, keeping only the conversational response."""
    lines = raw.splitlines()
    kept = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("$ ") or stripped.startswith("> "):
            continue
        if stripped.startswith("/usr/bin/bash:"):
            continue
        if _noise_re.match(stripped):
            continue
        kept.append(stripped)
    return "\n".join(kept) if kept else raw.strip()


def _sse(event_type: str, content: str) -> str:
    return f"data: {json.dumps({'type': event_type, 'content': content})}\n\n"


def _dt(val):
    return val.isoformat() if val else None
