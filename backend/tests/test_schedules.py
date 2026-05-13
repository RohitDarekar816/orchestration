from httpx import AsyncClient


class TestCreateSchedule:
    async def test_create_success(self, client: AsyncClient, auth_headers: dict):
        r = await client.post(
            "/api/schedules",
            json={
                "name": "Daily Report",
                "cron_expr": "0 9 * * *",
                "agent_type": "opencode",
                "prompt_template": "Generate report",
            },
            headers=auth_headers,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "Daily Report"
        assert data["cron_expr"] == "0 9 * * *"

    async def test_create_invalid_cron(self, client: AsyncClient, auth_headers: dict):
        r = await client.post(
            "/api/schedules",
            json={
                "name": "Bad Cron",
                "cron_expr": "not-a-cron",
                "agent_type": "opencode",
            },
            headers=auth_headers,
        )
        assert r.status_code == 400

    async def test_create_unauthenticated(self, client: AsyncClient):
        r = await client.post(
            "/api/schedules",
            json={
                "name": "No Auth",
                "cron_expr": "0 9 * * *",
                "agent_type": "opencode",
            },
        )
        assert r.status_code == 401


class TestListSchedules:
    async def test_list_empty(self, client: AsyncClient, auth_headers: dict):
        r = await client.get("/api/schedules", headers=auth_headers)
        assert r.status_code == 200
        assert r.json() == []

    async def test_list_with_schedules(self, client: AsyncClient, auth_headers: dict):
        await client.post(
            "/api/schedules",
            json={
                "name": "Sched A",
                "cron_expr": "0 9 * * *",
                "agent_type": "opencode",
            },
            headers=auth_headers,
        )
        await client.post(
            "/api/schedules",
            json={
                "name": "Sched B",
                "cron_expr": "30 18 * * *",
                "agent_type": "codex",
            },
            headers=auth_headers,
        )

        r = await client.get("/api/schedules", headers=auth_headers)
        assert r.status_code == 200
        assert len(r.json()) == 2


class TestToggleSchedule:
    async def test_toggle_active(self, client: AsyncClient, auth_headers: dict):
        created = await client.post(
            "/api/schedules",
            json={
                "name": "Toggle Test",
                "cron_expr": "0 9 * * *",
                "agent_type": "opencode",
            },
            headers=auth_headers,
        )
        sched_id = created.json()["id"]

        r = await client.post(f"/api/schedules/{sched_id}/toggle?active=false", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["active"] is False

        r = await client.post(f"/api/schedules/{sched_id}/toggle?active=true", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["active"] is True

    async def test_toggle_not_found(self, client: AsyncClient, auth_headers: dict):
        r = await client.post("/api/schedules/99999/toggle?active=true", headers=auth_headers)
        assert r.status_code == 404
