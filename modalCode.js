(function() {
  if (typeof window === 'undefined') return;

  function openAddModelModal(initialProvider, editModelName) {
    var existing = document.getElementById('agy-modal-overlay');
    if (existing) existing.remove();

    var isEdit = !!editModelName;
    var isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    var overlay = document.createElement('div');
    overlay.id = 'agy-modal-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background-color:rgba(0,0,0,0.65);backdrop-filter:blur(6px);display:flex;justify-content:center;align-items:center;z-index:999999;opacity:0;transition:opacity 0.2s ease-in-out;';

    var modal = document.createElement('div');
    modal.id = 'agy-modal-card';
    modal.style.cssText = 'width:560px;max-height:92vh;overflow-y:auto;background-color:#18181b;border:1px solid #27272a;border-radius:16px;padding:28px;box-shadow:0 25px 35px -5px rgba(0,0,0,0.6);color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;transform:scale(0.92) translateY(15px);transition:transform 0.2s cubic-bezier(0.34,1.56,0.64,1);';

    var icons = {
      openrouter: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
      openai: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M22.28 10.37a7.7 7.7 0 0 0-.6-5.83 7.8 7.8 0 0 0-7.3-3.9 7.7 7.7 0 0 0-5.87 2.65 7.7 7.7 0 0 0-4.8 3.52 7.7 7.7 0 0 0-.96 6.04 7.7 7.7 0 0 0 .6 5.83 7.8 7.8 0 0 0 7.3 3.9 7.7 7.7 0 0 0 5.87-2.65 7.7 7.7 0 0 0 4.8-3.52 7.7 7.7 0 0 0 .96-6.04z"/></svg>',
      deepseek: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
      ollama: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M12 8v8M8 12h8"/></svg>',
      anthropic: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-6h2v6zm4 0h-2v-4h2v4zm-2-8c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/></svg>',
      groq: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
      mistral: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
      cerebras: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/></svg>',
      custom: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
    };

    var defaultUrls = {
      openrouter: 'https://openrouter.ai/api/v1/chat/completions',
      openai: 'https://api.openai.com/v1/chat/completions',
      deepseek: 'https://api.deepseek.com/chat/completions',
      ollama: 'http://localhost:11434/v1/chat/completions',
      anthropic: 'https://api.anthropic.com/v1/messages',
      groq: 'https://api.groq.com/openai/v1/chat/completions',
      mistral: 'https://api.mistral.ai/v1/chat/completions',
      cerebras: 'https://api.cerebras.ai/v1/chat/completions',
      kimi: 'https://api.moonshot.cn/v1/chat/completions',
      fireworks: 'https://api.fireworks.ai/inference/v1/chat/completions',
      lmstudio: 'http://localhost:1234/v1/chat/completions',
      custom: ''
    };

    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">';
    html += '<div style="display:flex;align-items:center;gap:10px;"><div id="agy-prov-icon" style="width:30px;height:30px;border-radius:8px;background:#6366f120;color:#818cf8;display:flex;align-items:center;justify-content:center;">' + (icons.openrouter) + '</div>';
    html += '<h3 style="margin:0;font-size:18px;font-weight:600;">' + (isEdit ? 'Editar Modelo Customizado' : 'Adicionar Modelo Customizado') + '</h3></div>';
    html += '<button id="agy-btn-close" type="button" style="background:transparent;border:none;color:#71717a;cursor:pointer;font-size:22px;line-height:1;padding:4px;">&times;</button></div>';

    if (isOffline) {
      html += '<div style="background:#ef444420;border:1px solid #ef444460;border-radius:8px;padding:10px 14px;font-size:12px;color:#fca5a5;margin-bottom:14px;display:flex;align-items:center;gap:8px;">⚠️ <strong>Você está offline.</strong> Conecte-se para listar e adicionar modelos com limites automáticos.</div>';
    }

    html += '<div style="display:flex;flex-direction:column;gap:14px;margin-bottom:20px;">';
    html += '<div><label style="font-size:12px;font-weight:500;color:#a1a1aa;margin-bottom:4px;display:block;">Provedor</label>';
    html += '<select id="agy-sel-prov" style="width:100%;background:#27272a;border:1px solid #3f3f46;border-radius:8px;color:#f4f4f5;padding:8px 10px;font-size:13px;outline:none;"><option value="openrouter">OpenRouter</option><option value="deepseek">DeepSeek</option><option value="openai">OpenAI</option><option value="ollama">Ollama (Local)</option><option value="groq">Groq</option><option value="mistral">Mistral</option><option value="cerebras">Cerebras</option><option value="anthropic">Anthropic</option><option value="kimi">Kimi (Moonshot)</option><option value="fireworks">Fireworks</option><option value="lmstudio">LM Studio (Local)</option><option value="custom">Custom / Compatível OpenAI</option></select></div>';

    html += '<div><label style="font-size:12px;font-weight:500;color:#a1a1aa;margin-bottom:4px;display:flex;align-items:center;justify-content:space-between;"><span>⭐ Modelos Populares</span><div style="display:flex;align-items:center;gap:6px;"><button id="agy-btn-fetch-prov" type="button" style="background:#27272a;border:1px solid #3f3f46;border-radius:6px;color:#a1a1aa;padding:2px 8px;font-size:11px;cursor:pointer;">↻ Buscar Modelos</button><span id="agy-pop-loading" style="font-size:11px;color:#71717a;display:none;">buscando...</span></div></label>';
    html += '<div id="agy-pop-pills" style="display:flex;flex-wrap:wrap;gap:6px;min-height:28px;"></div></div>';

    html += '<div style="position:relative;"><label style="font-size:12px;font-weight:500;color:#a1a1aa;margin-bottom:4px;display:block;">ID do Modelo <span style="color:#ef4444;">*</span></label>';
    html += '<input id="agy-inp-model" placeholder="ex: google/gemini-2.5-flash" style="width:100%;box-sizing:border-box;background:#27272a;border:1px solid #3f3f46;border-radius:8px;color:#f4f4f5;padding:8px 10px;font-size:13px;outline:none;" />';
    html += '<div id="agy-model-dd" style="position:absolute;top:100%;left:0;right:0;max-height:160px;overflow-y:auto;background:#27272a;border:1px solid #3f3f46;border-radius:8px;margin-top:4px;z-index:50;display:none;box-shadow:0 10px 15px -3px rgba(0,0,0,0.5);"></div></div>';

    html += '<div style="background:#27272a50;border:1px solid #3f3f46;border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;">';
    html += '<span style="font-size:12px;color:#a1a1aa;">Limites Detectados:</span>';
    html += '<div style="display:flex;gap:8px;"><span style="background:#18181b;border:1px solid #3f3f46;border-radius:6px;padding:3px 8px;font-size:11px;font-family:monospace;color:#93c5fd;">🌐 <span id="agy-badge-ctx">128.000 tokens</span></span><span style="background:#18181b;border:1px solid #3f3f46;border-radius:6px;padding:3px 8px;font-size:11px;font-family:monospace;color:#86efac;">📤 <span id="agy-badge-out">8.192 tokens</span></span></div></div>';

    html += '<div><label style="font-size:12px;font-weight:500;color:#a1a1aa;margin-bottom:4px;display:block;">Nome de Exibição (Opcional)</label>';
    html += '<input id="agy-inp-name" placeholder="ex: Gemini 2.5 Flash" style="width:100%;box-sizing:border-box;background:#27272a;border:1px solid #3f3f46;border-radius:8px;color:#f4f4f5;padding:8px 10px;font-size:13px;outline:none;" /></div>';

    html += '<div id="agy-box-key"><label style="font-size:12px;font-weight:500;color:#a1a1aa;margin-bottom:4px;display:block;">API Key <span style="color:#ef4444;">*</span></label>';
    html += '<div style="position:relative;display:flex;align-items:center;"><input id="agy-inp-key" type="password" placeholder="sk-..." style="width:100%;box-sizing:border-box;background:#27272a;border:1px solid #3f3f46;border-radius:8px;color:#f4f4f5;padding:8px 36px 8px 10px;font-size:13px;outline:none;" /><button id="agy-btn-eye" type="button" title="Mostrar/Ocultar chave" style="position:absolute;right:8px;background:none;border:none;color:#71717a;cursor:pointer;padding:4px;display:flex;align-items:center;line-height:1;"><svg id="agy-eye-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button></div></div>';

    html += '<div><label style="font-size:12px;font-weight:500;color:#a1a1aa;margin-bottom:4px;display:block;">Endpoint URL <span style="color:#ef4444;">*</span></label>';
    html += '<input id="agy-inp-url" style="width:100%;box-sizing:border-box;background:#27272a;border:1px solid #3f3f46;border-radius:8px;color:#f4f4f5;padding:8px 10px;font-size:13px;outline:none;" /></div>';

    html += '<div id="agy-msg-status" style="font-size:12px;display:none;padding:8px 12px;border-radius:6px;"></div>';
    html += '</div>';

    html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
    html += '<div style="display:flex;gap:8px;"><button id="agy-btn-test" type="button" style="background:transparent;border:1px solid #3f3f46;border-radius:8px;color:#a1a1aa;padding:8px 14px;font-size:12px;cursor:pointer;">Testar Conexão</button>';
    if (isEdit) {
      html += '<button id="agy-btn-delete" type="button" style="background:#ef444420;border:1px solid #ef444460;border-radius:8px;color:#fca5a5;padding:8px 12px;font-size:12px;cursor:pointer;">Remover</button>';
    }
    html += '</div>';
    html += '<div style="display:flex;gap:10px;"><button id="agy-btn-cancel" type="button" style="background:#27272a;border:1px solid #3f3f46;border-radius:8px;color:#e4e4e7;padding:8px 16px;font-size:13px;cursor:pointer;">Cancelar</button>';
    html += '<button id="agy-btn-save" type="button" ' + (isOffline ? 'disabled' : '') + ' style="background:#3b82f6;border:none;border-radius:8px;color:#fff;padding:8px 18px;font-size:13px;font-weight:500;cursor:' + (isOffline ? 'not-allowed' : 'pointer') + ';opacity:' + (isOffline ? '0.4' : '1') + ';">' + (isEdit ? 'Atualizar Modelo' : 'Salvar Modelo') + '</button></div></div>';

    modal.innerHTML = html;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    setTimeout(function() { overlay.style.opacity = '1'; modal.style.transform = 'scale(1) translateY(0)'; }, 10);

    var closeModal = function() {
      overlay.style.opacity = '0';
      modal.style.transform = 'scale(0.92) translateY(15px)';
      setTimeout(function() { overlay.remove(); }, 200);
    };

    document.getElementById('agy-btn-close').onclick = closeModal;
    document.getElementById('agy-btn-cancel').onclick = closeModal;
    overlay.onclick = function(e) { if (e.target === overlay) closeModal(); };

    var selProv = document.getElementById('agy-sel-prov');
    var inpModel = document.getElementById('agy-inp-model');
    var inpName = document.getElementById('agy-inp-name');
    var inpKey = document.getElementById('agy-inp-key');
    var inpUrl = document.getElementById('agy-inp-url');
    var boxKey = document.getElementById('agy-box-key');
    var popPills = document.getElementById('agy-pop-pills');
    var popLoading = document.getElementById('agy-pop-loading');
    var modelDd = document.getElementById('agy-model-dd');
    var badgeCtx = document.getElementById('agy-badge-ctx');
    var badgeOut = document.getElementById('agy-badge-out');
    var provIcon = document.getElementById('agy-prov-icon');
    var msgStatus = document.getElementById('agy-msg-status');
    var btnSave = document.getElementById('agy-btn-save');
    var btnTest = document.getElementById('agy-btn-test');
    var btnEye = document.getElementById('agy-btn-eye');
    var eyeIcon = document.getElementById('agy-eye-icon');
    var btnFetchProv = document.getElementById('agy-btn-fetch-prov');
    var btnDelete = document.getElementById('agy-btn-delete');

    if (btnEye && eyeIcon) {
      btnEye.onclick = function() {
        if (inpKey.type === 'password') {
          inpKey.type = 'text';
          eyeIcon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
        } else {
          inpKey.type = 'password';
          eyeIcon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
        }
      };
    }

    var curCtx = 128000;
    var curOut = 8192;
    var provModels = [];

    var fmtTok = function(n) {
      if (n >= 1000000) return (n/1000000).toFixed(n%1000000 === 0 ? 0 : 1) + 'M tokens';
      if (n >= 1000) return Math.round(n/1000) + 'k tokens';
      return n + ' tokens';
    };

    var updateLimits = function(ctx, out) {
      curCtx = ctx || 128000;
      curOut = out || 8192;
      badgeCtx.textContent = fmtTok(curCtx);
      badgeOut.textContent = fmtTok(curOut);
    };

    var selectModel = function(m) {
      inpModel.value = m.id;
      if (!inpName.value || inpName.value.includes('(')) inpName.value = m.name || m.id;
      if (m.contextWindow || m.maxOutputTokens) updateLimits(m.contextWindow, m.maxOutputTokens);
      modelDd.style.display = 'none';
    };

    var loadProviderModels = function() {
      var p = selProv.value;
      if (!isEdit || !inpUrl.value) {
        inpUrl.value = defaultUrls[p] || '';
      }
      boxKey.style.display = p === 'ollama' ? 'none' : 'block';
      provIcon.innerHTML = icons[p] || icons.custom;
      popPills.innerHTML = '';
      if (popLoading) popLoading.style.display = 'inline';

      fetch('http://127.0.0.1:50999/v1internal/providerModels?provider=' + encodeURIComponent(p))
        .then(function(r) { return r.json(); })
        .then(function(d) {
          provModels = d.models || [];
          if (popLoading) popLoading.style.display = 'none';
          if (d.hasConfiguredKey) {
            inpKey.placeholder = '(Chave já configurada - deixe em branco para manter)';
          } else {
            inpKey.placeholder = 'sk-...';
          }
          var pops = provModels.filter(function(m) { return m.isPopular; }).slice(0, 5);
          if (pops.length === 0) pops = provModels.slice(0, 4);
          pops.forEach(function(m) {
            var pill = document.createElement('button');
            pill.type = 'button';
            pill.style.cssText = 'background:#27272a;border:1px solid #3f3f46;border-radius:6px;color:#d4d4d8;padding:3px 8px;font-size:11px;cursor:pointer;';
            pill.textContent = m.name || m.id;
            pill.onclick = function() { selectModel(m); };
            popPills.appendChild(pill);
          });
        })
        .catch(function() { if (popLoading) popLoading.style.display = 'none'; });
    };

    if (btnFetchProv) {
      btnFetchProv.onclick = loadProviderModels;
    }

    selProv.onchange = loadProviderModels;

    // Helper to populate edit fields
    var applyModelToFields = function(m) {
      if (!m) return;
      var p = (m.provider || 'openrouter').toLowerCase();
      var opt = selProv.querySelector('option[value="' + p + '"]');
      if (opt) selProv.value = p;
      provIcon.innerHTML = icons[p] || icons.custom;
      inpModel.value = m.externalModelName || m.name || '';
      inpName.value = m.displayName || m.name || '';
      inpUrl.value = m.apiUrl || defaultUrls[p] || '';
      if (m.apiKey) {
        inpKey.placeholder = '(Chave configurada - deixe em branco para manter)';
      }
      updateLimits(m.maxTokens, m.maxOutputTokens);
      loadProviderModels();
    };

    if (isEdit) {
      var localList = [];
      if (typeof window._cachedCustomModels !== 'undefined' && Array.isArray(window._cachedCustomModels)) {
        localList = window._cachedCustomModels;
      } else if (typeof _cachedCustomModels !== 'undefined' && Array.isArray(_cachedCustomModels)) {
        localList = _cachedCustomModels;
      }
      var target = localList.find(function(x) {
        return (x.displayName || x.name) === editModelName || x.name === editModelName || x.externalModelName === editModelName || x.label === editModelName;
      });
      if (target) {
        applyModelToFields(target);
      } else {
        fetch('http://127.0.0.1:50999/v1internal/customModels')
          .then(function(r) { return r.json(); })
          .then(function(d) {
            var l = Array.isArray(d) ? d : (d.models || []);
            var found = l.find(function(x) {
              return (x.displayName || x.name) === editModelName || x.name === editModelName || x.externalModelName === editModelName || x.label === editModelName;
            });
            if (found) applyModelToFields(found);
            else loadProviderModels();
          })
          .catch(function() { loadProviderModels(); });
      }
    } else {
      if (initialProvider) {
        var opt = selProv.querySelector('option[value="' + initialProvider.toLowerCase() + '"]');
        if (opt) selProv.value = initialProvider.toLowerCase();
      }
      loadProviderModels();
    }

    inpModel.oninput = function() {
      var q = inpModel.value.trim().toLowerCase();
      if (!q || provModels.length === 0) { modelDd.style.display = 'none'; return; }
      var matches = provModels.filter(function(m) {
        return (m.id && m.id.toLowerCase().includes(q)) || (m.name && m.name.toLowerCase().includes(q));
      }).slice(0, 8);
      if (matches.length === 0) { modelDd.style.display = 'none'; return; }
      modelDd.innerHTML = '';
      matches.forEach(function(m) {
        var it = document.createElement('div');
        it.style.cssText = 'padding:6px 10px;font-size:12px;cursor:pointer;border-bottom:1px solid #3f3f4630;display:flex;justify-content:space-between;';
        it.innerHTML = '<span>' + (m.name || m.id) + '</span><span style="font-size:10px;color:#71717a;">' + fmtTok(m.contextWindow) + '</span>';
        it.onmouseenter = function() { it.style.background = '#3f3f4650'; };
        it.onmouseleave = function() { it.style.background = 'transparent'; };
        it.onclick = function() { selectModel(m); };
        modelDd.appendChild(it);
      });
      modelDd.style.display = 'block';

      fetch('http://127.0.0.1:50999/v1internal/resolveModelSpec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: inpModel.value.trim() })
      }).then(function(r) { return r.json(); }).then(function(spec) {
        if (spec && spec.contextWindow) updateLimits(spec.contextWindow, spec.maxOutputTokens);
      }).catch(function() {});
    };

    document.addEventListener('click', function(e) {
      if (!modelDd.contains(e.target) && e.target !== inpModel) modelDd.style.display = 'none';
    });

    btnTest.onclick = function() {
      msgStatus.style.display = 'block';
      msgStatus.style.background = '#27272a';
      msgStatus.style.color = '#a1a1aa';
      msgStatus.textContent = 'Testando conexão...';
      fetch('http://127.0.0.1:50999/v1internal/testConnection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selProv.value,
          apiKey: inpKey.value.trim(),
          apiUrl: inpUrl.value.trim()
        })
      }).then(function(r) { return r.json(); }).then(function(res) {
        msgStatus.style.display = 'block';
        if (res.success) {
          msgStatus.style.background = '#22c55e20';
          msgStatus.style.color = '#86efac';
          msgStatus.textContent = '✓ ' + (res.message || 'Conexão estabelecida com sucesso!');
        } else {
          msgStatus.style.background = '#ef444420';
          msgStatus.style.color = '#fca5a5';
          msgStatus.textContent = '✕ ' + (res.error || 'Falha na conexão.');
        }
      }).catch(function(err) {
        msgStatus.style.display = 'block';
        msgStatus.style.background = '#ef444420';
        msgStatus.style.color = '#fca5a5';
        msgStatus.textContent = '✕ Erro: ' + err.message;
      });
    };

    if (btnDelete) {
      btnDelete.onclick = function() {
        if (!confirm('Deseja realmente remover o modelo "' + editModelName + '"?')) return;
        btnDelete.disabled = true;
        btnDelete.textContent = 'Removendo...';
        fetch('http://127.0.0.1:50999/v1internal/deleteCustomModel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelName: editModelName })
        }).then(function(r) { return r.json(); }).then(function(res) {
          btnDelete.disabled = false;
          btnDelete.textContent = 'Remover';
          if (res.success) {
            if (typeof window._fetchCustomModelsAsync === 'function') window._fetchCustomModelsAsync();
            else if (typeof _fetchCustomModelsAsync === 'function') _fetchCustomModelsAsync();
            try { window.__agy_onModelsUpdated?.(); } catch(_) {}
            closeModal();
          } else {
            alert('Erro ao remover: ' + (res.error || 'Desconhecido'));
          }
        }).catch(function(err) {
          btnDelete.disabled = false;
          btnDelete.textContent = 'Remover';
          alert('Erro de conexão: ' + err.message);
        });
      };
    }

    btnSave.onclick = function() {
      var mId = inpModel.value.trim();
      if (!mId) { alert('Informe o ID do modelo'); return; }
      var prov = selProv.value;
      var key = inpKey.value.trim();
      var url = inpUrl.value.trim();
      var dispName = inpName.value.trim() || mId;

      btnSave.disabled = true;
      btnSave.textContent = isEdit ? 'Atualizando...' : 'Salvando...';

      var rawSlug = (mId || 'custom-model').replace(/^models\//, '').replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase();
      var modelObj = {
        name: 'models/' + rawSlug,
        displayName: dispName,
        provider: prov,
        apiKey: key,
        apiUrl: url,
        externalModelName: mId,
        maxTokens: curCtx,
        maxOutputTokens: curOut,
        supportsThinking: true
      };

      if (isEdit) {
        modelObj.oldLabel = editModelName;
      }

      fetch('http://127.0.0.1:50999/v1internal/saveCustomModel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modelObj)
      }).then(function(r) { return r.json(); }).then(function(res) {
        btnSave.disabled = false;
        btnSave.textContent = isEdit ? 'Atualizar Modelo' : 'Salvar Modelo';
        if (res.success) {
          if (typeof window._fetchCustomModelsAsync === 'function') window._fetchCustomModelsAsync();
          else if (typeof _fetchCustomModelsAsync === 'function') _fetchCustomModelsAsync();
          try { window.__agy_onModelsUpdated?.(); } catch(_) {}
          closeModal();
        } else {
          alert('Erro ao salvar modelo: ' + (res.error || 'Desconhecido'));
        }
      }).catch(function(err) {
        btnSave.disabled = false;
        btnSave.textContent = isEdit ? 'Atualizar Modelo' : 'Salvar Modelo';
        alert('Erro de conexão: ' + err.message);
      });
    };
  }

  window.openAddModelModal = openAddModelModal;
  window.addEventListener('agy:open-add-model', function(e) {
    openAddModelModal(e && e.detail && e.detail.provider, e && e.detail && e.detail.modelName);
  });
})();
