# Oz — 5-Minute Presentation Script

*Total speaking time: ~4 min 30 sec at a natural pace. Time cues are in brackets. Aim to glance at the slide, then talk — don't read it word-for-word.*

---

### Slide 1 — Title  ⏱ ~10s
Hi everyone, I'm Rohit, founder of Oz. Oz is an AI agent orchestration platform — it lets you run your entire infrastructure with plain English, instead of memorizing commands and juggling dashboards.

### Slide 2 — Agenda  ⏱ ~10s
In the next five minutes I'll cover the problem we solve, the market, how Oz actually works under the hood, and what we're raising.

### Slide 3 — Problem, Solution & ROI  ⏱ ~35s
Today engineers lose 30 to 40% of their time to toil. Every task needs specialized command-line knowledge, teams jump between seven-plus tools, and automation like Ansible is brittle. Oz fixes this with one chat and a fleet of AI agents that reason, adapt, and execute live on your systems. The payoff: a third of engineering time freed, plain English to real action in under five seconds, all at 75 to 80% margins.

### Slide 4 — Impact & Analysis  ⏱ ~30s
The opportunity is about a $50 billion combined market across DevOps tooling, AIOps, and cloud management. Our buyers are DevOps and platform teams first, then CTOs cutting overhead, and agencies running many client servers. The tailwinds are strong — enterprise AI adoption is growing 40% a year and infrastructure is outpacing headcount. This is the "ChatGPT for DevOps" moment.

### Slide 5 — Required Skillset & Support  ⏱ ~25s
The product is already real, built on a modern stack: FastAPI, PostgreSQL, Redis, Leon AI for natural language, and Cloudflare Workers AI for the agents — all secured with encryption and a secrets vault. It's agent-agnostic, so it plugs into Claude Code, OpenAI, Gemini, and more. And I've built it end-to-end myself — backend, frontend, and AI.

### Slide 6 — Competitor Analysis  ⏱ ~30s
Compared to the field — Ansible and Terraform need upfront authoring, Copilot only suggests code, and Datadog just shows you dashboards. Oz is different: it understands natural language, executes live operations, and runs a fleet of edge agents. The moat is combining all three — no competitor does that today.

### Slide 7 — POC / MVP Scope  ⏱ ~30s
This isn't a concept — it's a working product. Four production agents are live with 51 tools: full Docker container management, server health monitoring, deep Proxmox virtualization control, and a secure shell sandbox. And it's all on a templated path to scale to 101 agents.

### Slide 8 — Infrastructure & Deployment  ⏱ ~25s
Architecture is clean: a chat layer, Leon AI for intent, our control plane, and agent execution. Deployment is one command — the full stack is live in under 60 seconds on any Docker host. Agents run two ways: Cloudflare Edge for sub-100-millisecond global speed, or a local sandbox for secure SSH tasks.

### Slide 9 — AI Usage: Ideation to Implementation  ⏱ ~30s
Here's the flow in five steps: you ask in plain English, Leon extracts intent, Oz resolves the target, an edge worker running Llama 4 Scout does the tool-calling, and you get a clean result in under five seconds. Smart touches like dynamic tool selection and prompt caching cut input tokens by 75 to 80%.

### Slide 10 — Implementation Plan & Modules  ⏱ ~25s
The roadmap covers 101 agents across ten categories — four are live today, 97 planned, each about two to four hours to build on our template. Over twelve months the milestones run from public beta, to paid tiers, to enterprise — targeting $1M ARR.

### Slide 11 — Budget for AI MVP  ⏱ ~30s
We're raising a seed round: 45% to engineering, 20% to completing the agent fleet, 25% to go-to-market, and 10% to infrastructure. Pricing runs from free to enterprise, with strong unit economics — 75 to 80% gross margin and a 3-to-1 LTV-to-CAC. These funds take us to $1M ARR within twelve months.

### Slide 12 — Thank You  ⏱ ~10s
That's Oz — running your infrastructure with a conversation. Thank you. I'd love to take any questions.

---

**Quick delivery tips**
- Practice once with a timer; if you run long, trim the examples in slides 7 and 9 first.
- Pause briefly between sections (after slides 3, 6, and 9) — it reads as confidence, not lost time.
- Land the last line on slide 11 ("$1M ARR within twelve months") with energy; that's your ask.
