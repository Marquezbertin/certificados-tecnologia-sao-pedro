(() => {
  const cfg = window.CERTIFICATES_CONFIG || {};
  const configured = Boolean(cfg.supabaseUrl && cfg.publishableKey);
  const baseUrl = (cfg.supabaseUrl || "").replace(/\/$/, "");
  const api = baseUrl + "/functions/v1/admin-certificates";
  const byId = id => document.getElementById(id);
  const loginPanel = byId("login-panel"), adminPanel = byId("admin-panel");
  const loginMessage = byId("login-message"), issueMessage = byId("issue-message"), recordsMessage = byId("records-message");
  let accessToken = "", latestIssued = [];
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
          const td = document.createElement("td"); td.textContent = value;
          if (value === "Válido") td.className = "status-valid";
          if (value === "Revogado") td.className = "status-revoked";
          tr.append(td);
        });
        const td = document.createElement("td");
        if (record.status === "valid") {
          const button = document.createElement("button"); button.type = "button"; button.className = "button-secondary"; button.textContent = "Revogar";
          button.addEventListener("click", async () => {
            if (!confirm("Revogar este certificado?")) return;
            button.disabled = true;
            try { await request({ action: "revoke", id: record.id }); await refreshRecords(); }
            catch (error) { say(recordsMessage, error.message, true); button.disabled = false; }
          });
          td.append(button);
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

  function renderIssued() {
    const list = byId("issued-list"), printArea = byId("print-area"); list.replaceChildren(); printArea.replaceChildren();
    latestIssued.forEach(item => {
      const row = document.createElement("div"); row.className = "issued-row";
      const name = document.createElement("strong"); name.textContent = item.name;
      const code = document.createElement("span"); code.className = "code"; code.textContent = item.code;
      row.append(name, document.createTextNode(" · "), code); list.append(row);
      const url = new URL("./", window.location.href);
      const sheet = document.createElement("article"); sheet.className = "certificate-sheet";
      const content = [
        ["h1","","Certificado"],
        ["p","certificate-copy","Certificamos que"],["p","certificate-name",item.name],
        ["p","certificate-copy","concluiu a atividade formativa"],["p","certificate-name",item.course],
        ["p","certificate-copy","com carga horária de " + item.hours + " horas."],
        ["p","certificate-meta","Emitido em " + item.issuedOn],
        ["p","certificate-code","Código verificador: " + item.code],
        ["p","certificate-link","Valide em " + url.href],
        ["p","certificate-footer","A validade pode ser consultada no endereço indicado, usando o código acima."]
      ];
      const logo = document.createElement("img"); logo.className = "certificate-logo"; logo.src = "./assets/logo-horizontal.png"; logo.alt = "Tecnologia na Prática · São Pedro/SP"; sheet.append(logo);
      content.forEach(([tag, cls, text]) => { const node = document.createElement(tag); if (cls) node.className = cls; node.textContent = text; sheet.append(node); });
      printArea.append(sheet);
    });
  }

  byId("download-csv").addEventListener("click", () => {
    if (!latestIssued.length) return;
    const quote = value => '"' + String(value).replace(/"/g, '""') + '"';
    const rows = [["nome","codigo_verificador","curso","carga_horaria","data_emissao"], ...latestIssued.map(item => [item.name,item.code,item.course,item.hours,item.issuedOn])];
    const blob = new Blob(["\uFEFF" + rows.map(row => row.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a"), objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl; link.download = "certificados-" + byId("issued-on").value + ".csv"; link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  });
  byId("print-certs").addEventListener("click", () => window.print());
  byId("refresh-list").addEventListener("click", refreshRecords);
})();
