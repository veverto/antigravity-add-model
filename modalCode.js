(function() {
  if (typeof window === 'undefined') return;

  // 1. Inject Bulletproof Scrollbar & Dropdown CSS
  try {
    if (typeof document !== "undefined") {
      var existingStyle = document.getElementById("agy-byok-scroll-css");
      if (existingStyle) existingStyle.remove();

      var _style = document.createElement("style");
      _style.id = "agy-byok-scroll-css";
      _style.textContent = `
/* Antigravity BYOK Model Menu Scrollbar & Panel Constraints */
/* Global: eliminate stepper buttons and arrows on all WebKit scrollbars */
*::-webkit-scrollbar-button,
::-webkit-scrollbar-button {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}

/* 1. COMPLETELY HIDE and DISABLE outer scrollbars */
.scrollbar-none,
[role="menu"],
[data-base-ui-popup],
[data-radix-popper-content-wrapper],
[data-radix-popper-content-wrapper] > div,
[data-testid="model-selector-panel"],
#agy-settings-card,
#agy-settings-overlay,
#agy-modal-card,
#agy-modal-overlay {
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}

.scrollbar-none::-webkit-scrollbar,
[role="menu"]::-webkit-scrollbar,
[data-base-ui-popup]::-webkit-scrollbar,
[data-radix-popper-content-wrapper]::-webkit-scrollbar,
[data-radix-popper-content-wrapper] > div::-webkit-scrollbar,
[data-testid="model-selector-panel"]::-webkit-scrollbar,
#agy-settings-card::-webkit-scrollbar,
#agy-settings-overlay::-webkit-scrollbar,
#agy-modal-card::-webkit-scrollbar,
#agy-modal-overlay::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}

[data-testid="model-selector-panel"] {
  max-height: min(520px, 75vh) !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
}

/* Outer layout wrapper must NOT scroll (prevents duplicate scrollbar) */
[data-testid="model-selector-panel"] > div:first-child {
  overflow: hidden !important;
  max-height: none !important;
  display: flex !important;
  flex-direction: column !important;
  flex-grow: 1 !important;
  min-height: 0 !important;
}

/* 2. INNER SCROLLBAR: Native overlay style that fades out in idle and appears smoothly on hover */
.custom-scrollbar {
  overflow-y: auto !important;
  overflow-x: hidden !important;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px !important;
  height: 6px !important;
}

.custom-scrollbar::-webkit-scrollbar-button {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent !important;
}

.custom-scrollbar::-webkit-scrollbar-corner {
  background: transparent !important;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: transparent !important;
  border-radius: 9999px !important;
  transition: background-color 0.2s ease-in-out !important;
}

.custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background: rgba(140, 140, 140, 0.45) !important;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(180, 180, 180, 0.75) !important;
}

.custom-scrollbar::-webkit-scrollbar-thumb:active {
  background: rgba(200, 200, 200, 0.9) !important;
}

/* Explicitly disable scrolling and height constraints on internal groups/sections so the entire area scrolls together */
[data-testid="model-selector-panel"] [data-testid="model-selector-header"] ~ *,
[data-testid="model-selector-panel"] .agy-custom-model-row,
[data-testid="model-selector-panel"] .agy-custom-model-row * {
  overflow: visible !important;
  max-height: none !important;
}
`;
      document.head.appendChild(_style);
    }
  } catch (_e) {}

  var icons = {
    openrouter: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
    openai: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M22.28 10.37a7.7 7.7 0 0 0-.6-5.83 7.8 7.8 0 0 0-7.3-3.9 7.7 7.7 0 0 0-5.87 2.65 7.7 7.7 0 0 0-4.8 3.52 7.7 7.7 0 0 0-.96 6.04 7.7 7.7 0 0 0 .6 5.83 7.8 7.8 0 0 0 7.3 3.9 7.7 7.7 0 0 0 5.87-2.65 7.7 7.7 0 0 0 4.8-3.52 7.7 7.7 0 0 0 .96-6.04z"/></svg>',
    deepseek: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
    ollama: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M12 8v8M8 12h8"/></svg>',
    anthropic: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-6h2v6zm4 0h-2v-4h2v4zm-2-8c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/></svg>',
    groq: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    mistral: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
    cerebras: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/></svg>',
    kimi: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
    fireworks: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg>',
    lmstudio: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>',
    google: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14.93V17a1 1 0 0 1-2 0v-.07A8 8 0 0 1 4.07 13H5a1 1 0 0 1 0-2h-.93A8 8 0 0 1 11 4.07V5a1 1 0 0 1 2 0v-.93A8 8 0 0 1 19.93 11H19a1 1 0 0 1 0 2h.93A8 8 0 0 1 13 16.93z"/></svg>',
    custom: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
  };

  var provLabels = {
    google: "Google Native (Gemini)",
    openrouter: "OpenRouter",
    openai: "OpenAI",
    anthropic: "Anthropic",
    deepseek: "DeepSeek",
    ollama: "Ollama (Local)",
    groq: "Groq",
    mistral: "Mistral",
    cerebras: "Cerebras",
    kimi: "Kimi",
    together: "Together AI",
    fireworks: "Fireworks",
    lmstudio: "LM Studio",
    llamacpp: "llama.cpp",
    nvidia: "NVIDIA",
    custom: "Custom / Outros"
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

  // ==========================================
  // MODAL 1: ADD / EDIT MODEL (PURE MODEL FORM, NO TABS)
  // ==========================================
  function openAddModelModal(initialProvider, editModelName, initialTab) {
    // If called with 'cost', forward directly to BYOK settings modal
    if (initialTab === 'cost') {
      openByokSettingsModal('cost');
      return;
    }

    var existing = document.getElementById('agy-modal-overlay');
    if (existing) existing.remove();
    var existingSettings = document.getElementById('agy-settings-overlay');
    if (existingSettings) existingSettings.remove();

    var isEdit = !!editModelName;
    var baseEditName = isEdit
      ? String(editModelName).replace(/\s*\((default|low|medium|high|xhigh|extra|max)(?:\s+thinking)?\)\s*$/i, '').trim()
      : '';
    var isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    var overlay = document.createElement('div');
    overlay.id = 'agy-modal-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background-color:rgba(0,0,0,0.65);backdrop-filter:blur(6px);display:flex;justify-content:center;align-items:center;z-index:999999;opacity:0;transition:opacity 0.2s ease-in-out;';

    var modal = document.createElement('div');
    modal.id = 'agy-modal-card';
    modal.style.cssText = 'width:560px;max-height:92vh;overflow-y:auto;background-color:#18181b;border:1px solid #27272a;border-radius:16px;padding:26px;box-shadow:0 25px 35px -5px rgba(0,0,0,0.6);color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;transform:scale(0.92) translateY(15px);transition:transform 0.2s cubic-bezier(0.34,1.56,0.64,1);';

    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">';
    html += '<div style="display:flex;align-items:center;gap:10px;"><div id="agy-prov-icon" style="width:32px;height:32px;border-radius:8px;background:#6366f120;color:#818cf8;display:flex;align-items:center;justify-content:center;">' + (icons.openrouter) + '</div>';
    html += '<h3 id="agy-modal-title" style="margin:0;font-size:18px;font-weight:600;">' + (isEdit ? 'Editar Modelo Customizado' : 'Adicionar Modelo Customizado') + '</h3></div>';
    html += '<button id="agy-btn-close" type="button" style="background:transparent;border:none;color:#71717a;cursor:pointer;font-size:22px;line-height:1;padding:4px;">&times;</button></div>';

    if (isOffline) {
      html += '<div style="background:#ef444420;border:1px solid #ef444460;border-radius:8px;padding:10px 14px;font-size:12px;color:#fca5a5;margin-bottom:14px;display:flex;align-items:center;gap:8px;">⚠️ <strong>Você está offline.</strong> Conecte-se para listar e adicionar modelos com limites automáticos.</div>';
    }

    html += '<div style="display:flex;flex-direction:column;gap:14px;margin-bottom:20px;">';
    html += '<div><label style="font-size:12px;font-weight:500;color:#a1a1aa;margin-bottom:4px;display:block;">Provedor</label>';
    html += '<select id="agy-sel-prov" style="width:100%;background:#27272a;border:1px solid #3f3f46;border-radius:8px;color:#f4f4f5;padding:8px 10px;font-size:13px;outline:none;"><option value="openrouter">OpenRouter</option><option value="deepseek">DeepSeek</option><option value="openai">OpenAI</option><option value="ollama">Ollama (Local)</option><option value="groq">Groq</option><option value="mistral">Mistral</option><option value="cerebras">Cerebras</option><option value="anthropic">Anthropic</option><option value="kimi">Kimi (Moonshot)</option><option value="fireworks">Fireworks</option><option value="lmstudio">LM Studio (Local)</option><option value="custom">Custom / Compatível OpenAI</option></select></div>';

    html += '<div><label style="font-size:12px;font-weight:500;color:#a1a1aa;margin-bottom:4px;display:flex;align-items:center;justify-content:space-between;"><span>⭐ Modelos Populares</span><div style="display:flex;align-items:center;gap:6px;"><button id="agy-btn-fetch-prov" type="button" style="background:#27272a;border:1px solid #3f3f46;border-radius:6px;color:#a1a1aa;padding:2px 8px;font-size:11px;cursor:pointer;">↻ Buscar Modelos</button><span id="agy-pop-loading" style="font-size:11px;color:#71717a;display:none;">buscando...</span></div></label>';
    html += '<div id="agy-pop-pills" style="display:flex;flex-wrap:wrap;gap:6px;min-height:28px;"></div></div>';

    html += '<div style="position:relative;"><label style="font-size:12px;font-weight:500;color:#a1a1aa;margin-bottom:4px;display:block;">Modelo <span style="color:#ef4444;">*</span></label>';
    html += '<select id="agy-sel-model" style="width:100%;background:#27272a;border:1px solid #3f3f46;border-radius:8px;color:#f4f4f5;padding:8px 10px;font-size:13px;outline:none;cursor:pointer;"><option value="" disabled selected>-- Carregando modelos... --</option><option value="__custom__">➕ Outro (digitar ID manualmente...)</option></select>';
    html += '<div id="agy-box-custom-model" style="margin-top:8px;position:relative;display:none;"><input id="agy-inp-model" placeholder="ex: google/gemini-2.5-flash ou deepseek/deepseek-chat" style="width:100%;box-sizing:border-box;background:#27272a;border:1px solid #3f3f46;border-radius:8px;color:#f4f4f5;padding:8px 10px;font-size:13px;outline:none;" />';
    html += '<div id="agy-model-dd" style="position:absolute;top:100%;left:0;right:0;max-height:160px;overflow-y:auto;background:#27272a;border:1px solid #3f3f46;border-radius:8px;margin-top:4px;z-index:50;display:none;box-shadow:0 10px 15px -3px rgba(0,0,0,0.5);"></div></div></div>';

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
    var selModel = document.getElementById('agy-sel-model');
    var boxCustomModel = document.getElementById('agy-box-custom-model');
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
    var isCustomId = false;

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

    var currentEditingModel = null;
    var existingCustomModels = [];

    var isModelAlreadyAdded = function(modelId, provider) {
      if (!modelId) return false;
      var prov = (provider || selProv.value || '').trim().toLowerCase();
      var normId = String(modelId).trim().toLowerCase();
      if (isEdit && currentEditingModel) {
        var curExt = (currentEditingModel.externalModelName || currentEditingModel.name || '').trim().toLowerCase();
        var curName = (currentEditingModel.displayName || currentEditingModel.name || '').trim().toLowerCase();
        var curRaw = (currentEditingModel.name || '').replace(/^models\//, '').trim().toLowerCase();
        if (curExt === normId || curName === normId || curRaw === normId ||
            (curExt && normId && (curExt.endsWith('/' + normId) || normId.endsWith('/' + curExt)))) {
          return false;
        }
      }
      return existingCustomModels.some(function(m) {
        var mProv = (m.provider || 'custom').trim().toLowerCase();
        if (mProv !== prov && prov !== 'custom' && mProv !== 'custom') return false;
        var ext = (m.externalModelName || m.name || '').trim().toLowerCase();
        var name = (m.displayName || m.name || '').trim().toLowerCase();
        var rawName = (m.name || '').replace(/^models\//, '').trim().toLowerCase();
        return ext === normId || name === normId || rawName === normId ||
               (ext && normId && (ext.endsWith('/' + normId) || normId.endsWith('/' + ext)));
      });
    };

    var renderPopPills = function() {
      if (!popPills) return;
      popPills.innerHTML = '';
      var p = selProv.value;
      var pops = (provModels || []).filter(function(m) { return m.isPopular; });
      if (!pops.length) {
        popPills.innerHTML = '<span style="font-size:11px;color:#71717a;">Nenhum modelo popular padrão. Clique em "↻ Buscar Modelos".</span>';
        return;
      }
      pops.forEach(function(m) {
        var pill = document.createElement('button');
        pill.type = 'button';
        var already = isModelAlreadyAdded(m.id, p);
        if (already) {
          pill.disabled = true;
          pill.style.cssText = 'background:#27272a;border:1px solid #3f3f46;border-radius:12px;color:#71717a;opacity:0.6;padding:2px 10px;font-size:11px;cursor:not-allowed;display:inline-flex;align-items:center;gap:4px;';
          pill.textContent = (m.displayName || m.id) + ' (Já adicionado)';
        } else {
          pill.style.cssText = 'background:#27272a;border:1px solid #3f3f46;border-radius:12px;color:#e4e4e7;padding:2px 10px;font-size:11px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;';
          pill.textContent = m.displayName || m.id;
          pill.onclick = function() {
            selectModelOption(m.id);
          };
        }
        popPills.appendChild(pill);
      });
    };

    var renderModelDropdown = function(filter) {
      if (!modelDd) return;
      var q = (filter || '').toLowerCase();
      var filtered = (provModels || []).filter(function(m) {
        return m.id.toLowerCase().includes(q) || (m.displayName && m.displayName.toLowerCase().includes(q));
      }).slice(0, 30);

      modelDd.innerHTML = '';
      if (!filtered.length) {
        modelDd.style.display = 'none';
        return;
      }
      filtered.forEach(function(m) {
        var item = document.createElement('div');
        var already = isModelAlreadyAdded(m.id, selProv.value);
        if (already) {
          item.style.cssText = 'padding:6px 10px;font-size:12px;color:#71717a;cursor:not-allowed;opacity:0.6;border-bottom:1px solid #3f3f4630;display:flex;justify-content:space-between;align-items:center;';
          item.innerHTML = '<span>' + (m.displayName || m.id) + ' (Já adicionado)</span><span style="font-size:10px;color:#71717a;font-family:monospace;">' + m.id + '</span>';
        } else {
          item.style.cssText = 'padding:6px 10px;font-size:12px;color:#f4f4f5;cursor:pointer;border-bottom:1px solid #3f3f4630;display:flex;justify-content:space-between;align-items:center;';
          item.innerHTML = '<span>' + (m.displayName || m.id) + '</span><span style="font-size:10px;color:#a1a1aa;font-family:monospace;">' + m.id + '</span>';
          item.onmouseenter = function() { item.style.background = '#3f3f46'; };
          item.onmouseleave = function() { item.style.background = 'transparent'; };
          item.onclick = function() {
            inpModel.value = m.id;
            inpName.value = m.displayName || m.id;
            updateLimits(m.contextWindow, m.maxOutputTokens);
            modelDd.style.display = 'none';
          };
        }
        modelDd.appendChild(item);
      });
      modelDd.style.display = 'block';
    };

    var selectModelOption = function(modelId) {
      var found = (provModels || []).find(function(m) { return m.id === modelId; });
      if (found) {
        selModel.value = modelId;
        isCustomId = false;
        boxCustomModel.style.display = 'none';
        inpModel.value = found.id;
        if (!inpName.value || inpName.value === inpModel.value) {
          inpName.value = found.displayName || found.id;
        }
        updateLimits(found.contextWindow, found.maxOutputTokens);
      } else {
        selModel.value = '__custom__';
        isCustomId = true;
        boxCustomModel.style.display = 'block';
        inpModel.value = modelId;
      }
    };

    var fetchModelsForProvider = function(prov, preserveModelId) {
      if (popLoading) popLoading.style.display = 'inline';
      if (btnFetchProv) btnFetchProv.disabled = true;

      fetch('http://127.0.0.1:50999/v1internal/providerModels?provider=' + encodeURIComponent(prov))
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (popLoading) popLoading.style.display = 'none';
          if (btnFetchProv) btnFetchProv.disabled = false;
          provModels = (data && data.models) ? data.models : [];

          selModel.innerHTML = '';
          if (!provModels.length) {
            selModel.innerHTML = '<option value="__custom__" selected>➕ Digitar ID do modelo manualmente...</option>';
            isCustomId = true;
            boxCustomModel.style.display = 'block';
          } else {
            var defaultOpt = document.createElement('option');
            defaultOpt.value = '';
            defaultOpt.disabled = true;
            defaultOpt.selected = !preserveModelId;
            defaultOpt.textContent = '-- Selecione um modelo --';
            selModel.appendChild(defaultOpt);

            provModels.forEach(function(m) {
              var opt = document.createElement('option');
              opt.value = m.id;
              var already = isModelAlreadyAdded(m.id, prov);
              if (already) {
                opt.disabled = true;
                opt.style.color = '#71717a';
                opt.textContent = (m.displayName || m.id) + (m.isPopular ? ' ⭐' : '') + ' — ✔ Já adicionado';
              } else {
                opt.textContent = (m.displayName || m.id) + (m.isPopular ? ' ⭐' : '');
              }
              selModel.appendChild(opt);
            });

            var customOpt = document.createElement('option');
            customOpt.value = '__custom__';
            customOpt.textContent = '➕ Outro (digitar ID manualmente...)';
            selModel.appendChild(customOpt);

            if (preserveModelId) {
              selectModelOption(preserveModelId);
            } else if (provModels.length > 0) {
              var firstAvailable = provModels.find(function(m) { return !isModelAlreadyAdded(m.id, prov); });
              if (firstAvailable) {
                selectModelOption(firstAvailable.id);
              } else {
                selectModelOption(provModels[0].id);
              }
            }
          }
          renderPopPills();
        })
        .catch(function(err) {
          if (popLoading) popLoading.style.display = 'none';
          if (btnFetchProv) btnFetchProv.disabled = false;
          selModel.innerHTML = '<option value="__custom__" selected>➕ Digitar ID manualmente (offline)</option>';
          isCustomId = true;
          boxCustomModel.style.display = 'block';
          renderPopPills();
        });
    };

    var refreshExistingCustomModels = function(callback) {
      fetch('http://127.0.0.1:50999/v1internal/customModels')
        .then(function(r) { return r.json(); })
        .then(function(data) {
          existingCustomModels = Array.isArray(data) ? data : (data.models || []);
          renderPopPills();
          if (callback) callback();
        })
        .catch(function() {
          if (callback) callback();
        });
    };

    var onProviderChange = function(newProv, preserveModelId) {
      provIcon.innerHTML = icons[newProv] || icons.custom;
      var defUrl = defaultUrls[newProv] || '';
      inpUrl.value = defUrl;

      // Look up if user previously saved an API key for this provider
      var sameProvModel = existingCustomModels.find(function(m) {
        return (m.provider || 'custom').toLowerCase() === newProv.toLowerCase() && m.apiKey;
      });
      if (sameProvModel && !inpKey.value) {
        inpKey.value = sameProvModel.apiKey;
      }

      if (newProv === 'ollama' || newProv === 'lmstudio') {
        boxKey.style.display = 'none';
        inpKey.value = 'dummy';
      } else {
        boxKey.style.display = 'block';
        if (inpKey.value === 'dummy') inpKey.value = '';
      }

      fetchModelsForProvider(newProv, preserveModelId);
    };

    selProv.onchange = function() {
      onProviderChange(selProv.value);
    };

    if (btnFetchProv) {
      btnFetchProv.onclick = function() {
        fetchModelsForProvider(selProv.value, inpModel.value);
      };
    }

    selModel.onchange = function() {
      if (selModel.value === '__custom__') {
        isCustomId = true;
        boxCustomModel.style.display = 'block';
        inpModel.focus();
      } else {
        isCustomId = false;
        boxCustomModel.style.display = 'none';
        var found = provModels.find(function(m) { return m.id === selModel.value; });
        if (found) {
          inpModel.value = found.id;
          inpName.value = found.displayName || found.id;
          updateLimits(found.contextWindow, found.maxOutputTokens);
        }
      }
    };

    inpModel.oninput = function() {
      renderModelDropdown(inpModel.value);
    };

    inpModel.onblur = function() {
      if (!inpModel.value.trim()) return;
      fetch('http://127.0.0.1:50999/v1internal/detectModelLimits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: inpModel.value.trim() })
      }).then(function(r) { return r.json(); }).then(function(spec) {
        if (spec && spec.contextWindow) updateLimits(spec.contextWindow, spec.maxOutputTokens);
      }).catch(function() {});
    };

    document.addEventListener('click', function(e) {
      if (modelDd && !modelDd.contains(e.target) && e.target !== inpModel) {
        modelDd.style.display = 'none';
      }
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
        var delName = baseEditName || editModelName;
        if (!confirm('Deseja realmente remover o modelo "' + delName + '"?')) return;
        btnDelete.disabled = true;
        btnDelete.textContent = 'Removendo...';
        fetch('http://127.0.0.1:50999/v1internal/deleteCustomModel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelName: delName })
        }).then(function(r) { return r.json(); }).then(function(res) {
          btnDelete.disabled = false;
          btnDelete.textContent = 'Remover';
          if (res.success) {
            try {
              if (typeof window._cachedCustomModels !== 'undefined' && Array.isArray(window._cachedCustomModels)) {
                window._cachedCustomModels = window._cachedCustomModels.filter(function(x) {
                  var dn = x.displayName || x.name;
                  return dn !== editModelName && dn !== baseEditName && x.name !== editModelName && x.name !== baseEditName;
                });
              }
            } catch(_) {}
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
        modelObj.oldLabel = baseEditName || editModelName;
      }

      fetch('http://127.0.0.1:50999/v1internal/saveCustomModel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modelObj)
      }).then(function(r) { return r.json(); }).then(function(res) {
        btnSave.disabled = false;
        btnSave.textContent = isEdit ? 'Atualizar Modelo' : 'Salvar Modelo';
        if (res.success) {
          try {
            if (typeof window._cachedCustomModels !== 'undefined' && Array.isArray(window._cachedCustomModels)) {
              var fIdx = window._cachedCustomModels.findIndex(function(x) {
                var dn = x.displayName || x.name;
                return (isEdit && editModelName && (dn === editModelName || dn === baseEditName || x.name === editModelName || x.name === baseEditName)) || dn === dispName || x.name === modelObj.name;
              });
              if (fIdx >= 0) {
                window._cachedCustomModels[fIdx] = Object.assign({}, window._cachedCustomModels[fIdx], modelObj);
              } else {
                window._cachedCustomModels.push(modelObj);
              }
            }
          } catch(_) {}
          if (typeof window._fetchCustomModelsAsync === 'function') window._fetchCustomModelsAsync();
          else if (typeof _fetchCustomModelsAsync === 'function') _fetchCustomModelsAsync();
          try { window.__agy_onModelsUpdated?.(); } catch(_) {}
          try { window.__agy_selectSavedModel?.(dispName, mId, prov); } catch(_) {}
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

    // Initialize Add / Edit form
    refreshExistingCustomModels(function() {
      var targetProv = (initialProvider || 'openrouter').toLowerCase();
      if (initialProvider || isEdit) {
        selProv.disabled = true;
        selProv.style.opacity = '0.7';
        selProv.style.cursor = 'not-allowed';
        selProv.title = 'Provedor fixado para esta operação';
      }
      if (isEdit) {
        var mod = existingCustomModels.find(function(m) {
          var dn = m.displayName || m.name;
          return dn === editModelName || dn === baseEditName || m.name === editModelName || m.name === baseEditName;
        });
        if (mod) {
          currentEditingModel = mod;
          targetProv = (mod.provider || 'custom').toLowerCase();
          selProv.value = targetProv;
          inpName.value = mod.displayName || mod.name || '';
          inpKey.value = mod.apiKey || '';
          inpUrl.value = mod.apiUrl || defaultUrls[targetProv] || '';
          updateLimits(mod.maxTokens || 128000, mod.maxOutputTokens || 8192);
          onProviderChange(targetProv, mod.externalModelName || mod.name);
          return;
        }
      }
      selProv.value = targetProv;
      onProviderChange(targetProv);
    });
  }

  // ==========================================
  // MODAL 2: BYOK SETTINGS (CONFIGURAÇÕES: PROVEDORES & CUSTOS COM ABAS)
  // ==========================================
  function openByokSettingsModal(initialTab) {
    var existing = document.getElementById('agy-settings-overlay');
    if (existing) existing.remove();
    var existingModelModal = document.getElementById('agy-modal-overlay');
    if (existingModelModal) existingModelModal.remove();

    var overlay = document.createElement('div');
    overlay.id = 'agy-settings-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background-color:rgba(0,0,0,0.65);backdrop-filter:blur(6px);display:flex;justify-content:center;align-items:center;z-index:999999;opacity:0;transition:opacity 0.2s ease-in-out;overflow:hidden;';

    var modal = document.createElement('div');
    modal.id = 'agy-settings-card';
    modal.style.cssText = 'width:640px;max-height:85vh;display:flex;flex-direction:column;overflow:hidden;scrollbar-width:none;-ms-overflow-style:none;background-color:#18181b;border:1px solid #27272a;border-radius:16px;padding:24px;box-shadow:0 25px 35px -5px rgba(0,0,0,0.6);color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;transform:scale(0.92) translateY(15px);transition:transform 0.2s cubic-bezier(0.34,1.56,0.64,1);';

    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">';
    html += '<div style="display:flex;align-items:center;gap:10px;">';
    html += '<div style="width:34px;height:34px;border-radius:8px;background:#3b82f620;color:#60a5fa;display:flex;align-items:center;justify-content:center;">';
    html += '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
    html += '</div>';
    html += '<div><h3 style="margin:0;font-size:18px;font-weight:600;">Configurações BYOK</h3>';
    html += '<p style="margin:2px 0 0 0;font-size:11px;color:#a1a1aa;">Gerenciamento de provedores customizados e controle de custos</p></div>';
    html += '</div>';
    html += '<button id="agy-set-btn-close" type="button" style="background:transparent;border:none;color:#71717a;cursor:pointer;font-size:22px;line-height:1;padding:4px;">&times;</button></div>';

    // Settings Navigation Tabs
    html += '<div style="display:flex;gap:6px;margin-bottom:18px;border-bottom:1px solid #27272a;padding-bottom:10px;">';
    html += '<button id="agy-set-tab-provs" type="button" style="background:#27272a;border:1px solid #3f3f46;border-radius:8px;color:#f4f4f5;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">🏢 Provedores Configurados</button>';
    html += '<button id="agy-set-tab-costs" type="button" style="background:transparent;border:1px solid transparent;border-radius:8px;color:#a1a1aa;padding:7px 16px;font-size:13px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:6px;">💰 Custos & Tokens</button>';
    html += '</div>';

    // TAB 1: PROVIDERS & MODELS VIEW
    html += '<div id="agy-set-view-provs" style="display:flex;flex-direction:column;gap:16px;flex:1;min-height:0;overflow-y:auto;padding-right:4px;" class="custom-scrollbar">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
    html += '<div><div style="font-size:13px;font-weight:600;color:#f4f4f5;">Provedores e Modelos Ativos</div>';
    html += '<div style="font-size:11px;color:#a1a1aa;">Visualize os provedores configurados e gerencie seus modelos customizados</div></div>';
    html += '<button id="agy-btn-set-add-model" type="button" style="background:#3b82f6;border:none;border-radius:8px;color:#fff;padding:6px 14px;font-size:12px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:6px;">➕ Adicionar Modelo</button>';
    html += '</div>';
    html += '<div id="agy-set-provs-container" style="display:flex;flex-direction:column;gap:12px;">';
    html += '<div style="font-size:12px;color:#71717a;text-align:center;padding:24px 0;">Carregando provedores configurados...</div>';
    html += '</div>';
    html += '<div style="display:flex;justify-content:flex-end;margin-top:auto;padding-top:10px;">';
    html += '<button id="agy-set-btn-close-provs" type="button" style="background:#27272a;border:1px solid #3f3f46;border-radius:8px;color:#e4e4e7;padding:8px 18px;font-size:13px;cursor:pointer;">Fechar</button>';
    html += '</div>';
    html += '</div>';

    // TAB 2: COSTS & TOKENS VIEW
    html += '<div id="agy-set-view-costs" style="display:none;flex-direction:column;gap:16px;flex:1;min-height:0;overflow-y:auto;padding-right:4px;" class="custom-scrollbar">';
    // Global Section
    html += '<div style="background:#27272a40;border:1px solid #3f3f46;border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:12px;">';
    html += '<div style="font-size:12px;font-weight:600;color:#93c5fd;text-transform:uppercase;letter-spacing:0.05em;">🌐 Configurações Globais Padrão</div>';

    html += '<label style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;">';
    html += '<div><div style="font-size:13px;font-weight:600;color:#f4f4f5;">Exibir badges de custo e tokens nas respostas</div>';
    html += '<div style="font-size:11px;color:#a1a1aa;margin-top:2px;">Mostra provedor, contagem de tokens (input/output) e valor estimado nas mensagens</div></div>';
    html += '<input type="checkbox" id="agy-set-cost-badges" style="width:18px;height:18px;cursor:pointer;accent-color:#3b82f6;" checked />';
    html += '</label>';

    html += '<label style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;border-top:1px solid #3f3f4650;padding-top:10px;">';
    html += '<div><div style="font-size:13px;font-weight:600;color:#f4f4f5;">Exibir custo acumulado da conversa</div>';
    html += '<div style="font-size:11px;color:#a1a1aa;margin-top:2px;">Acumula o total gasto na sessão (ex: Total: $0.0142) no rodapé do badge</div></div>';
    html += '<input type="checkbox" id="agy-set-cost-session" style="width:18px;height:18px;cursor:pointer;accent-color:#3b82f6;" checked />';
    html += '</label>';
    html += '</div>';

    // Provider Overrides Section
    html += '<div style="background:#27272a40;border:1px solid #3f3f46;border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:10px;">';
    html += '<div>';
    html += '<div style="font-size:12px;font-weight:600;color:#93c5fd;text-transform:uppercase;letter-spacing:0.05em;">🏢 Configurações Específicas por Provedor</div>';
    html += '<div style="font-size:11px;color:#a1a1aa;margin-top:3px;">A configuração do provedor sobrescreve o padrão global. Caso selecione "Herdar Padrão Global", respeitará os toggles acima.</div>';
    html += '</div>';

    html += '<div id="agy-set-cost-overrides-list" style="display:flex;flex-direction:column;gap:8px;">';
    html += '<div style="font-size:12px;color:#71717a;text-align:center;padding:14px 0;">Carregando provedores...</div>';
    html += '</div>';
    html += '</div>';

    html += '<div id="agy-set-cost-status" style="display:none;font-size:12px;padding:8px 12px;border-radius:6px;"></div>';

    html += '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:auto;padding-top:10px;">';
    html += '<button id="agy-set-btn-cost-cancel" type="button" style="background:#27272a;border:1px solid #3f3f46;border-radius:8px;color:#e4e4e7;padding:8px 16px;font-size:13px;cursor:pointer;">Fechar</button>';
    html += '<button id="agy-set-btn-cost-save" type="button" style="background:#3b82f6;border:none;border-radius:8px;color:#fff;padding:8px 18px;font-size:13px;font-weight:500;cursor:pointer;">Salvar Preferências</button>';
    html += '</div>';
    html += '</div>';

    modal.innerHTML = html;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    setTimeout(function() { overlay.style.opacity = '1'; modal.style.transform = 'scale(1) translateY(0)'; }, 10);

    var closeSettingsModal = function() {
      overlay.style.opacity = '0';
      modal.style.transform = 'scale(0.92) translateY(15px)';
      setTimeout(function() { overlay.remove(); }, 200);
    };

    document.getElementById('agy-set-btn-close').onclick = closeSettingsModal;
    document.getElementById('agy-set-btn-close-provs').onclick = closeSettingsModal;
    document.getElementById('agy-set-btn-cost-cancel').onclick = closeSettingsModal;
    overlay.onclick = function(e) { if (e.target === overlay) closeSettingsModal(); };

    var tabBtnProvs = document.getElementById('agy-set-tab-provs');
    var tabBtnCosts = document.getElementById('agy-set-tab-costs');
    var viewProvs = document.getElementById('agy-set-view-provs');
    var viewCosts = document.getElementById('agy-set-view-costs');

    var switchSettingsTab = function(tab) {
      if (tab === 'cost') {
        tabBtnProvs.style.background = 'transparent';
        tabBtnProvs.style.borderColor = 'transparent';
        tabBtnProvs.style.color = '#a1a1aa';
        tabBtnProvs.style.fontWeight = '500';

        tabBtnCosts.style.background = '#27272a';
        tabBtnCosts.style.borderColor = '#3f3f46';
        tabBtnCosts.style.color = '#f4f4f5';
        tabBtnCosts.style.fontWeight = '600';

        viewProvs.style.display = 'none';
        viewCosts.style.display = 'flex';
        loadCostOverrides();
      } else {
        tabBtnCosts.style.background = 'transparent';
        tabBtnCosts.style.borderColor = 'transparent';
        tabBtnCosts.style.color = '#a1a1aa';
        tabBtnCosts.style.fontWeight = '500';

        tabBtnProvs.style.background = '#27272a';
        tabBtnProvs.style.borderColor = '#3f3f46';
        tabBtnProvs.style.color = '#f4f4f5';
        tabBtnProvs.style.fontWeight = '600';

        viewCosts.style.display = 'none';
        viewProvs.style.display = 'flex';
        loadConfiguredProviders();
      }
    };

    tabBtnProvs.onclick = function() { switchSettingsTab('provs'); };
    tabBtnCosts.onclick = function() { switchSettingsTab('cost'); };

    document.getElementById('agy-btn-set-add-model').onclick = function() {
      closeSettingsModal();
      openAddModelModal();
    };

    // Load Providers View
    var loadConfiguredProviders = function() {
      var cont = document.getElementById('agy-set-provs-container');
      if (!cont) return;

      fetch('http://127.0.0.1:50999/v1internal/customModels')
        .then(function(r) { return r.json(); })
        .then(function(data) {
          var models = Array.isArray(data) ? data : (data.models || []);
          if (!models.length) {
            cont.innerHTML = '<div style="background:#27272a30;border:1px dashed #3f3f46;border-radius:10px;padding:32px 16px;text-align:center;"><div style="font-size:14px;font-weight:600;color:#e4e4e7;margin-bottom:6px;">Nenhum modelo customizado cadastrado</div><div style="font-size:12px;color:#a1a1aa;margin-bottom:16px;">Adicione seu primeiro modelo usando chaves do OpenRouter, DeepSeek, OpenAI ou modelos locais via Ollama.</div><button id="agy-set-btn-add-first" type="button" style="background:#3b82f6;border:none;border-radius:8px;color:#fff;padding:8px 18px;font-size:12px;font-weight:500;cursor:pointer;">➕ Adicionar Primeiro Modelo</button></div>';
            var btnFirst = document.getElementById('agy-set-btn-add-first');
            if (btnFirst) btnFirst.onclick = function() { closeSettingsModal(); openAddModelModal(); };
            return;
          }

          // Group by provider
          var provGroups = {};
          models.forEach(function(m) {
            var p = (m.provider || 'custom').trim().toLowerCase();
            if (!provGroups[p]) provGroups[p] = [];
            provGroups[p].push(m);
          });

          cont.innerHTML = '';
          Object.keys(provGroups).forEach(function(pKey) {
            var items = provGroups[pKey];
            var pLabel = provLabels[pKey] || (pKey.charAt(0).toUpperCase() + pKey.slice(1));
            var pIcon = icons[pKey] || icons.custom;
            var sampleUrl = items[0]?.apiUrl || defaultUrls[pKey] || '';

            var card = document.createElement('div');
            card.style.cssText = 'background:#27272a40;border:1px solid #3f3f46;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px;';

            var cardHead = '<div style="display:flex;justify-content:space-between;align-items:center;">';
            cardHead += '<div style="display:flex;align-items:center;gap:10px;">';
            cardHead += '<div style="width:28px;height:28px;border-radius:6px;background:#6366f120;color:#818cf8;display:flex;align-items:center;justify-content:center;">' + pIcon + '</div>';
            cardHead += '<div><span style="font-size:14px;font-weight:600;color:#f4f4f5;">' + pLabel + '</span>';
            cardHead += '<span style="margin-left:8px;background:#3f3f46;color:#d4d4d8;font-size:10px;padding:2px 7px;border-radius:10px;font-weight:500;">' + items.length + ' modelo(s)</span></div></div>';
            cardHead += '<button class="agy-card-btn-add-prov" data-provider="' + pKey + '" type="button" style="background:#27272a;border:1px solid #3f3f46;border-radius:6px;color:#93c5fd;padding:4px 10px;font-size:11px;cursor:pointer;">➕ Adicionar com ' + pLabel + '</button>';
            cardHead += '</div>';

            if (sampleUrl) {
              cardHead += '<div style="font-size:11px;color:#71717a;font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + sampleUrl + '</div>';
            }

            var modelList = document.createElement('div');
            modelList.style.cssText = 'display:flex;flex-direction:column;gap:4px;border-top:1px solid #3f3f4650;padding-top:8px;';

            items.forEach(function(m) {
              var mRow = document.createElement('div');
              mRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:5px 8px;border-radius:6px;background:#18181b80;';
              var mName = m.displayName || m.name;
              var mExt = m.externalModelName || m.name;

              mRow.innerHTML = '<div style="display:flex;align-items:center;gap:8px;min-width:0;"><span style="font-size:12px;font-weight:500;color:#e4e4e7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + mName + '</span><span style="font-size:10px;color:#71717a;font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">(' + mExt + ')</span></div>';

              var editBtn = document.createElement('button');
              editBtn.type = 'button';
              editBtn.style.cssText = 'background:transparent;border:1px solid #3f3f46;border-radius:4px;color:#a1a1aa;padding:2px 8px;font-size:11px;cursor:pointer;flex-shrink:0;';
              editBtn.textContent = 'Editar';
              editBtn.onclick = function() {
                closeSettingsModal();
                openAddModelModal(pKey, mName);
              };

              mRow.appendChild(editBtn);
              modelList.appendChild(mRow);
            });

            card.innerHTML = cardHead;
            card.appendChild(modelList);
            cont.appendChild(card);
          });

          // Bind card add buttons
          cont.querySelectorAll('.agy-card-btn-add-prov').forEach(function(btn) {
            btn.onclick = function() {
              var prov = btn.getAttribute('data-provider');
              closeSettingsModal();
              openAddModelModal(prov);
            };
          });
        })
        .catch(function(err) {
          cont.innerHTML = '<div style="font-size:12px;color:#fca5a5;padding:12px;">Erro ao carregar modelos: ' + err.message + '</div>';
        });
    };

    // Load Cost & Tokens Overrides View
    var loadCostOverrides = function() {
      var overridesList = document.getElementById('agy-set-cost-overrides-list');
      if (!overridesList) return;

      Promise.all([
        fetch('http://127.0.0.1:50999/v1internal/costSettings').then(function(r) { return r.json(); }).catch(function() { return {}; }),
        fetch('http://127.0.0.1:50999/v1internal/customModels').then(function(r) { return r.json(); }).catch(function() { return []; })
      ]).then(function(results) {
        var cfg = results[0] || {};
        var rawModels = results[1] || [];
        var models = Array.isArray(rawModels) ? rawModels : (rawModels.models || []);

        var chkBadges = document.getElementById('agy-set-cost-badges');
        var chkSession = document.getElementById('agy-set-cost-session');
        if (chkBadges) chkBadges.checked = cfg.showCostBadges !== false;
        if (chkSession) chkSession.checked = cfg.showSessionTotal !== false;

        var overrides = cfg.providerOverrides || {};

        // Added providers
        var addedProvMap = {};
        models.forEach(function(m) {
          var p = (m.provider || 'custom').trim().toLowerCase();
          if (p) addedProvMap[p] = true;
        });

        var list = [{ id: 'google', label: provLabels.google, icon: icons.google }];
        Object.keys(addedProvMap).forEach(function(p) {
          if (p !== 'google') {
            list.push({
              id: p,
              label: provLabels[p] || (p.charAt(0).toUpperCase() + p.slice(1)),
              icon: icons[p] || icons.custom
            });
          }
        });

        overridesList.innerHTML = '';
        list.forEach(function(p) {
          var ov = overrides[p.id] || {};
          // ov.enabled: boolean | undefined
          // ov.showSessionTotal: boolean | undefined
          var badgeVal = typeof ov.enabled === 'boolean' ? (ov.enabled ? 'enabled' : 'disabled') : 'inherit';
          var sessionVal = typeof ov.showSessionTotal === 'boolean' ? (ov.showSessionTotal ? 'enabled' : 'disabled') : 'inherit';

          var row = document.createElement('div');
          row.style.cssText = 'background:#18181b80;border:1px solid #3f3f4650;border-radius:8px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:12px;';

          var left = '<div style="display:flex;align-items:center;gap:8px;min-width:180px;">';
          left += '<div style="width:24px;height:24px;border-radius:6px;background:#6366f115;color:#818cf8;display:flex;align-items:center;justify-content:center;">' + p.icon + '</div>';
          left += '<span style="font-size:12px;font-weight:600;color:#f4f4f5;">' + p.label + '</span></div>';

          var controls = document.createElement('div');
          controls.style.cssText = 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;';

          // Badge override select
          var bBox = document.createElement('div');
          bBox.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
          bBox.innerHTML = '<span style="font-size:10px;color:#a1a1aa;">Badges:</span>';
          var bSel = document.createElement('select');
          bSel.className = 'agy-ov-badge-sel';
          bSel.setAttribute('data-provider', p.id);
          bSel.style.cssText = 'background:#27272a;border:1px solid #3f3f46;border-radius:6px;color:#f4f4f5;padding:4px 8px;font-size:11px;outline:none;';
          bSel.innerHTML = '<option value="inherit">🌐 Herdar Global</option><option value="enabled">👁️ Sempre Exibir</option><option value="disabled">🚫 Nunca Exibir</option>';
          bSel.value = badgeVal;
          bBox.appendChild(bSel);

          // Session total override select
          var sBox = document.createElement('div');
          sBox.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
          sBox.innerHTML = '<span style="font-size:10px;color:#a1a1aa;">Custo Acumulado:</span>';
          var sSel = document.createElement('select');
          sSel.className = 'agy-ov-session-sel';
          sSel.setAttribute('data-provider', p.id);
          sSel.style.cssText = 'background:#27272a;border:1px solid #3f3f46;border-radius:6px;color:#f4f4f5;padding:4px 8px;font-size:11px;outline:none;';
          sSel.innerHTML = '<option value="inherit">🌐 Herdar Global</option><option value="enabled">👁️ Sempre Exibir</option><option value="disabled">🚫 Nunca Exibir</option>';
          sSel.value = sessionVal;
          sBox.appendChild(sSel);

          controls.appendChild(bBox);
          controls.appendChild(sBox);

          row.innerHTML = left;
          row.appendChild(controls);
          overridesList.appendChild(row);
        });
      }).catch(function(err) {
        overridesList.innerHTML = '<div style="font-size:12px;color:#fca5a5;padding:12px;">Erro ao carregar configurações: ' + err.message + '</div>';
      });
    };

    // Save Cost Settings Handler
    var btnSaveCosts = document.getElementById('agy-set-btn-cost-save');
    var costStatus = document.getElementById('agy-set-cost-status');
    if (btnSaveCosts) {
      btnSaveCosts.onclick = function() {
        btnSaveCosts.disabled = true;
        btnSaveCosts.textContent = 'Salvando...';

        var chkBadges = document.getElementById('agy-set-cost-badges');
        var chkSession = document.getElementById('agy-set-cost-session');

        var providerOverrides = {};
        var bSelectors = document.querySelectorAll('.agy-ov-badge-sel');
        bSelectors.forEach(function(bSel) {
          var prov = bSel.getAttribute('data-provider');
          var sSel = document.querySelector('.agy-ov-session-sel[data-provider="' + prov + '"]');
          if (!prov) return;

          var bVal = bSel.value; // 'inherit' | 'enabled' | 'disabled'
          var sVal = sSel ? sSel.value : 'inherit';

          var ov = {};
          if (bVal === 'enabled') ov.enabled = true;
          else if (bVal === 'disabled') ov.enabled = false;

          if (sVal === 'enabled') ov.showSessionTotal = true;
          else if (sVal === 'disabled') ov.showSessionTotal = false;

          providerOverrides[prov] = ov;
        });

        var payload = {
          showCostBadges: chkBadges ? chkBadges.checked : true,
          showSessionTotal: chkSession ? chkSession.checked : true,
          providerOverrides: providerOverrides
        };

        fetch('http://127.0.0.1:50999/v1internal/costSettings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(function(r) { return r.json(); }).then(function(res) {
          btnSaveCosts.disabled = false;
          btnSaveCosts.textContent = 'Salvar Preferências';
          if (costStatus) {
            costStatus.style.display = 'block';
            costStatus.style.background = '#10b98120';
            costStatus.style.border = '1px solid #10b98160';
            costStatus.style.color = '#6ee7b7';
            costStatus.textContent = '✓ Preferências e overrides de custos salvos com sucesso!';
            setTimeout(function() {
              if (costStatus) costStatus.style.display = 'none';
              closeSettingsModal();
            }, 1000);
          }
        }).catch(function(err) {
          btnSaveCosts.disabled = false;
          btnSaveCosts.textContent = 'Salvar Preferências';
          if (costStatus) {
            costStatus.style.display = 'block';
            costStatus.style.background = '#ef444420';
            costStatus.style.border = '1px solid #ef444460';
            costStatus.style.color = '#fca5a5';
            costStatus.textContent = 'Erro ao salvar: ' + err.message;
          }
        });
      };
    }

    // Initial Tab trigger
    if (initialTab === 'cost') {
      switchSettingsTab('cost');
    } else {
      switchSettingsTab('provs');
    }
  }

  // Register Global Functions & Listeners
  window.openAddModelModal = openAddModelModal;
  window.openByokSettingsModal = openByokSettingsModal;
  window.openCostSettingsModal = function() {
    openByokSettingsModal('cost');
  };

  window.addEventListener('agy:open-add-model', function(e) {
    openAddModelModal(e && e.detail && e.detail.provider, e && e.detail && e.detail.modelName);
  });

  window.addEventListener('agy:open-byok-settings', function(e) {
    openByokSettingsModal(e && e.detail && e.detail.tab);
  });
})();
