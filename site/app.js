(() => {
  const cfg = window.CERTIFICATES_CONFIG || {};
  const form = document.getElementById("verify-form");
  const codeInput = document.getElementById("code");
  const result = document.getElementById("result");
  const configured = Boolean(cfg.supabaseUrl && cfg.publishableKey);
  const baseUrl = (cfg.supabaseUrl || "").replace(/\/$/, "");
  if (!configured) {
    result.hidden = false; result.className = "result invalid";
    result.textContent = "A validação online ainda está sendo configurada. Tente mais tarde ou entre em contato com a equipe.";
  }
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!configured) return;
    result.hidden = false; result.className = "result"; result.textContent = "Consultando…";
    try {
      const response = await fetch(baseUrl + "/functions/v1/verify-certificate", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: cfg.publishableKey },
        body: JSON.stringify({ code: codeInput.value.trim().toUpperCase() }),
        cache: "no-store"
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível consultar.");
      result.replaceChildren(); result.className = data.valid ? "result" : "result invalid";
      const heading = document.createElement("h2");
      heading.textContent = data.valid ? "Certificado válido" : data.revoked ? "Certificado revogado" : "Código não encontrado";
      result.append(heading);
      const message = document.createElement("p");
      message.textContent = data.valid
        ? "O código corresponde a um registro ativo. Compare os dados abaixo com o certificado."
        : data.revoked
          ? "O registro está revogado. Fale com a equipe do curso se precisar de esclarecimentos."
          : "Confira o código impresso ou entre em contato com a equipe do curso.";
      result.append(message);
      if (data.certificate) {
        const dl = document.createElement("dl");
        [["Curso", data.certificate.course_title], ["Carga horária", data.certificate.workload_hours + " horas"], ["Emissão", data.certificate.issued_on]].forEach(([term, value]) => {
          const dt = document.createElement("dt"); dt.textContent = term;
          const dd = document.createElement("dd"); dd.textContent = value;
          dl.append(dt, dd);
        });
        result.append(dl);
      }
    } catch (error) {
      result.className = "result invalid"; result.textContent = error.message || "Falha de conexão. Tente novamente.";
    }
  });
})();
