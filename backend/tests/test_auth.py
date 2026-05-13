from httpx import AsyncClient


class TestRegister:
    async def test_register_success(self, client: AsyncClient):
        r = await client.post(
            "/api/auth/register",
            json={
                "email": "new@test.com",
                "password": "secret123",
                "full_name": "New User",
            },
        )
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == "new@test.com"
        assert data["full_name"] == "New User"
        assert "id" in data

    async def test_register_duplicate_email(self, client: AsyncClient):
        await client.post(
            "/api/auth/register",
            json={
                "email": "dup@test.com",
                "password": "secret123",
                "full_name": "User1",
            },
        )
        r = await client.post(
            "/api/auth/register",
            json={
                "email": "dup@test.com",
                "password": "secret456",
                "full_name": "User2",
            },
        )
        assert r.status_code == 400
        assert "already registered" in r.json()["detail"]

    async def test_register_missing_fields(self, client: AsyncClient):
        r = await client.post(
            "/api/auth/register",
            json={
                "email": "missing@test.com",
            },
        )
        assert r.status_code == 422


class TestLogin:
    async def test_login_success(self, client: AsyncClient):
        await client.post(
            "/api/auth/register",
            json={
                "email": "login@test.com",
                "password": "mypassword",
                "full_name": "Login User",
            },
        )
        r = await client.post(
            "/api/auth/token",
            data={
                "username": "login@test.com",
                "password": "mypassword",
            },
        )
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["email"] == "login@test.com"

    async def test_login_wrong_password(self, client: AsyncClient):
        await client.post(
            "/api/auth/register",
            json={
                "email": "wrong@test.com",
                "password": "correct",
                "full_name": "Wrong",
            },
        )
        r = await client.post(
            "/api/auth/token",
            data={
                "username": "wrong@test.com",
                "password": "incorrect",
            },
        )
        assert r.status_code == 401

    async def test_login_nonexistent_user(self, client: AsyncClient):
        r = await client.post(
            "/api/auth/token",
            data={
                "username": "nobody@test.com",
                "password": "anything",
            },
        )
        assert r.status_code == 401


class TestMe:
    async def test_get_me_authenticated(self, client: AsyncClient, auth_headers: dict):
        r = await client.get("/api/auth/me", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == "test@test.com"
        assert data["full_name"] == "Test User"

    async def test_get_me_unauthenticated(self, client: AsyncClient):
        r = await client.get("/api/auth/me")
        assert r.status_code == 401

    async def test_get_me_invalid_token(self, client: AsyncClient):
        r = await client.get("/api/auth/me", headers={"Authorization": "Bearer invalid"})
        assert r.status_code == 401
