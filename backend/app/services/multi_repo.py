import json
import os
import shutil
import tempfile
from typing import Optional

from git import Repo, GitCommandError


class MultiRepoWorkspace:
    """Manages a workspace with multiple git repos for cross-repo agent operations."""

    def __init__(self, work_dir: str):
        self.work_dir = work_dir
        self.repos: dict[str, Repo] = {}

    def clone_repos(self, repo_specs: list[dict]) -> dict[str, str]:
        paths = {}
        for spec in repo_specs:
            name = spec.get("name", spec["url"].split("/")[-1].replace(".git", ""))
            clone_path = os.path.join(self.work_dir, name)

            if os.path.exists(clone_path):
                shutil.rmtree(clone_path, ignore_errors=True)

            Repo.clone_from(spec["url"], clone_path, branch=spec.get("branch", "main"))
            repo = Repo(clone_path)
            self.repos[name] = repo
            paths[name] = clone_path

        return paths

    def create_prs(self, branch_name: str, message: str) -> list[dict]:
        results = []
        for name, repo in self.repos.items():
            try:
                branch = repo.create_head(branch_name)
                branch.checkout()
                repo.index.add("*")
                repo.index.commit(message)
                origin = repo.remotes.origin
                origin.push(f"refs/heads/{branch_name}:refs/heads/{branch_name}")
                results.append({"repo": name, "branch": branch_name, "status": "pushed"})
            except GitCommandError as e:
                results.append({"repo": name, "error": str(e)})
        return results

    def cleanup(self):
        shutil.rmtree(self.work_dir, ignore_errors=True)


def create_workspace(agent_run_id: int) -> MultiRepoWorkspace:
    base = tempfile.gettempdir()
    work_dir = os.path.join(base, "oz", "workspaces", str(agent_run_id))
    os.makedirs(work_dir, exist_ok=True)
    return MultiRepoWorkspace(work_dir)
