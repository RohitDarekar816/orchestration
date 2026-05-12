import asyncio
import json
import os
import sys
from typing import Optional

import httpx
import typer

app = typer.Typer(name="oz", help="Oz — Cloud agent orchestration CLI")

API_BASE = os.environ.get("OZ_API_URL", "http://localhost:8000")
token: Optional[str] = None


def _headers():
    if token:
        return {"Authorization": f"Bearer {token}"}
    return {}


def _api(path: str) -> str:
    return f"{API_BASE}{path}"


@app.command()
def login(email: str = typer.Argument(...), password: str = typer.Argument(...)):
    """Authenticate with the Oz API."""
    global token
    r = httpx.post(
        _api("/api/auth/token"),
        data={"username": email, "password": password},
    )
    if r.status_code != 200:
        typer.echo(f"Error: {r.json().get('detail', 'Login failed')}", err=True)
        raise typer.Exit(1)

    data = r.json()
    token = data["access_token"]
    typer.echo(f"Logged in as {data['user']['full_name']}")


@app.command()
def launch(
    agent: str = typer.Option("opencode", "--agent", "-a", help="Agent type"),
    prompt: str = typer.Option(None, "--prompt", "-p", help="Prompt text"),
    skill: int = typer.Option(None, "--skill", "-s", help="Skill ID"),
    max_runtime: int = typer.Option(3600, "--timeout", "-t", help="Max runtime in seconds"),
):
    """Launch an agent run."""
    body = {
        "agent_type": agent,
        "prompt": prompt,
        "skill_id": skill,
        "max_runtime": max_runtime,
    }
    r = httpx.post(_api("/api/agents/launch"), json=body, headers=_headers())
    if r.status_code != 200:
        typer.echo(f"Error: {r.json().get('detail', 'Launch failed')}", err=True)
        raise typer.Exit(1)

    data = r.json()
    typer.echo(f"Agent launched: id={data['id']}, status={data['status']}")
    return data["id"]


@app.command()
def run(
    agent_id: int = typer.Argument(..., help="Agent run ID"),
):
    """Execute a pending agent run."""
    r = httpx.post(_api(f"/api/agents/{agent_id}/run"), headers=_headers())
    if r.status_code != 200:
        typer.echo(f"Error: {r.json().get('detail', 'Run failed')}", err=True)
        raise typer.Exit(1)

    data = r.json()
    typer.echo(f"Agent {agent_id}: status={data['status']}")


@app.command()
def status(
    agent_id: int = typer.Argument(..., help="Agent run ID"),
):
    """Get agent run status."""
    r = httpx.get(_api(f"/api/agents/{agent_id}"), headers=_headers())
    if r.status_code != 200:
        typer.echo(f"Error: {r.json().get('detail', 'Not found')}", err=True)
        raise typer.Exit(1)

    data = r.json()
    typer.echo(f"ID: {data['id']}")
    typer.echo(f"Agent: {data['agent_type']}")
    typer.echo(f"Status: {data['status']}")
    typer.echo(f"Started: {data['started_at']}")
    typer.echo(f"Finished: {data['finished_at']}")
    typer.echo(f"Exit code: {data['exit_code']}")


@app.command()
def cancel(
    agent_id: int = typer.Argument(..., help="Agent run ID"),
):
    """Cancel a running agent."""
    r = httpx.post(_api(f"/api/agents/{agent_id}/cancel"), headers=_headers())
    if r.status_code != 200:
        typer.echo(f"Error: {r.json().get('detail', 'Cancel failed')}", err=True)
        raise typer.Exit(1)

    typer.echo(f"Agent {agent_id} cancelled")


@app.command()
def logs(
    agent_id: int = typer.Argument(..., help="Agent run ID"),
    follow: bool = typer.Option(False, "--follow", "-f", help="Follow logs"),
):
    """View agent logs."""
    r = httpx.get(_api(f"/api/agents/{agent_id}/logs"), headers=_headers())
    if r.status_code != 200:
        typer.echo(f"Error: {r.json().get('detail', 'Not found')}", err=True)
        raise typer.Exit(1)

    entries = r.json()
    for entry in entries:
        prefix = f"[{entry['stream']}]" if entry["stream"] != "stdout" else ""
        typer.echo(f"{prefix} {entry['content']}")

    if follow:
        _follow_logs(agent_id)


def _follow_logs(agent_id: int):
    import time
    last_id = 0
    try:
        while True:
            r = httpx.get(
                _api(f"/api/agents/{agent_id}/logs"),
                headers=_headers(),
            )
            entries = r.json()
            for entry in entries:
                if entry.get("id", 0) > last_id:
                    typer.echo(entry["content"])
                    last_id = entry["id"]
            time.sleep(1)
    except KeyboardInterrupt:
        pass


@app.command()
def list(
    status_filter: str = typer.Option(None, "--status", "-s", help="Filter by status"),
    limit: int = typer.Option(20, "--limit", "-l", help="Max results"),
):
    """List agent runs."""
    params = {"limit": limit}
    if status_filter:
        params["status"] = status_filter

    r = httpx.get(_api("/api/agents"), params=params, headers=_headers())
    if r.status_code != 200:
        typer.echo(f"Error: {r.json().get('detail', 'List failed')}", err=True)
        raise typer.Exit(1)

    agents = r.json()
    if not agents:
        typer.echo("No agent runs found")
        return

    for a in agents:
        typer.echo(f"  {a['id']:>5}  {a['agent_type']:<15} {a['status']:<15} {a.get('created_at', '')}")


@app.command()
def skill():
    """Manage skills."""
    typer.echo("Use: oz skill create|list|delete")


@app.command()
def schedule():
    """Manage schedules."""
    typer.echo("Use: oz schedule create|list|toggle")


if __name__ == "__main__":
    app()
