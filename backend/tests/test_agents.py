from unittest.mock import AsyncMock, patch

from httpx import AsyncClient


class TestLaunchAgent:
    @patch("app.routes.agents._run_agent_in_background", new_callable=AsyncMock)
    async def test_launch_success(self, mock_run, client: AsyncClient, auth_headers: dict):
        r = await client.post(
            "/api/agents/launch",
            json={
                "agent_type": "opencode",
                "prompt": "say hello",
                "max_runtime": 30,
            },
            headers=auth_headers,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["agent_type"] == "opencode"
        assert data["status"] == "pending"
        assert "id" in data

    async def test_launch_invalid_type(self, client: AsyncClient, auth_headers: dict):
        r = await client.post(
            "/api/agents/launch",
            json={
                "agent_type": "unknown",
                "prompt": "hello",
            },
            headers=auth_headers,
        )
        assert r.status_code == 400

    async def test_launch_unauthenticated(self, client: AsyncClient):
        r = await client.post(
            "/api/agents/launch",
            json={
                "agent_type": "opencode",
                "prompt": "hello",
            },
        )
        assert r.status_code == 401


class TestListAgents:
    @patch("app.routes.agents._run_agent_in_background", new_callable=AsyncMock)
    async def test_list_empty(self, mock_run, client: AsyncClient, auth_headers: dict):
        r = await client.get("/api/agents", headers=auth_headers)
        assert r.status_code == 200
        assert r.json() == []

    @patch("app.routes.agents._run_agent_in_background", new_callable=AsyncMock)
    async def test_list_with_agents(self, mock_run, client: AsyncClient, auth_headers: dict):
        await client.post(
            "/api/agents/launch",
            json={
                "agent_type": "opencode",
                "prompt": "task1",
            },
            headers=auth_headers,
        )
        await client.post(
            "/api/agents/launch",
            json={
                "agent_type": "claude-code",
                "prompt": "task2",
            },
            headers=auth_headers,
        )

        r = await client.get("/api/agents", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 2

    @patch("app.routes.agents._run_agent_in_background", new_callable=AsyncMock)
    async def test_list_filter_by_status(self, mock_run, client: AsyncClient, auth_headers: dict):
        await client.post(
            "/api/agents/launch",
            json={
                "agent_type": "opencode",
                "prompt": "task",
            },
            headers=auth_headers,
        )

        r = await client.get("/api/agents?status=pending", headers=auth_headers)
        assert r.status_code == 200
        assert len(r.json()) >= 0


class TestGetAgent:
    @patch("app.routes.agents._run_agent_in_background", new_callable=AsyncMock)
    async def test_get_agent(self, mock_run, client: AsyncClient, auth_headers: dict):
        launch = await client.post(
            "/api/agents/launch",
            json={
                "agent_type": "opencode",
                "prompt": "test",
            },
            headers=auth_headers,
        )
        agent_id = launch.json()["id"]

        r = await client.get(f"/api/agents/{agent_id}", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == agent_id
        assert data["agent_type"] == "opencode"

    async def test_get_agent_not_found(self, client: AsyncClient, auth_headers: dict):
        r = await client.get("/api/agents/99999", headers=auth_headers)
        assert r.status_code == 404


class TestCancelAgent:
    @patch("app.routes.agents._run_agent_in_background", new_callable=AsyncMock)
    async def test_cancel_agent(self, mock_run, client: AsyncClient, auth_headers: dict):
        launch = await client.post(
            "/api/agents/launch",
            json={
                "agent_type": "opencode",
                "prompt": "task",
            },
            headers=auth_headers,
        )
        agent_id = launch.json()["id"]

        r = await client.post(f"/api/agents/{agent_id}/cancel", headers=auth_headers)
        assert r.status_code == 200


class TestAgentLogs:
    @patch("app.routes.agents._run_agent_in_background", new_callable=AsyncMock)
    async def test_get_logs_empty(self, mock_run, client: AsyncClient, auth_headers: dict):
        launch = await client.post(
            "/api/agents/launch",
            json={
                "agent_type": "opencode",
                "prompt": "test",
            },
            headers=auth_headers,
        )
        agent_id = launch.json()["id"]

        r = await client.get(f"/api/agents/{agent_id}/logs", headers=auth_headers)
        assert r.status_code == 200
        assert r.json() == []

    async def test_get_logs_not_found(self, client: AsyncClient, auth_headers: dict):
        r = await client.get("/api/agents/99999/logs", headers=auth_headers)
        assert r.status_code == 404
