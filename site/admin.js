(() => {
  const cfg = window.CERTIFICATES_CONFIG || {};
  const configured = Boolean(cfg.supabaseUrl && cfg.publishableKey);
  const baseUrl = (cfg.supabaseUrl || "").replace(/\/$/, "");
  const api = baseUrl + "/functions/v1/admin-certificates";
  const byId = id => document.getElementById(id);
  const loginPanel = byId("login-panel"), adminPanel = byId("admin-panel");
  const loginMessage = byId("login-message"), issueMessage = byId("issue-message"), recordsMessage = byId("records-message");
  let accessToken = "", latestIssued = [], pendingReprintRecord = null;
  const archivePicker = byId("reprint-csv");
  byId("config-warning").hidden = configured;
  byId("issued-on").value = new Date().toISOString().slice(0, 10);

  function say(node, message, error) { node.textContent = message; node.classList.toggle("error", Boolean(error)); }
  async function request(body) {
    const response = await fetch(api, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: cfg.publishableKey, Authorization: "Bearer " + accessToken },
      body: JSON.stringify(body), cache: "no-store"
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "A operação não foi concluída.");
    return data;
  }
  async function refreshRecords() {
    say(recordsMessage, "Carregando…");
    try {
      const data = await request({ action: "list" }), body = byId("records-body");
      body.replaceChildren();
      data.records.forEach(record => {
        const tr = document.createElement("tr");
        [record.course_title, record.workload_hours + " h", record.issued_on, record.status === "valid" ? "Válido" : "Revogado"].forEach(value => {
          const td = document.createElement("td");
        if (record.status === "valid") {
          const actions = document.createElement("div"); actions.className = "record-actions";
          const reprint = document.createElement("button"); reprint.type = "button"; reprint.className = "button-secondary"; reprint.textContent = "Imprimir 2ª via";
          reprint.addEventListener("click", () => {
            const current = latestIssued.find(item => item.id === record.id);
            if (current) return printCertificate(current);
            pendingReprintRecord = record; archivePicker.value = "";
            say(recordsMessage, "Selecione o CSV privado desta emissão para localizar os dados do certificado.");
            archivePicker.click();
          });
          const revoke = document.createElement("button"); revoke.type = "button"; revoke.className = "button-secondary"; revoke.textContent = "Revogar";
          revoke.addEventListener("click", async () => {
            if (!confirm("Revogar este certificado?")) return;
            revoke.disabled = true;
            try { await request({ action: "revoke", id: record.id }); await refreshRecords(); }
            catch (error) { say(recordsMessage, error.message, true); revoke.disabled = false; }
          });
          actions.append(reprint, revoke); td.append(actions);
        } else td.textContent = "—";
        tr.append(td); body.append(tr);
      });
      say(recordsMessage, data.records.length + " registros recentes. Sem nomes armazenados.");
    } catch (error) { say(recordsMessage, error.message, true); }
  }

  byId("login-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (!configured) return say(loginMessage, "Configure URL e chave publishable do Supabase.", true);
    const button = event.currentTarget.querySelector("button"); button.disabled = true; say(loginMessage, "Entrando…");
    try {
      const response = await fetch(baseUrl + "/auth/v1/token?grant_type=password", {
        method: "POST", headers: { "Content-Type": "application/json", apikey: cfg.publishableKey },
        body: JSON.stringify({ email: byId("email").value.trim(), password: byId("password").value })
      });
      const data = await response.json();
      if (!response.ok || !data.access_token) throw new Error("Login não autorizado. Confira a conta da equipe.");
      accessToken = data.access_token; loginPanel.hidden = true; adminPanel.hidden = false;
      byId("password").value = ""; await refreshRecords();
    } catch (error) { say(loginMessage, error.message, true); }
    finally { button.disabled = false; }
  });

  byId("logout").addEventListener("click", () => {
    accessToken = ""; latestIssued = []; byId("issued-section").hidden = true;
    byId("print-area").replaceChildren(); byId("records-body").replaceChildren();
    adminPanel.hidden = true; loginPanel.hidden = false; say(loginMessage, "Sessão encerrada.");
  });

  byId("issue-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (!accessToken) return say(issueMessage, "Entre novamente para emitir certificados.", true);
    const names = byId("students").value.split(/\r?\n/).map(name => name.trim()).filter(Boolean);
    const course = byId("course").value.trim(), hours = Number(byId("hours").value), issuedOn = byId("issued-on").value;
    if (!names.length || names.length > 100) return say(issueMessage, "Informe de 1 a 100 nomes, um por linha.", true);
    if (names.some(name => name.length > 160)) return say(issueMessage, "Cada nome pode ter no máximo 160 caracteres.", true);
    if (!course || course.length > 120 || !Number.isInteger(hours) || hours < 1 || !issuedOn) return say(issueMessage, "Confira curso, carga horária e data.", true);
    const button = event.currentTarget.querySelector('button[type="submit"]'); button.disabled = true; say(issueMessage, "Registrando códigos…");
    try {
      const prepared = await Promise.all(names.map(async name => {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        const code = "TP-" + Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
        const codeHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
        return { name, code, code_hash: codeHash };
      }));
      const created = await request({ action: "issue", records: prepared.map(item => ({ code_hash: item.code_hash, course_title: course, workload_hours: hours, issued_on: issuedOn })) });
      latestIssued = prepared.map((item, index) => ({ name: item.name, code: item.code, course, hours, issuedOn, id: created.records[index].id }));
      renderIssued(); byId("issued-section").hidden = false;
      say(issueMessage, latestIssued.length + " certificado(s) registrado(s). Baixe o CSV ou imprima antes de encerrar esta sessão.");
      await refreshRecords();
    } catch (error) { say(issueMessage, error.message, true); }
    finally { button.disabled = false; }
  });

  function buildCertificate(item) {
    const url = new URL("./", window.location.href);
    const make = (tag, className, text, parent) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== null && text !== undefined) node.textContent = text;
      if (parent) parent.append(node);
      return node;
    };
    const sheet = make("article", "certificate-sheet");
    const frame = make("div", "certificate-frame", null, sheet);
    const logo = make("img", "certificate-logo", null, frame);
    logo.src = "./assets/logo-horizontal-branco-fundo-azul.png";
    logo.alt = "Tecnologia na Prática · São Pedro/SP";
    make("p", "certificate-eyebrow", "FORMAÇÃO · TECNOLOGIA · FUTURO", frame);
    make("h1", "certificate-title", "CERTIFICADO", frame);
    make("span", "certificate-rule", null, frame);
    make("p", "certificate-copy", "Certificamos que", frame);
    make("h2", "certificate-student", item.name, frame);
    make("p", "certificate-copy", "concluiu com aproveitamento a atividade formativa", frame);
    make("p", "certificate-course", item.course, frame);
    const details = make("div", "certificate-details", null, frame);
    const hours = make("div", "certificate-detail", null, details);
    make("span", "certificate-detail-label", "CARGA HORÁRIA", hours);
    make("strong", "", item.hours + " horas", hours);
    const date = make("div", "certificate-detail", null, details);
    make("span", "certificate-detail-label", "DATA DE EMISSÃO", date);
    make("strong", "", item.issuedOn, date);
    const validation = make("div", "certificate-validation", null, frame);
    const codeBlock = make("div", "certificate-validation-code", null, validation);
    make("span", "certificate-detail-label", "CÓDIGO VERIFICADOR", codeBlock);
    make("strong", "", item.code, codeBlock);
    const verifyBlock = make("div", "certificate-validation-link", null, validation);
    make("span", "certificate-detail-label", "VALIDAÇÃO ONLINE", verifyBlock);
    make("span", "", url.href, verifyBlock);
    make("p", "certificate-footer", "Documento verificável online · Apresente o código acima para confirmar a autenticidade.", frame);
    return sheet;
  }

  function printCertificate(item) {
    const printArea = byId("print-area");
    printArea.replaceChildren(buildCertificate(item));
    window.addEventListener("afterprint", () => renderIssued(), { once: true });
    window.print();
  }

  function renderIssued() {
    const list = byId("issued-list"), printArea = byId("print-area"); list.replaceChildren(); printArea.replaceChildren();
    latestIssued.forEach(item => {
      const row = document.createElement("div"); row.className = "issued-row";
      const name = document.createElement("strong"); name.textContent = item.name;
      const code = document.createElement("span"); code.className = "code"; code.textContent = item.code;
      row.append(name, document.createTextNode(" · "), code); list.append(row);
      printArea.append(buildCertificate(item));
    });
  }

  function parseCsv(text) {
    const rows = []; let fields = [], field = "", quoted = false;
    text = text.replace(/^\uFEFF/, "");
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') { field += '"'; i++; }
        else quoted = !quoted;
      } else if (char === "," && !quoted) { fields.push(field); field = ""; }
      else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && text[i + 1] === "\n") i++;
        fields.push(field); if (fields.some(value => value !== "")) rows.push(fields);
        fields = []; field = "";
      } else field += char;
    }
    fields.push(field); if (fields.some(value => value !== "")) rows.push(fields);
    return rows;
  }

  async function hashCode(code) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  }

  archivePicker.addEventListener("change", async () => {
    const file = archivePicker.files && archivePicker.files[0], record = pendingReprintRecord;
    pendingReprintRecord = null; archivePicker.value = "";
    if (!file || !record) return;
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) throw new Error("O CSV não contém certificados.");
      const columns = Object.fromEntries(rows[0].map((value, index) => [value.trim().toLowerCase(), index]));
      for (const required of ["nome", "codigo_verificador", "curso", "carga_horaria", "data_emissao"]) {
        if (columns[required] === undefined) throw new Error("Este arquivo não é um CSV de emissão válido.");
      }
      const matches = [];
      for (const values of rows.slice(1)) {
        const get = name => columns[name] === undefined ? "" : (values[columns[name]] || "").trim();
        const code = get("codigo_verificador").toUpperCase();
        if (!/^TP-[A-F0-9]{32}$/.test(code)) continue;
        if (columns.id !== undefined && get("id") && get("id") !== record.id) continue;
        if (await hashCode(code) !== record.code_hash) continue;
        if (get("curso") !== record.course_title || Number(get("carga_horaria")) !== Number(record.workload_hours) || get("data_emissao") !== record.issued_on) continue;
        matches.push({ id: record.id, name: get("nome"), code, course: get("curso"), hours: Number(get("carga_horaria")), issuedOn: get("data_emissao") });
      }
      if (matches.length !== 1) throw new Error("Não encontrei uma única correspondência. Confira se selecionou o CSV correto desta emissão.");
      say(recordsMessage, "Segunda via pronta para impressão.");
      printCertificate(matches[0]);
    } catch (error) { say(recordsMessage, error.message, true); }
  });
  byId("download-csv").addEventListener("click", () => {
    if (!latestIssued.length) return;
    const quote = value => '"' + String(value).replace(/"/g, '""') + '"';
    const rows = [["id","nome","codigo_verificador","curso","carga_horaria","data_emissao"], ...latestIssued.map(item => [item.id,item.name,item.code,item.course,item.hours,item.issuedOn])];
    const blob = new Blob(["\uFEFF" + rows.map(row => row.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a"), objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl; link.download = "certificados-" + byId("issued-on").value + ".csv"; link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  });
  byId("print-certs").addEventListener("click", () => window.print());
  byId("refresh-list").addEventListener("click", refreshRecords);
})();
