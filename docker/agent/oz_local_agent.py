#!/usr/bin/env python3
"""
Lightweight local agent for small LLMs (e.g. Qwen 2.5 1.5B via llama-cpp).

Strategy:
  1. Ask the LLM to emit a bash script that accomplishes the task.
  2. Execute it.
  3. Feed stdout/stderr back to the LLM for a plain-text summary.
  4. Print ONLY the final summary to stdout; all debug goes to stderr.

Callers (DockerAgentRunner) collect stdout only, so users see a clean result.
"""

import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
import json

LLAMACPP_URL = os.environ.get("OPENAI_BASE_URL", "http://localhost:11435/v1")
API_KEY      = os.environ.get("OPENAI_API_KEY", "sk-local")
MODEL        = os.environ.get("OZ_LOCAL_MODEL", "gpt-4o-mini")
MAX_TOKENS   = int(os.environ.get("OZ_LOCAL_MAX_TOKENS", "1024"))
TEMPERATURE  = float(os.environ.get("OZ_LOCAL_TEMPERATURE", "0.1"))


def log(msg: str) -> None:
    """Debug output — goes to stderr so callers only see the clean result on stdout."""
    print(msg, file=sys.stderr, flush=True)


def llm(messages: list[dict]) -> str:
    payload = json.dumps({
        "model": MODEL,
        "messages": messages,
        "max_tokens": MAX_TOKENS,
        "temperature": TEMPERATURE,
    }).encode()

    req = urllib.request.Request(
        f"{LLAMACPP_URL}/chat/completions",
        data=payload,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {API_KEY}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            data = json.loads(resp.read())
        return data["choices"][0]["message"]["content"].strip()
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        raise RuntimeError(f"LLM request failed {e.code}: {body}") from e


def extract_bash(text: str) -> str | None:
    """Pull the first ```bash ... ``` or ``` ... ``` block, or a bare single-line command."""
    m = re.search(r"```(?:bash|sh)?\s*\n(.*?)```", text, re.DOTALL)
    if m:
        return m.group(1).strip()
    stripped = text.strip()
    if stripped.startswith(("#!", "echo ", "ls ", "df ", "docker ", "ssh ", "cat ", "ps ", "systemctl ", "git ", "sshpass ")):
        return stripped
    return None


def run_bash(script: str) -> tuple[str, int]:
    result = subprocess.run(
        ["bash", "-c", script],
        capture_output=True,
        text=True,
        timeout=300,
    )
    combined = ""
    if result.stdout.strip():
        combined += result.stdout
    if result.stderr.strip():
        combined += "\nSTDERR:\n" + result.stderr
    return combined.strip(), result.returncode


def main():
    task = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else os.environ.get("OZ_PROMPT", "")
    if not task:
        print("ERROR: No task provided.", file=sys.stderr)
        sys.exit(1)

    log(f"[oz-local] Task: {task[:200]}")

    plan_messages = [
        {
            "role": "system",
            "content": (
                "You are a Linux systems administrator. "
                "When given a task, output ONLY a bash script inside a ```bash code block. "
                "Do not explain. Do not add prose. Just the code block. "
                "Use safe, non-destructive commands.\n\n"
                "SSH RULES — follow exactly:\n"
                "- If the task gives a password, ALWAYS use: sshpass -p 'PASSWORD' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 USER@HOST 'COMMAND'\n"
                "- If the task gives no password (uses key auth), use: ssh -o StrictHostKeyChecking=no -i /tmp/oz_ssh_key USER@HOST 'COMMAND'\n"
                "- Always use SSH port 22 unless the task specifies a different port.\n"
                "- Wrap the password in single quotes. If the password contains a single quote, escape it as '\\''.\n"
                "- Run the remote command inline in the ssh call, do not use interactive sessions."
            ),
        },
        {"role": "user", "content": task},
    ]

    log("[oz-local] Asking LLM for a plan...")
    plan = llm(plan_messages)
    log(f"[oz-local] LLM response:\n{plan}")

    script = extract_bash(plan)
    if not script:
        # Model gave prose instead of a script — output it directly as the result
        log("[oz-local] No code block found; using LLM response as result.")
        print(plan, flush=True)
        sys.exit(0)

    log(f"[oz-local] Executing:\n{script}")

    try:
        output, code = run_bash(script)
    except subprocess.TimeoutExpired:
        print("The command timed out after 300 seconds.", flush=True)
        sys.exit(1)

    log(f"[oz-local] Exit code: {code}")
    log(f"[oz-local] Raw output:\n{output}")

    summary_messages = [
        {
            "role": "system",
            "content": (
                "You are a helpful infrastructure assistant reporting results to a user. "
                "Write ONLY plain prose — no markdown, no code blocks, no backticks, no bullet lists. "
                "Speak in first person: 'I logged in...', 'I found...', 'There are X...'. "
                "Be concise: one or two short sentences covering the key finding, "
                "then offer to provide more detail if needed. "
                "Example: 'I logged into the server and found 14 Docker containers running. "
                "Let me know if you'd like more details on any of them.'"
            ),
        },
        {
            "role": "user",
            "content": (
                f"Task: {task}\n\n"
                f"Script exit code: {code}\n"
                f"Script output:\n{output[:3000]}\n\n"
                "Now summarise the result for the user in plain prose only."
            ),
        },
    ]

    # If the raw output looks like a known file format, preserve it with
    # [FILE:...][/FILE] markers so the Oz skill can render a file card.
    FILE_SIGNATURES: list[tuple[str, str]] = [
        (r'^version:\s*["\']\d.*\bservices:', 'docker-compose.yml'),
        (r'^FROM\s+\S+', 'Dockerfile'),
        (r'^\{.*\}', 'output.json'),
        (r'^#!', 'script.sh'),
    ]
    first_200 = output[:200].strip()
    detected_file = ''
    for pattern, name in FILE_SIGNATURES:
        if re.search(pattern, first_200, re.DOTALL):
            detected_file = name
            break

    if detected_file:
        # Bypass LLM summary for file content — output directly with markers.
        log(f"[oz-local] Detected file content ({detected_file}), bypassing summary LLM.")
        print(f"[FILE:{detected_file}]", flush=True)
        print(output.strip(), flush=True)
        print("[/FILE]", flush=True)
        print(f"Retrieved {detected_file} ({len(output)} bytes).", flush=True)
        sys.exit(0)

    log("[oz-local] Asking LLM for summary...")
    summary = llm(summary_messages)

    # Strip any code fences the small model generates despite instructions.
    summary = re.sub(r"```[a-z]*\n?", "", summary).replace("```", "").strip()

    # Only the clean summary goes to stdout — this is what the user sees.
    print(summary, flush=True)
    sys.exit(0 if code == 0 else 1)


if __name__ == "__main__":
    main()
