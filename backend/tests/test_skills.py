from unittest.mock import AsyncMock, patch

from httpx import AsyncClient


class TestCreateSkill:
    async def test_create_success(self, client: AsyncClient, auth_headers: dict):
        r = await client.post(
            "/api/skills",
            json={
                "name": "Test Skill",
                "description": "A test skill",
                "agent_type": "opencode",
                "system_prompt": "You are a helpful assistant.",
            },
            headers=auth_headers,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "Test Skill"
        assert data["agent_type"] == "opencode"
        assert data["version"] == 1

    async def test_create_minimal(self, client: AsyncClient, auth_headers: dict):
        r = await client.post(
            "/api/skills",
            json={
                "name": "Minimal Skill",
                "agent_type": "claude-code",
            },
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.json()["name"] == "Minimal Skill"

    async def test_create_unauthenticated(self, client: AsyncClient):
        r = await client.post(
            "/api/skills",
            json={
                "name": "No Auth",
                "agent_type": "opencode",
            },
        )
        assert r.status_code == 401


class TestListSkills:
    async def test_list_empty(self, client: AsyncClient, auth_headers: dict):
        r = await client.get("/api/skills", headers=auth_headers)
        assert r.status_code == 200
        assert r.json() == []

    async def test_list_with_skills(self, client: AsyncClient, auth_headers: dict):
        await client.post(
            "/api/skills",
            json={
                "name": "Skill A",
                "agent_type": "opencode",
            },
            headers=auth_headers,
        )
        await client.post(
            "/api/skills",
            json={
                "name": "Skill B",
                "agent_type": "codex",
            },
            headers=auth_headers,
        )

        r = await client.get("/api/skills", headers=auth_headers)
        assert r.status_code == 200
        assert len(r.json()) == 2


class TestGetSkill:
    async def test_get_skill(self, client: AsyncClient, auth_headers: dict):
        created = await client.post(
            "/api/skills",
            json={
                "name": "Get Test",
                "agent_type": "opencode",
                "system_prompt": "System prompt here",
            },
            headers=auth_headers,
        )
        skill_id = created.json()["id"]

        r = await client.get(f"/api/skills/{skill_id}", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "Get Test"
        assert data["system_prompt"] == "System prompt here"

    async def test_get_skill_not_found(self, client: AsyncClient, auth_headers: dict):
        r = await client.get("/api/skills/99999", headers=auth_headers)
        assert r.status_code == 404


class TestUpdateSkill:
    async def test_update_skill(self, client: AsyncClient, auth_headers: dict):
        created = await client.post(
            "/api/skills",
            json={
                "name": "Before",
                "agent_type": "opencode",
            },
            headers=auth_headers,
        )
        skill_id = created.json()["id"]

        r = await client.put(
            f"/api/skills/{skill_id}",
            json={
                "name": "After",
                "description": "Updated description",
            },
            headers=auth_headers,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "After"
        assert data["version"] == 2

    async def test_update_not_found(self, client: AsyncClient, auth_headers: dict):
        r = await client.put("/api/skills/99999", json={"name": "Nope"}, headers=auth_headers)
        assert r.status_code == 404


class TestDeleteSkill:
    async def test_delete_skill(self, client: AsyncClient, auth_headers: dict):
        created = await client.post(
            "/api/skills",
            json={
                "name": "Delete Me",
                "agent_type": "opencode",
            },
            headers=auth_headers,
        )
        skill_id = created.json()["id"]

        r = await client.delete(f"/api/skills/{skill_id}", headers=auth_headers)
        assert r.status_code == 200

        r = await client.get(f"/api/skills/{skill_id}", headers=auth_headers)
        assert r.status_code == 404

    async def test_delete_not_found(self, client: AsyncClient, auth_headers: dict):
        r = await client.delete("/api/skills/99999", headers=auth_headers)
        assert r.status_code == 404


class TestExecuteSkill:
    async def test_execute_skill(self, client: AsyncClient, auth_headers: dict):
        created = await client.post(
            "/api/skills",
            json={
                "name": "Exec Skill",
                "agent_type": "opencode",
                "system_prompt": "You are a bot.",
            },
            headers=auth_headers,
        )
        skill_id = created.json()["id"]

        with patch("app.routes.skills._run_skill_background", new_callable=AsyncMock):
            r = await client.post(
                f"/api/skills/{skill_id}/execute",
                json={
                    "prompt": "Do something",
                },
                headers=auth_headers,
            )
            assert r.status_code == 200
            data = r.json()
            assert data["agent_type"] == "opencode"
            assert "Skill" in data["message"]

    async def test_execute_skill_not_found(self, client: AsyncClient, auth_headers: dict):
        r = await client.post(
            "/api/skills/99999/execute",
            json={
                "prompt": "Do something",
            },
            headers=auth_headers,
        )
        assert r.status_code == 404
