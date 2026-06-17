(function () {
  "use strict";

  const config = window.PROJECT_ALCHEMIST_CONFIG || {};
  const state = {
    projects: [],
    selectedProject: null,
    isSaving: false
  };

  ensureGeminiKeyPanel();

  const el = {
    form: document.getElementById("ideaForm"),
    ideaInput: document.getElementById("ideaInput"),
    sampleBtn: document.getElementById("sampleBtn"),
    analysisState: document.getElementById("analysisState"),
    resultPanel: document.getElementById("resultPanel"),
    projectsList: document.getElementById("projectsList"),
    searchInput: document.getElementById("searchInput"),
    projectCount: document.getElementById("projectCount"),
    avgDifficulty: document.getElementById("avgDifficulty"),
    activeProjects: document.getElementById("activeProjects"),
    connectionStatus: document.getElementById("connectionStatus"),
    reloadProjectsBtn: document.getElementById("reloadProjectsBtn"),
    exportJsonBtn: document.getElementById("exportJsonBtn"),
    exportMarkdownBtn: document.getElementById("exportMarkdownBtn"),
    geminiKeyInput: document.getElementById("geminiKeyInput"),
    saveGeminiKeyBtn: document.getElementById("saveGeminiKeyBtn"),
    clearGeminiKeyBtn: document.getElementById("clearGeminiKeyBtn"),
    geminiKeyHint: document.getElementById("geminiKeyHint")
  };

  const SAMPLE_IDEA = "Створити медичного Telegram-бота, який відповідає на часті питання пацієнтів, записує на консультації та нагадує про прийом ліків.";

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    setConnectionStatus();
    bindEvents();
    loadProjects();
  }

  function bindEvents() {
    el.form.addEventListener("submit", handleAnalyze);
    el.sampleBtn.addEventListener("click", () => {
      el.ideaInput.value = SAMPLE_IDEA;
      el.ideaInput.focus();
    });
    el.searchInput.addEventListener("input", renderProjects);
    el.reloadProjectsBtn.addEventListener("click", loadProjects);
    el.exportJsonBtn.addEventListener("click", () => exportProject("json"));
    el.exportMarkdownBtn.addEventListener("click", () => exportProject("markdown"));
    el.saveGeminiKeyBtn.addEventListener("click", saveGeminiKeyFromInput);
    el.clearGeminiKeyBtn.addEventListener("click", clearGeminiKey);
    el.geminiKeyInput.addEventListener("input", () => {
      el.geminiKeyHint.textContent = "Натисніть “Зберегти ключ”, щоб використовувати Gemini.";
    });
  }

  function ensureGeminiKeyPanel() {
    if (document.getElementById("geminiKeyInput")) return;
    const form = document.getElementById("ideaForm");
    if (!form) return;

    const panel = document.createElement("section");
    panel.className = "key-panel";
    panel.setAttribute("aria-labelledby", "geminiKeyTitle");
    panel.innerHTML = `
      <div>
        <p class="eyebrow">Gemini API</p>
        <h3 id="geminiKeyTitle">Ключ для AI аналізу</h3>
        <p id="geminiKeyHint">Вставте ключ один раз. Він збережеться тільки у цьому браузері.</p>
      </div>
      <div class="key-controls">
        <label for="geminiKeyInput">Gemini API key</label>
        <input id="geminiKeyInput" type="password" autocomplete="off" placeholder="Вставте Gemini API key">
        <div class="form-actions">
          <button id="saveGeminiKeyBtn" class="secondary-button" type="button">Зберегти ключ</button>
          <button id="clearGeminiKeyBtn" class="secondary-button" type="button">Очистити</button>
        </div>
      </div>
    `;
    form.insertAdjacentElement("afterend", panel);
  }

  function setConnectionStatus() {
    const hasSupabase = Boolean(config.supabaseRestUrl && config.supabaseAnonKey);
    const aiMode = config.aiProvider === "demo" ? "Demo AI" : config.aiProvider || "Demo AI";
    const geminiReady = config.aiProvider !== "gemini" || Boolean(getStoredGeminiApiKey());
    el.connectionStatus.textContent = hasSupabase ? `Supabase + ${aiMode}` : `${aiMode}, local storage`;
    if (config.aiProvider === "gemini") {
      el.connectionStatus.textContent += geminiReady ? " ready" : " key needed";
      el.geminiKeyHint.textContent = geminiReady
        ? "Gemini key збережено у цьому браузері."
        : "Вставте Gemini key перед аналізом або додаток використає demo AI.";
    }
  }

  async function handleAnalyze(event) {
    event.preventDefault();
    const idea = el.ideaInput.value.trim();
    if (!idea) return;

    setLoading(true);
    try {
      const analysis = await generateProjectPlan(idea);
      const savedProject = await persistProject(analysis);
      state.selectedProject = savedProject || analysis;
      if (savedProject) {
        state.projects = [savedProject, ...state.projects.filter((project) => project.id !== savedProject.id)];
      } else {
        state.projects = [analysis, ...state.projects];
        saveLocalProjects();
      }
      renderAnalysis(state.selectedProject);
      renderProjects();
      showToast(savedProject ? "Проєкт збережено в Supabase." : "Проєкт збережено локально у браузері.");
    } catch (error) {
      console.error(error);
      showToast(error.message || "Не вдалося створити проєкт.");
    } finally {
      setLoading(false);
    }
  }

  function setLoading(isLoading) {
    el.analysisState.hidden = !isLoading;
    el.form.querySelector("button[type='submit']").disabled = isLoading;
  }

  async function generateProjectPlan(idea) {
    if (config.aiProvider === "openai" && config.openAiApiKey) {
      return requestOpenAi(idea);
    }
    if (config.aiProvider === "gemini") {
      return requestGemini(idea);
    }
    return demoAnalyze(idea);
  }

  async function requestOpenAi(idea) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.openAiApiKey}`
      },
      body: JSON.stringify({
        model: config.openAiModel || "gpt-4.1-mini",
        temperature: 0.45,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: getAiSystemPrompt() },
          { role: "user", content: `Ідея: ${idea}` }
        ]
      })
    });
    if (!response.ok) throw new Error("OpenAI API повернув помилку.");
    const data = await response.json();
    return normalizeAiPayload(JSON.parse(data.choices[0].message.content), idea);
  }

  async function requestGemini(idea) {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      el.geminiKeyInput.focus();
      showToast("Вставте Gemini key у поле під ідеєю. Поки використовую demo AI.");
      return demoAnalyze(idea);
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel || "gemini-1.5-flash"}:generateContent?key=${apiKey}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${getAiSystemPrompt()}\n\nІдея: ${idea}` }]
          }
        ],
        generationConfig: {
          temperature: 0.45,
          responseMimeType: "application/json"
        }
      })
    });
    if (!response.ok) throw new Error("Gemini API повернув помилку.");
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return normalizeAiPayload(JSON.parse(text), idea);
  }

  function getGeminiApiKey() {
    if (config.geminiApiKey) return config.geminiApiKey;
    return getStoredGeminiApiKey();
  }

  function getStoredGeminiApiKey() {
    const storageName = config.geminiApiKeyStorageName || "project-alchemist-gemini-key";
    return localStorage.getItem(storageName) || "";
  }

  function saveGeminiKeyFromInput() {
    const key = el.geminiKeyInput.value.trim();
    if (!key) {
      showToast("Поле Gemini key порожнє.");
      return;
    }
    const storageName = config.geminiApiKeyStorageName || "project-alchemist-gemini-key";
    localStorage.setItem(storageName, key);
    el.geminiKeyInput.value = "";
    setConnectionStatus();
    showToast("Gemini key збережено у цьому браузері.");
  }

  function clearGeminiKey() {
    const storageName = config.geminiApiKeyStorageName || "project-alchemist-gemini-key";
    localStorage.removeItem(storageName);
    el.geminiKeyInput.value = "";
    setConnectionStatus();
    showToast("Gemini key очищено.");
  }

  function getAiSystemPrompt() {
    return [
      "Ти AI PM Project Alchemist. Поверни тільки валідний JSON.",
      "Схема: title, summary, businessGoal, targetAudience, mainFeatures[], risks[], monetization[], requirements{goal,functionality[],interfaces[],data[],api[],database[],security[],roadmap[]}, roadmap[{stage,title,description}], tasks[{title,description,priority,complexity}], architecture{frontend,backend,database,aiLayer,hosting,automation}, databaseDesigner{tables[],relationships[],erModel}, techStack[], difficulty{complexity,risk,timeEstimate}, status, progress.",
      "Пріоритет задач тільки: low, medium, high, critical. complexity/risk від 1 до 10."
    ].join(" ");
  }

  function demoAnalyze(idea) {
    const title = createTitle(idea);
    const isBot = /bot|бот|telegram/i.test(idea);
    const isMedical = /мед|health|doctor|лікар|пацієнт/i.test(idea);
    const domain = isMedical ? "медичний сервіс" : isBot ? "автоматизований сервіс" : "цифровий продукт";
    const coreChannel = isBot ? "Telegram Bot API" : "веб-інтерфейс";
    const complexity = clamp(Math.round(idea.length / 28) + (isMedical ? 3 : 1), 5, 9);
    const risk = clamp(complexity + (isMedical ? 1 : 0), 5, 10);

    return normalizeAiPayload({
      title,
      summary: `${title} — це ${domain}, який перетворює користувацький запит на керований процес із даними, автоматизацією та зрозумілими результатами.`,
      businessGoal: "Скоротити час від ідеї до запуску, стандартизувати процес роботи та дати команді прозорий план реалізації.",
      targetAudience: isMedical ? "Клініки, приватні лікарі, адміністратори медичних центрів і пацієнти." : "Підприємці, операційні менеджери, продуктові команди та невеликі бізнеси.",
      mainFeatures: [
        "Прийом і структурування запитів користувача",
        `Основна взаємодія через ${coreChannel}`,
        "AI-аналіз і генерація рекомендацій",
        "Dashboard із проєктами, статусами та прогресом",
        "Експорт результатів у JSON і Markdown"
      ],
      risks: [
        "Неточні AI-відповіді без перевірки експертом",
        "Захист персональних даних і доступів",
        "Залежність від сторонніх API",
        "Недооцінка складності інтеграцій"
      ],
      monetization: [
        "Підписка за кількістю проєктів",
        "Платні шаблони та галузеві сценарії",
        "B2B ліцензія для команд",
        "Преміум інтеграції та автоматизації"
      ],
      requirements: {
        goal: "Створити працюючий MVP, який приймає ідею, аналізує її, формує ТЗ, roadmap, backlog і зберігає результат.",
        functionality: [
          "Форма введення ідеї",
          "AI-аналіз проєкту",
          "Генерація ТЗ, roadmap і задач",
          "Пошук і dashboard",
          "Експорт JSON/Markdown"
        ],
        interfaces: ["Головний екран аналізу", "Dashboard проєктів", "Картка результату", "Панель експорту"],
        data: ["Проєкт", "Аналіз", "Технічне завдання", "Roadmap", "Backlog", "Архітектура", "Tech stack"],
        api: ["Supabase REST API", "OpenAI або Gemini REST API", `${coreChannel} за потреби`],
        database: ["PostgreSQL", "UUID primary keys", "JSONB поля для гнучких AI-результатів", "RLS policies"],
        security: ["Не зберігати секретні AI ключі в публічному репозиторії", "Обмежити Supabase policies", "Валідувати введення користувача"],
        roadmap: ["MVP UI", "AI generator", "Supabase storage", "Dashboard/search", "Export and polish"]
      },
      roadmap: [
        { stage: 1, title: "Discovery", description: "Уточнити користувацькі сценарії, ролі, ризики та дані." },
        { stage: 2, title: "Prototype", description: "Створити статичний інтерфейс і демо-генератор результатів." },
        { stage: 3, title: "AI Integration", description: "Підключити AI REST API та нормалізацію JSON-відповідей." },
        { stage: 4, title: "Data Layer", description: "Налаштувати Supabase, таблиці, RLS і збереження проєктів." },
        { stage: 5, title: "Launch", description: "Опублікувати на GitHub Pages, протестувати адаптивність і експорт." }
      ],
      tasks: [
        { title: "Створити UI головного екрану", description: "Форма ідеї, кнопка аналізу, стани завантаження.", priority: "high", complexity: 4 },
        { title: "Реалізувати AI генератор", description: "REST-виклик, JSON schema, fallback для демо.", priority: "critical", complexity: 7 },
        { title: "Побудувати SQL схему", description: "Таблиці, зв’язки, індекси та policies.", priority: "high", complexity: 6 },
        { title: "Зберігати результати", description: "Записувати project, analysis, ТЗ, roadmap, tasks, stack.", priority: "critical", complexity: 7 },
        { title: "Зробити dashboard і пошук", description: "Показати назву, дату, прогрес, складність, статус.", priority: "medium", complexity: 5 },
        { title: "Додати експорт", description: "Завантаження JSON і Markdown для вибраного проєкту.", priority: "medium", complexity: 3 }
      ],
      architecture: {
        frontend: "HTML + CSS + JavaScript",
        backend: "Supabase REST API",
        database: "PostgreSQL",
        aiLayer: config.aiProvider === "gemini" ? "Gemini REST API" : "OpenAI REST API або demo fallback",
        hosting: "GitHub Pages",
        automation: "n8n для майбутніх сценаріїв"
      },
      databaseDesigner: {
        tables: ["projects", "project_analysis", "project_requirements", "project_tasks", "project_roadmaps", "project_architecture", "project_stack"],
        relationships: [
          "projects 1--1 project_analysis",
          "projects 1--1 project_requirements",
          "projects 1--N project_tasks",
          "projects 1--N project_roadmaps",
          "projects 1--1 project_architecture",
          "projects 1--N project_stack"
        ],
        erModel: "projects(id) -> project_analysis(project_id), project_requirements(project_id), project_tasks(project_id), project_roadmaps(project_id), project_architecture(project_id), project_stack(project_id)"
      },
      techStack: ["HTML", "CSS", "JavaScript", "Supabase", "PostgreSQL", "OpenAI API", "Gemini API optional", "GitHub Pages", isBot ? "Telegram Bot API" : "n8n"],
      difficulty: {
        complexity,
        risk,
        timeEstimate: complexity > 7 ? "4-7 тижнів для MVP" : "2-4 тижні для MVP"
      },
      status: "draft",
      progress: 18
    }, idea);
  }

  function normalizeAiPayload(payload, idea) {
    const now = new Date().toISOString();
    return {
      id: payload.id || crypto.randomUUID(),
      idea,
      title: payload.title || createTitle(idea),
      summary: payload.summary || "",
      businessGoal: payload.businessGoal || "",
      targetAudience: payload.targetAudience || "",
      mainFeatures: ensureArray(payload.mainFeatures),
      risks: ensureArray(payload.risks),
      monetization: ensureArray(payload.monetization),
      requirements: payload.requirements || {},
      roadmap: ensureArray(payload.roadmap),
      tasks: ensureArray(payload.tasks).map((task) => ({
        title: task.title || "Задача",
        description: task.description || "",
        priority: ["low", "medium", "high", "critical"].includes(task.priority) ? task.priority : "medium",
        complexity: Number(task.complexity || task.estimatedComplexity || 5)
      })),
      architecture: payload.architecture || {},
      databaseDesigner: payload.databaseDesigner || {},
      techStack: ensureArray(payload.techStack || payload.stack),
      difficulty: payload.difficulty || { complexity: 5, risk: 5, timeEstimate: "2-4 тижні" },
      status: payload.status || "draft",
      progress: Number(payload.progress || 15),
      created_at: payload.created_at || now
    };
  }

  async function persistProject(project) {
    if (!config.supabaseRestUrl || !config.supabaseAnonKey) return null;
    state.isSaving = true;
    try {
      const saved = await supabaseInsert("projects", {
        title: project.title,
        idea: project.idea,
        status: project.status,
        progress: project.progress,
        difficulty: project.difficulty.complexity,
        risk: project.difficulty.risk,
        time_estimate: project.difficulty.timeEstimate,
        stack_keywords: project.techStack
      });

      const projectId = saved.id;
      await Promise.all([
        supabaseInsert("project_analysis", {
          project_id: projectId,
          summary: project.summary,
          business_goal: project.businessGoal,
          target_audience: project.targetAudience,
          main_features: project.mainFeatures,
          risks: project.risks,
          monetization: project.monetization
        }),
        supabaseInsert("project_requirements", {
          project_id: projectId,
          content: project.requirements
        }),
        supabaseInsert("project_architecture", {
          project_id: projectId,
          frontend: project.architecture.frontend,
          backend: project.architecture.backend,
          database_layer: project.architecture.database,
          ai_layer: project.architecture.aiLayer,
          hosting: project.architecture.hosting,
          automation: project.architecture.automation,
          database_design: project.databaseDesigner
        }),
        ...project.roadmap.map((item) => supabaseInsert("project_roadmaps", {
          project_id: projectId,
          stage: item.stage,
          title: item.title,
          description: item.description
        })),
        ...project.tasks.map((task) => supabaseInsert("project_tasks", {
          project_id: projectId,
          title: task.title,
          description: task.description,
          priority: task.priority,
          estimated_complexity: task.complexity
        })),
        ...project.techStack.map((item) => supabaseInsert("project_stack", {
          project_id: projectId,
          technology: item,
          reason: `Рекомендовано для: ${project.title}`
        }))
      ]);

      return { ...project, id: projectId, created_at: saved.created_at };
    } catch (error) {
      console.warn("Supabase save failed, using local storage.", error);
      showToast("Supabase недоступний. Зберігаю локально.");
      return null;
    } finally {
      state.isSaving = false;
    }
  }

  async function supabaseInsert(table, payload) {
    const response = await fetch(`${trimSlash(config.supabaseRestUrl)}/${table}`, {
      method: "POST",
      headers: supabaseHeaders({ prefer: "return=representation" }),
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Supabase insert failed for ${table}: ${text}`);
    }
    const rows = await response.json();
    return rows[0];
  }

  async function loadProjects() {
    if (!config.supabaseRestUrl || !config.supabaseAnonKey) {
      state.projects = getLocalProjects();
      renderProjects();
      return;
    }

    try {
      const response = await fetch(`${trimSlash(config.supabaseRestUrl)}/projects?select=*&order=created_at.desc`, {
        headers: supabaseHeaders()
      });
      if (!response.ok) throw new Error("Не вдалося прочитати Supabase.");
      const rows = await response.json();
      state.projects = rows.map(fromProjectRow);
    } catch (error) {
      console.warn(error);
      state.projects = getLocalProjects();
    }
    renderProjects();
  }

  function fromProjectRow(row) {
    return normalizeAiPayload({
      id: row.id,
      idea: row.idea,
      title: row.title,
      summary: "Відкрийте повний результат у поточній сесії або експортуйте новостворений проєкт після аналізу.",
      businessGoal: "",
      targetAudience: "",
      mainFeatures: [],
      risks: [],
      monetization: [],
      requirements: {},
      roadmap: [],
      tasks: [],
      architecture: {},
      databaseDesigner: {},
      techStack: row.stack_keywords || [],
      difficulty: {
        complexity: row.difficulty || 0,
        risk: row.risk || 0,
        timeEstimate: row.time_estimate || ""
      },
      status: row.status,
      progress: row.progress,
      created_at: row.created_at
    }, row.idea || row.title);
  }

  function supabaseHeaders(extra = {}) {
    return {
      "Content-Type": "application/json",
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseAnonKey}`,
      ...extra
    };
  }

  function renderAnalysis(project) {
    state.selectedProject = project;
    el.resultPanel.className = "result-panel";
    el.resultPanel.innerHTML = "";

    addSection("Project Summary", paragraph(project.summary));
    addSection("Business Goal", paragraph(project.businessGoal));
    addSection("Target Audience", paragraph(project.targetAudience));
    addSection("Main Features", list(project.mainFeatures));
    addSection("Risks", list(project.risks));
    addSection("Monetization", list(project.monetization));
    addSection("Технічне завдання", requirementsMarkup(project.requirements));
    addSection("Roadmap", roadmapMarkup(project.roadmap));
    addSection("Backlog", tasksMarkup(project.tasks));
    addSection("Architecture Proposal", keyValueMarkup(project.architecture));
    addSection("AI Database Designer", databaseMarkup(project.databaseDesigner));
    addSection("AI Tech Stack Recommender", list(project.techStack));
    addSection("AI Difficulty Analyzer", difficultyMarkup(project.difficulty));

    el.exportJsonBtn.disabled = false;
    el.exportMarkdownBtn.disabled = false;
  }

  function addSection(title, content) {
    const template = document.getElementById("sectionTemplate");
    const node = template.content.cloneNode(true);
    node.querySelector("h3").textContent = title;
    node.querySelector(".section-body").innerHTML = content;
    el.resultPanel.appendChild(node);
  }

  function renderProjects() {
    const query = el.searchInput.value.trim().toLowerCase();
    const projects = state.projects.filter((project) => {
      const searchable = [
        project.title,
        project.status,
        ...(project.techStack || [])
      ].join(" ").toLowerCase();
      return searchable.includes(query);
    });

    el.projectCount.textContent = String(state.projects.length);
    el.activeProjects.textContent = String(state.projects.filter((project) => project.status !== "done").length);
    const avg = state.projects.length
      ? Math.round(state.projects.reduce((sum, project) => sum + Number(project.difficulty?.complexity || 0), 0) / state.projects.length)
      : 0;
    el.avgDifficulty.textContent = String(avg);

    el.projectsList.innerHTML = "";
    if (!projects.length) {
      el.projectsList.innerHTML = '<p class="empty-list">Поки немає проєктів.</p>';
      return;
    }

    projects.forEach((project) => {
      const card = document.createElement("article");
      card.className = `project-card ${state.selectedProject?.id === project.id ? "active" : ""}`;
      card.innerHTML = `
        <strong>${escapeHtml(project.title)}</strong>
        <div class="project-meta">
          <span>${formatDate(project.created_at)}</span>
          <span>${escapeHtml(project.status)}</span>
          <span>Complexity ${Number(project.difficulty?.complexity || 0)}/10</span>
        </div>
        <div class="progress-row">
          <div class="progress-bar"><span style="width:${clamp(project.progress || 0, 0, 100)}%"></span></div>
          <span>${clamp(project.progress || 0, 0, 100)}%</span>
        </div>
        <p>${escapeHtml((project.techStack || []).slice(0, 5).join(", "))}</p>
        <button class="secondary-button" type="button">Відкрити</button>
      `;
      card.querySelector("button").addEventListener("click", () => openProject(project));
      el.projectsList.appendChild(card);
    });
  }

  async function openProject(project) {
    state.selectedProject = project;
    renderProjects();
    if (hasFullProjectData(project) || !config.supabaseRestUrl || !config.supabaseAnonKey) {
      renderAnalysis(project);
      return;
    }

    setLoading(true);
    try {
      const fullProject = await loadProjectDetails(project);
      state.selectedProject = fullProject;
      state.projects = state.projects.map((item) => item.id === fullProject.id ? fullProject : item);
      renderAnalysis(fullProject);
      renderProjects();
    } catch (error) {
      console.warn(error);
      renderAnalysis(project);
      showToast("Повні дані проєкту не завантажились. Показую коротку картку.");
    } finally {
      setLoading(false);
    }
  }

  async function loadProjectDetails(project) {
    const projectId = encodeURIComponent(project.id);
    const [analysis, requirements, architecture, roadmap, tasks, stack] = await Promise.all([
      supabaseSelectOne(`project_analysis?project_id=eq.${projectId}&select=*`),
      supabaseSelectOne(`project_requirements?project_id=eq.${projectId}&select=*`),
      supabaseSelectOne(`project_architecture?project_id=eq.${projectId}&select=*`),
      supabaseSelectMany(`project_roadmaps?project_id=eq.${projectId}&select=*&order=stage.asc`),
      supabaseSelectMany(`project_tasks?project_id=eq.${projectId}&select=*&order=created_at.asc`),
      supabaseSelectMany(`project_stack?project_id=eq.${projectId}&select=*&order=created_at.asc`)
    ]);

    return normalizeAiPayload({
      ...project,
      summary: analysis?.summary,
      businessGoal: analysis?.business_goal,
      targetAudience: analysis?.target_audience,
      mainFeatures: analysis?.main_features,
      risks: analysis?.risks,
      monetization: analysis?.monetization,
      requirements: requirements?.content || {},
      roadmap: roadmap.map((item) => ({
        stage: item.stage,
        title: item.title,
        description: item.description
      })),
      tasks: tasks.map((task) => ({
        title: task.title,
        description: task.description,
        priority: task.priority,
        complexity: task.estimated_complexity
      })),
      architecture: {
        frontend: architecture?.frontend,
        backend: architecture?.backend,
        database: architecture?.database_layer,
        aiLayer: architecture?.ai_layer,
        hosting: architecture?.hosting,
        automation: architecture?.automation
      },
      databaseDesigner: architecture?.database_design || {},
      techStack: stack.length ? stack.map((item) => item.technology) : project.techStack
    }, project.idea || project.title);
  }

  async function supabaseSelectOne(path) {
    const rows = await supabaseSelectMany(path);
    return rows[0] || null;
  }

  async function supabaseSelectMany(path) {
    const response = await fetch(`${trimSlash(config.supabaseRestUrl)}/${path}`, {
      headers: supabaseHeaders()
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Supabase select failed: ${text}`);
    }
    return response.json();
  }

  function hasFullProjectData(project) {
    return Boolean(project.summary && project.tasks?.length && project.roadmap?.length);
  }

  function paragraph(text) {
    return `<p>${escapeHtml(text || "Не вказано.")}</p>`;
  }

  function list(items) {
    const values = ensureArray(items);
    if (!values.length) return "<p>Не вказано.</p>";
    return `<ul>${values.map((item) => `<li>${escapeHtml(String(item))}</li>`).join("")}</ul>`;
  }

  function requirementsMarkup(requirements) {
    const labels = {
      goal: "Мета",
      functionality: "Функціонал",
      interfaces: "Інтерфейси",
      data: "Дані",
      api: "API",
      database: "База даних",
      security: "Безпека",
      roadmap: "Roadmap"
    };
    return Object.entries(labels).map(([key, label]) => {
      const value = requirements?.[key];
      return `<div class="metric"><strong>${label}</strong>${Array.isArray(value) ? list(value) : paragraph(value || "Не вказано.")}</div>`;
    }).join("");
  }

  function roadmapMarkup(items) {
    const values = ensureArray(items);
    if (!values.length) return "<p>Roadmap ще не завантажено.</p>";
    return `<ol>${values.map((item) => `<li><strong>Етап ${escapeHtml(item.stage)}: ${escapeHtml(item.title)}</strong><br>${escapeHtml(item.description)}</li>`).join("")}</ol>`;
  }

  function tasksMarkup(tasks) {
    if (!tasks.length) return "<p>Backlog ще не завантажено.</p>";
    return `
      <table class="task-table">
        <thead><tr><th>Title</th><th>Description</th><th>Priority</th><th>Complexity</th></tr></thead>
        <tbody>
          ${tasks.map((task) => `
            <tr>
              <td>${escapeHtml(task.title)}</td>
              <td>${escapeHtml(task.description)}</td>
              <td><span class="priority ${escapeHtml(task.priority)}">${escapeHtml(task.priority)}</span></td>
              <td>${Number(task.complexity || 0)}/10</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  function keyValueMarkup(data) {
    const entries = Object.entries(data || {});
    if (!entries.length) return "<p>Не вказано.</p>";
    return `<div class="grid-two">${entries.map(([key, value]) => `<div class="metric"><strong>${formatKey(key)}</strong><p>${escapeHtml(String(value || "Не вказано."))}</p></div>`).join("")}</div>`;
  }

  function databaseMarkup(data) {
    if (!data) return "<p>Не вказано.</p>";
    return `
      <div class="grid-two">
        <div class="metric"><strong>Таблиці</strong>${list(data.tables)}</div>
        <div class="metric"><strong>Зв'язки</strong>${list(data.relationships)}</div>
      </div>
      <p><strong>ER:</strong> ${escapeHtml(data.erModel || "Не вказано.")}</p>
    `;
  }

  function difficultyMarkup(difficulty) {
    return `
      <div class="metric-grid">
        <div class="metric"><strong>${Number(difficulty?.complexity || 0)}</strong><p>Складність</p></div>
        <div class="metric"><strong>${Number(difficulty?.risk || 0)}</strong><p>Ризик</p></div>
        <div class="metric"><strong>${escapeHtml(difficulty?.timeEstimate || "N/A")}</strong><p>Орієнтовний час</p></div>
      </div>
    `;
  }

  function exportProject(format) {
    if (!state.selectedProject) return;
    const project = state.selectedProject;
    const content = format === "json" ? JSON.stringify(project, null, 2) : toMarkdown(project);
    const type = format === "json" ? "application/json" : "text/markdown";
    const extension = format === "json" ? "json" : "md";
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slugify(project.title)}.${extension}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function toMarkdown(project) {
    return `# ${project.title}

## Project Summary
${project.summary}

## Business Goal
${project.businessGoal}

## Target Audience
${project.targetAudience}

## Main Features
${markdownList(project.mainFeatures)}

## Risks
${markdownList(project.risks)}

## Monetization
${markdownList(project.monetization)}

## Roadmap
${project.roadmap.map((item) => `- Етап ${item.stage}: ${item.title} — ${item.description}`).join("\n")}

## Backlog
${project.tasks.map((task) => `- [${task.priority}] ${task.title}: ${task.description} (${task.complexity}/10)`).join("\n")}

## Architecture
${Object.entries(project.architecture || {}).map(([key, value]) => `- ${formatKey(key)}: ${value}`).join("\n")}

## Tech Stack
${markdownList(project.techStack)}

## Difficulty
- Complexity: ${project.difficulty.complexity}/10
- Risk: ${project.difficulty.risk}/10
- Time: ${project.difficulty.timeEstimate}
`;
  }

  function markdownList(items) {
    return ensureArray(items).map((item) => `- ${item}`).join("\n");
  }

  function getLocalProjects() {
    try {
      return JSON.parse(localStorage.getItem("project-alchemist-projects") || "[]");
    } catch {
      return [];
    }
  }

  function saveLocalProjects() {
    localStorage.setItem("project-alchemist-projects", JSON.stringify(state.projects));
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3600);
  }

  function createTitle(idea) {
    return idea
      .replace(/[.!?]+$/g, "")
      .split(/\s+/)
      .slice(0, 8)
      .join(" ");
  }

  function ensureArray(value) {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    return [value];
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(Number(value), min), max);
  }

  function trimSlash(value) {
    return String(value || "").replace(/\/+$/g, "");
  }

  function formatDate(value) {
    if (!value) return "сьогодні";
    return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
  }

  function formatKey(key) {
    return String(key).replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
  }

  function slugify(value) {
    return String(value).toLowerCase().replace(/[^a-zа-яіїєґ0-9]+/gi, "-").replace(/(^-|-$)/g, "") || "project";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
