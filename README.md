# Project Alchemist

Project Alchemist is a no-build AI PM web app that turns a raw idea into a structured project: analysis, technical requirements, roadmap, backlog, architecture, database design, stack recommendation, difficulty score, dashboard, search, and export.

## Architecture

```text
GitHub Pages
  -> HTML + CSS + JavaScript frontend
  -> Supabase REST API
  -> PostgreSQL
```

AI can run in three modes:

- `demo`: local structured generator, safe for public deployment.
- `openai`: direct OpenAI REST call from the browser.
- `gemini`: direct Gemini REST call from the browser.

Do not publish secret AI keys in a public GitHub Pages repository. Browser keys are visible to visitors. For production, move AI calls behind a protected service or a Supabase Edge Function.

## File Structure

```text
index.html       Main application shell
style.css        Responsive AI Studio interface
app.js           AI generation, Supabase REST, dashboard, search, export
config.js        Supabase and AI provider configuration
supabase.sql     PostgreSQL schema, indexes, RLS policies
README.md        Setup and deployment guide
```

## ER Diagram

```text
projects
  1--1 project_analysis
  1--1 project_requirements
  1--N project_tasks
  1--N project_roadmaps
  1--1 project_architecture
  1--N project_stack
```

## Local Run

Open the folder in a terminal and run:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

You can also open `index.html` directly, but a local server is closer to GitHub Pages behavior.

## Supabase Setup

1. Create a Supabase project.
2. Open SQL Editor.
3. Paste and run `supabase.sql`.
4. Copy your project URL and publishable anon key.
5. Update `config.js`:

```js
window.PROJECT_ALCHEMIST_CONFIG = {
  supabaseUrl: "https://your-project.supabase.co",
  supabaseRestUrl: "https://your-project.supabase.co/rest/v1",
  supabaseAnonKey: "your-publishable-anon-key",
  aiProvider: "demo"
};
```

The included schema enables public anon read/write policies so GitHub Pages can work without auth. For a real product, add authentication and tighten policies by user ownership.

## OpenAI API Setup

For a quick private test, set:

```js
aiProvider: "openai",
openAiApiKey: "your-openai-key",
openAiModel: "gpt-4.1-mini"
```

For production, do not expose this key in `config.js`. Put the OpenAI call behind a secure backend or Supabase Edge Function.

## Gemini API Setup

For a quick private test, set:

```js
aiProvider: "gemini",
geminiApiKey: "your-gemini-key",
geminiModel: "gemini-1.5-flash"
```

Again, do not commit a real Gemini key to a public repository.

## GitHub Pages Deployment

1. Push these files to the repository root.
2. In GitHub, open Settings -> Pages.
3. Choose the default branch and root folder.
4. Save and wait for GitHub Pages to publish.

No React, Next.js, Node.js, Express, or build step is required.

## SQL Schema

The full schema lives in `supabase.sql` and creates:

- `projects`
- `project_analysis`
- `project_requirements`
- `project_tasks`
- `project_roadmaps`
- `project_architecture`
- `project_stack`

It also adds indexes, timestamp automation, and RLS policies for browser REST access.
