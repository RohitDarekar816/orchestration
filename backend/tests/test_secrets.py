from httpx import AsyncClient


class TestCreateSecret:
    async def test_create_success(self, client: AsyncClient, auth_headers: dict):
        r = await client.post(
            "/api/secrets",
            json={
                "name": "GITHUB_TOKEN",
                "value": "ghp_test123",
            },
            headers=auth_headers,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "GITHUB_TOKEN"
        assert data["scope"] == "user"
        assert "id" in data

    async def test_create_with_scope(self, client: AsyncClient, auth_headers: dict):
        r = await client.post(
            "/api/secrets",
            json={
                "name": "AWS_KEY",
                "value": "AKIA123",
                "scope": "org",
            },
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.json()["scope"] == "org"

    async def test_create_unauthenticated(self, client: AsyncClient):
        r = await client.post(
            "/api/secrets",
            json={
                "name": "NO_AUTH",
                "value": "nope",
            },
        )
        assert r.status_code == 401


class TestListSecrets:
    async def test_list_empty(self, client: AsyncClient, auth_headers: dict):
        r = await client.get("/api/secrets", headers=auth_headers)
        assert r.status_code == 200
        assert r.json() == []

    async def test_list_with_secrets(self, client: AsyncClient, auth_headers: dict):
        await client.post(
            "/api/secrets",
            json={
                "name": "SECRET_A",
                "value": "val_a",
            },
            headers=auth_headers,
        )
        await client.post(
            "/api/secrets",
            json={
                "name": "SECRET_B",
                "value": "val_b",
            },
            headers=auth_headers,
        )

        r = await client.get("/api/secrets", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 2
        names = {s["name"] for s in data}
        assert names == {"SECRET_A", "SECRET_B"}

    async def test_list_does_not_return_values(self, client: AsyncClient, auth_headers: dict):
        await client.post(
            "/api/secrets",
            json={
                "name": "MY_SECRET",
                "value": "sensitive-value",
            },
            headers=auth_headers,
        )

        r = await client.get("/api/secrets", headers=auth_headers)
        data = r.json()
        assert "value" not in data[0]
        assert "value_encrypted" not in data[0]


class TestDeleteSecret:
    async def test_delete_secret(self, client: AsyncClient, auth_headers: dict):
        created = await client.post(
            "/api/secrets",
            json={
                "name": "Delete Me",
                "value": "to-delete",
            },
            headers=auth_headers,
        )
        secret_id = created.json()["id"]

        r = await client.delete(f"/api/secrets/{secret_id}", headers=auth_headers)
        assert r.status_code == 200

        r = await client.get("/api/secrets", headers=auth_headers)
        assert len(r.json()) == 0

    async def test_delete_not_found(self, client: AsyncClient, auth_headers: dict):
        r = await client.delete("/api/secrets/99999", headers=auth_headers)
        assert r.status_code == 404
