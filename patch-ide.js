const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const appDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : (process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Antigravity IDE', 'resources', 'app')
    : path.join(__dirname, '..', 'antigravity-ide', 'resources', 'app'));

const mainPath = path.join(appDir, 'out', 'main.js');
const wbPath = path.join(appDir, 'out', 'vs', 'workbench', 'workbench.desktop.main.js');
const productPath = path.join(appDir, 'product.json');
const lsBinaryName = process.platform === 'win32' ? 'language_server_windows_x64.exe' : 'language_server_linux_x64';
const lsPath = path.join(appDir, 'extensions', 'antigravity', 'bin', lsBinaryName);

console.log('[Patch-IDE] App Directory:', appDir);

if (!fs.existsSync(appDir)) {
  console.error('[Patch-IDE] ERROR: App directory not found at', appDir);
  process.exit(1);
}

// 0. Load Custom Models from disk
const customModelsPath = path.join(os.homedir(), '.gemini', 'antigravity-ide', 'custom_models.json');
let customModels = [];
if (fs.existsSync(customModelsPath)) {
  try {
    const raw = JSON.parse(fs.readFileSync(customModelsPath, 'utf8'));
    customModels = Array.isArray(raw) ? raw : (raw.models || []);
  } catch (err) {
    console.warn('[Patch-IDE] Warning reading custom_models.json:', err.message);
  }
}
console.log(`[Patch-IDE] Loaded ${customModels.length} custom models from custom_models.json`);

const customModelsJsonLiteral = JSON.stringify(customModels);

// 1. Patch workbench.desktop.main.js (UI Dropdown + State + Effort Submenus + Clipping Fix)
if (fs.existsSync(wbPath)) {
  let wbCode = fs.readFileSync(wbPath, 'utf8');

  // A. Patch EOu, U5n, and SOu for reasoning effort levels including "Default"
  const effortDefsTarget = 'EOu=["low","medium","high"],U5n={low:"Low",medium:"Medium",high:"High"},yOu=new Map,SOu=/^(.*?)\\s*\\((low|medium|high)(?:\\s+thinking)?\\)\\s*$/i';
  const effortDefsReplacement = 'EOu=["default","low","medium","high"],U5n={default:"Default",low:"Low",medium:"Medium",high:"High"},yOu=new Map,SOu=/^(.*?)\\s*\\((default|low|medium|high)(?:\\s+thinking)?\\)\\s*$/i';
  if (wbCode.includes(effortDefsTarget)) {
    wbCode = wbCode.replace(effortDefsTarget, effortDefsReplacement);
    console.log('   OK - workbench.desktop.main.js (EOu/U5n/SOu) patched with Default effort level');
  } else if (wbCode.includes('default:"Default"')) {
    console.log('   OK - workbench.desktop.main.js (EOu/U5n/SOu) already patched with Default effort level');
  }

  // B. Patch qZe so custom models can utilize effort submenus
  const qzeTarget = 'qZe=t=>{if(!t.isCustom)return yOu.get(t.value)??COu(t.label)}';
  const qzeReplacement = 'qZe=t=>yOu.get(t.value)??COu(t.label)';
  if (wbCode.includes(qzeTarget)) {
    wbCode = wbCode.replace(qzeTarget, qzeReplacement);
    console.log('   OK - workbench.desktop.main.js (qZe) patched for custom models');
  } else if (wbCode.includes(qzeReplacement)) {
    console.log('   OK - workbench.desktop.main.js (qZe) already patched for custom models');
  }

  // B1. Patch supportsCustomModels and showCustomModelHeader
  const customFlagTarget = 'a.osName==="linux"&&a.isGoogleInternal,h=a.isGoogleInternal';
  const customFlagReplacement = '!0,h=!0';
  if (wbCode.includes(customFlagTarget)) {
    wbCode = wbCode.replace(customFlagTarget, customFlagReplacement);
    console.log('   OK - workbench.desktop.main.js (supportsCustomModels) unlocked (u=true, h=true)');
  } else if (wbCode.includes(customFlagReplacement)) {
    console.log('   OK - workbench.desktop.main.js (supportsCustomModels) already unlocked');
  }

  // C. Patch VQo & kQo so the native "Custom" group loads custom_models.json dynamically at runtime (non-blocking async cache)
  const vqoTarget = 'var VQo=t=>t?.customModels?Object.entries(t.customModels).map(([e,i])=>({label:e,value:i.modelId,isCustom:!0,customModelUrl:i.modelName})):[],kQo=(t,e)=>{if(e?.customModels)return e.customModels[t]}';
  const vqoReplacement = `var _cachedCustomModels=${customModelsJsonLiteral},_lastCustomFetch=0,_fetchingCustomModels=!1;var _fetchCustomModelsAsync=cb=>{if(_fetchingCustomModels)return;_fetchingCustomModels=!0;try{fetch("http://127.0.0.1:50999/v1internal/customModels").then(r=>r.json()).then(d=>{const _l=Array.isArray(d)?d:(d.models||[]);if(_l&&_l.length){const _old=JSON.stringify(_cachedCustomModels);const _new=JSON.stringify(_l);_cachedCustomModels=_l;if(_old!==_new){cb?.();try{window.__agy_onModelsUpdated?.()}catch(_){}}}}).catch(()=>{}).finally(()=>{_fetchingCustomModels=!1})}catch(_e){_fetchingCustomModels=!1}};try{window._fetchCustomModelsAsync=_fetchCustomModelsAsync}catch(_e){}try{_fetchCustomModelsAsync()}catch(_e){}var _getDiskCustomModels=()=>{const _now=Date.now();if(!_cachedCustomModels||_cachedCustomModels.length===0||_now-_lastCustomFetch>2500){_lastCustomFetch=_now;_fetchCustomModelsAsync()}return _cachedCustomModels||[]};var VQo=t=>{let _r=[],_d=_getDiskCustomModels();for(const _m of _d){const _lbl=_m.displayName||_m.name;if(_lbl)_r.push({label:_lbl,value:326,isCustom:!0,customModelUrl:_m.externalModelName||_m.name||_lbl,supportsThinking:_m.supportsThinking!==!1,provider:_m.provider||'Custom'})}if(t?.customModels){for(const[e,i]of Object.entries(t.customModels)){if(!_r.some(_x=>_x.label===e)){let matched=_d.find(x=>(x.displayName||x.name)===e||x.name===e||x.externalModelName===i.modelName);let prov=matched?.provider||i.provider||'Custom';_r.push({label:e,value:i.modelId||326,isCustom:!0,customModelUrl:i.modelName,supportsThinking:!0,provider:prov})}}}return _r},kQo=(t,e)=>{if(e?.customModels&&e.customModels[t])return e.customModels[t];try{const _q=COu(t);const _base=_q?.base||t;const _eff=_q?.effort;const _d=_getDiskCustomModels(),_m=_d.find(_x=>(_x.displayName||_x.name)===t||_x.name===t||(_x.displayName||_x.name)===_base);if(_m)return{modelId:326,apiProvider:1,chatModelName:_eff?((_m.displayName||_m.name)+" ("+U5n[_eff]+")"):(_m.displayName||_m.name),modelName:_m.externalModelName||_m.name,maxTokens:(_m.maxTokens&&_m.maxTokens>64000?_m.maxTokens:1048576),effort:_eff,modelFeatures:{zeroShotCapable:!0,supportsImages:!0,supportsToolCalls:!0,supportsThinking:_m.supportsThinking!==!1}}}catch(_e){}return void 0}`;

  if (wbCode.includes(vqoTarget)) {
    wbCode = wbCode.replace(vqoTarget, vqoReplacement);
    console.log('   OK - workbench.desktop.main.js (VQo/kQo) patched for native Custom group dynamic loading');
  } else if (wbCode.includes('_getDiskCustomModels')) {
    if (wbCode.includes('XMLHttpRequest') || !wbCode.includes('provider:_m.provider')) {
      const startIdx = wbCode.indexOf('var _cachedCustomModels=');
      const endMarker = 'return void 0}';
      const endIdx = wbCode.indexOf(endMarker, startIdx);
      if (startIdx !== -1 && endIdx !== -1) {
        wbCode = wbCode.substring(0, startIdx) + vqoReplacement + wbCode.substring(endIdx + endMarker.length);
        console.log('   OK - workbench.desktop.main.js (VQo/kQo) updated with provider property');
      }
    } else {
      console.log('   OK - workbench.desktop.main.js (VQo/kQo) already patched with async cache & provider');
    }
  } else {
    console.warn('   WARN - VQo/kQo target not found in workbench.desktop.main.js');
  }

  // D. Patch TOu so custom models render the native reasoning effort submenu (bs.SubmenuRoot)
  const touTarget = 'TOu=({model:t,onEdit:e})=>{let{setSelectedModel:i,selectedModel:n}=eXe(),r=n?.label===t.label,s=t.disabled??!1,o=Ya(),a=!s&&!!e;return E("div",{className:"group relative",children:[E(bs.Item,{selected:r,disabled:s,className:a?"pr-8":void 0,onClick:()=>{s||i(t)},children:E("span",{className:yi("flex items-center gap-1.5 min-w-0",s?"text-muted-foreground":""),children:[E("span",{className:"truncate text-xs text-left",children:t.label}),E(s5n,{option:t})]})}),a&&E(Ii,{children:[E("button",{type:"button",tabIndex:-1,"data-tooltip-id":o,"aria-label":"Edit Model",className:"absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center rounded p-1 opacity-0 transition-opacity hover:bg-secondary group-hover:opacity-100",onClick:l=>{l.stopPropagation(),e?.(t)},children:E($e,{name:"edit",size:12})}),E(Sr,{id:o,children:"Edit Model"})]})]})}';
  const touReplacement = 'TOu=({model:t,onEdit:e})=>{let{setSelectedModel:i,selectedModel:n}=eXe(),s=t.disabled??!1,o=Ya(),a=!s&&!!e;let _q=COu(n?.label||""),_isSel=n?.label===t.label||_q?.base===t.label;let _currEffort=_q?.base===t.label?_q.effort:"medium";let _efforts=["low","medium","high"];let _setEffort=eff=>{i({...t,label:t.label+" ("+U5n[eff]+")",effort:eff})};let _main=E(bs.SubmenuRoot,{children:[E(bs.SubmenuTrigger,{selected:_isSel,disabled:s,className:a?"pr-8":void 0,onClick:()=>{_setEffort(_currEffort)},children:[E("span",{className:yi("flex items-center gap-1.5 min-w-0",s?"text-muted-foreground":""),children:[E("span",{"data-testid":"model-selector-effort-group","data-model-base":t.label,className:"truncate text-xs text-left",children:[t.label,_isSel&&E("span",{className:"opacity-70",children:[" ",U5n[_currEffort]]})]}),E(s5n,{option:t})]})]}),E(bs.Content,{side:"right",align:"start",className:"min-w-40 p-1",children:E(bs.RadioGroup,{value:_currEffort,onValueChange:_setEffort,children:_efforts.map(eff=>E(bs.RadioItem,{value:eff,children:E("span",{"data-testid":"model-selector-effort-option","data-effort":eff,children:U5n[eff]})},eff))})})]});return E("div",{className:"group relative",children:[_main,a&&E(Ii,{children:[E("button",{type:"button",tabIndex:-1,"data-tooltip-id":o,"aria-label":"Edit Model",className:"absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center rounded p-1 opacity-0 transition-opacity hover:bg-secondary group-hover:opacity-100 z-20",onClick:l=>{l.stopPropagation(),e?.(t)},children:E($e,{name:"edit",size:12})}),E(Sr,{id:o,children:"Edit Model"})]})]})}';
  if (wbCode.includes(touTarget)) {
    wbCode = wbCode.replace(touTarget, touReplacement);
    console.log('   OK - workbench.desktop.main.js (TOu) patched with reasoning effort submenu');
  } else if (wbCode.includes('model-selector-effort-group')) {
    console.log('   OK - workbench.desktop.main.js (TOu) already patched');
  }

  // D2. Patch DOu to group custom models by provider & render clean [+] actions
  const douTarget = 'DOu=({customModels:t,onAddCustomModel:e,onEditCustomModel:i})=>{let{supportsCustomModels:n}=eXe(),r=Ya(),s=Ya();return t.length===0&&!e?null:E("div",{children:[E("div",{className:yi("group flex select-none items-center justify-between gap-1 p-1 pl-2 text-xs font-medium",e&&!n?"cursor-not-allowed":""),children:[E("span",{className:"opacity-50",children:"Custom"}),e&&(n?E(Ii,{children:[E("button",{onClick:e,tabIndex:-1,className:"cursor-pointer rounded-md p-1 opacity-50 hover:bg-secondary hover:opacity-100","data-tooltip-id":r,children:E($e,{name:"add",size:12})}),E(Sr,{id:r,children:"Add Model"})]}):E(Ii,{children:[E("div",{"data-tooltip-id":s,className:"hidden group-hover:block",children:E($e,{name:"warning",size:12,className:"shrink-0 fill-yellow-200 stroke-yellow-800"})}),E(Sr,{id:s,className:"max-w-[250px] whitespace-normal",children:"Custom models are only supported on Linux machines."})]}))]}),E("div",{className:"flex flex-col gap-px",children:t.map(o=>E(TOu,{model:o,onEdit:i},o.label))})]})}'
  const douReplacement = `DOu=({customModels:t,onAddCustomModel:e,onEditCustomModel:i})=>{let{supportsCustomModels:n}=eXe(),r=Ya();let _openAdd=(prov)=>{try{window.__agy_default_provider=(prov||'').toLowerCase()}catch(_){}e?.()};if(t.length===0){return e?E("div",{className:"pt-1 border-t border-border/40 mt-1",children:[E("button",{type:"button",onClick:()=>_openAdd(),className:"w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer",children:[E($e,{name:"add",size:13}),E("span",{children:"Add Custom Model..."})]})]}):null}let _groups={};const _pMap={openrouter:'OpenRouter',openai:'OpenAI',anthropic:'Anthropic',google:'Google',ollama:'Ollama',deepseek:'DeepSeek',groq:'Groq',mistral:'Mistral',cerebras:'Cerebras',kimi:'Kimi',fireworks:'Fireworks',lmstudio:'LM Studio',llamacpp:'llama.cpp',nvidia:'NVIDIA'};for(const _m of t){let _rawP=_m.provider||"Custom";let _p=_pMap[_rawP.toLowerCase()]||(_rawP.charAt(0).toUpperCase()+_rawP.slice(1));if(!_groups[_p])_groups[_p]=[];_groups[_p].push(_m)}let _sections=[];for(const[_prov,_models]of Object.entries(_groups)){_sections.push(E("div",{key:_prov,className:"flex flex-col gap-1 mt-1",children:[E("div",{className:"group flex select-none items-center justify-between gap-1 p-1 pl-2 text-xs font-medium",children:[E("span",{className:"opacity-60 font-semibold tracking-wide",children:_prov}),e&&n&&E(Ii,{children:[E("button",{onClick:()=>_openAdd(_models[0]?.provider||_prov),tabIndex:-1,className:"cursor-pointer rounded-md p-1 opacity-50 hover:bg-secondary hover:opacity-100","data-tooltip-id":r,children:E($e,{name:"add",size:12})}),E(Sr,{id:r,children:"Add "+_prov+" Model"})]})]}),E("div",{className:"flex flex-col gap-px",children:_models.map(o=>E(TOu,{model:o,onEdit:i},o.label))})]}));}return E("div",{children:[..._sections,e&&E("div",{key:"_add_global",className:"pt-1 border-t border-border/40 mt-1.5",children:[E("button",{type:"button",onClick:()=>_openAdd(),className:"w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer",children:[E($e,{name:"add",size:13}),E("span",{children:"Add Custom Model..."})]})]})]})}`;

  if (wbCode.includes(douTarget)) {
    wbCode = wbCode.replace(douTarget, douReplacement);
    console.log('   OK - workbench.desktop.main.js (DOu) patched with provider grouping & smart [+] actions');
  } else if (wbCode.includes('Add Custom Model...')) {
    console.log('   OK - workbench.desktop.main.js (DOu) already patched with provider grouping');
  } else {
    console.warn('   WARN - DOu target not found in workbench.desktop.main.js');
  }

  // D3. Patch Aaa (Native Add/Edit Custom Model Dialog) with BYOK Rich Interface
  const aaaStart = 'Aaa=({isOpen:t,operation:e,onClose:i,modelName:n,customModelsState:r,pushCustomModelsUpdate:s,setSelectedModelConfig:o})=>{';
  const aaaEnd = 'disabled:!a||!d||!h,className:"hover:opacity-90 rounded-md flex items-center gap-1 border-none bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed",children:"Save"})]})]})})}';
  const aaaReplacement = `Aaa=({isOpen:t,operation:e,onClose:i,modelName:n,customModelsState:r,pushCustomModelsUpdate:s,setSelectedModelConfig:o})=>{let[prov,setProv]=We("openrouter"),[mId,setMId]=We(""),[disp,setDisp]=We(""),[key,setKey]=We(""),[url,setUrl]=We("https://openrouter.ai/api/v1/chat/completions"),[ctx,setCtx]=We(128000),[out,setOut]=We(8192),[popModels,setPopModels]=We([]),[hasKey,setHasKey]=We(!1),[isCustomId,setIsCustomId]=We(!1),[testStatus,setTestStatus]=We(null),[isSaving,setIsSaving]=We(!1),[isTesting,setIsTesting]=We(!1),{logEvent:A}=pc();const defUrls={openrouter:'https://openrouter.ai/api/v1/chat/completions',openai:'https://api.openai.com/v1/chat/completions',deepseek:'https://api.deepseek.com/chat/completions',ollama:'http://localhost:11434/v1/chat/completions',anthropic:'https://api.anthropic.com/v1/messages',groq:'https://api.groq.com/openai/v1/chat/completions',mistral:'https://api.mistral.ai/v1/chat/completions',cerebras:'https://api.cerebras.ai/v1/chat/completions',custom:''};const fmtTok=x=>x>=1e6?(x/1e6).toFixed(x%1e6===0?0:1)+'M tokens':x>=1e3?Math.round(x/1e3)+'k tokens':x+' tokens';yt(()=>{if(t){setTestStatus(null);setIsSaving(!1);setIsTesting(!1);if(e==='edit'&&n){let baseLabel=(n||'').replace(/\\s*\\((low|medium|high|default).*?\\)$/i,'').trim();let found=(_cachedCustomModels||[]).find(m=>(m.displayName&&m.displayName===baseLabel)||(m.displayName&&m.displayName===n)||(m.name&&m.name===baseLabel)||(m.name&&m.name===n)||(m.externalModelName&&m.externalModelName===baseLabel));if(!found&&r?.customModels?.[n]){let old=r.customModels[n];found={provider:old.provider||'openrouter',externalModelName:old.modelName,displayName:old.chatModelName||n,apiUrl:old.apiUrl,maxTokens:old.maxTokens,maxOutputTokens:old.maxOutputTokens}}const applyFound=f=>{let _p=(f.provider||'openrouter').toLowerCase();setProv(_p);let mid=f.externalModelName||f.name||'';setMId(mid);setDisp(f.displayName||n);setUrl(f.apiUrl||defUrls[_p]||'');setCtx(f.maxTokens||128000);setOut(f.maxOutputTokens||8192);setKey('');setIsCustomId(!1)};if(found){applyFound(found)}else{fetch('http://127.0.0.1:50999/v1internal/customModels').then(x=>x.json()).then(list=>{if(Array.isArray(list)){let f=list.find(m=>(m.displayName&&m.displayName===baseLabel)||(m.displayName&&m.displayName===n)||(m.name&&m.name===baseLabel));if(f)applyFound(f)}}).catch(()=>{})}}else{let initP=(window.__agy_default_provider||'openrouter').toLowerCase();try{delete window.__agy_default_provider}catch(_){}setProv(initP);setMId('');setDisp('');setKey('');setUrl(defUrls[initP]||'');setCtx(128000);setOut(8192);setIsCustomId(!1)}}},[t,e,n]);yt(()=>{if(t&&prov){fetch('http://127.0.0.1:50999/v1internal/providerModels?provider='+encodeURIComponent(prov)).then(x=>x.json()).then(d=>{let models=d.models||[];setPopModels(models);setHasKey(!!d.hasConfiguredKey);if(mId){let exists=models.some(x=>x.id===mId);setIsCustomId(!exists)}}).catch(()=>{})}},[t,prov]);const onSelectModel=m=>{setMId(m.id);setIsCustomId(!1);if(!disp||disp===mId||popModels.some(p=>p.name===disp||p.id===disp))setDisp(m.name||m.id);if(m.contextWindow||m.maxOutputTokens){setCtx(m.contextWindow||128000);setOut(m.maxOutputTokens||8192)}};const onSelectDropdownChange=val=>{if(val==='__custom__'){setIsCustomId(!0);setMId('')}else if(!val){setMId('')}else{setIsCustomId(!1);let chosen=popModels.find(x=>x.id===val);if(chosen){onSelectModel(chosen)}else{setMId(val)}}};const onModelInput=val=>{setMId(val);fetch('http://127.0.0.1:50999/v1internal/resolveModelSpec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({modelId:val.trim()})}).then(x=>x.json()).then(spec=>{if(spec&&spec.contextWindow){setCtx(spec.contextWindow);setOut(spec.maxOutputTokens)}}).catch(()=>{})};const onTest=()=>{setIsTesting(!0);setTestStatus({type:'loading',text:'Testando conexão...'});fetch('http://127.0.0.1:50999/v1internal/testConnection',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:prov,apiKey:key.trim(),apiUrl:url.trim()})}).then(x=>x.json()).then(res=>{setIsTesting(!1);setTestStatus(res.success?{type:'success',text:'✓ '+(res.message||'Conectado!')}:{type:'error',text:'✕ '+(res.error||'Falha na conexão.')})}).catch(err=>{setIsTesting(!1);setTestStatus({type:'error',text:'✕ Erro: '+err.message})})};const onDelete=()=>{if(e==='edit'&&n){fetch('http://127.0.0.1:50999/v1internal/deleteCustomModel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({modelName:n})}).catch(()=>{});try{if(typeof _cachedCustomModels!=='undefined'){_cachedCustomModels=_cachedCustomModels.filter(m=>(m.displayName||m.name)!==n&&m.name!==n)}}catch(_){}s({type:'removeCustomModel',label:n});try{window.__agy_onModelsUpdated?.()}catch(_){}try{window._fetchCustomModelsAsync?.()}catch(_){}i();A(Ts.CASCADE_CUSTOM_MODEL_EVENT,go({extra:{action:'delete',model_name:n}},'static action and user-provided model label'))}};const onSave=()=>{let mTrim=mId.trim();if(!mTrim)return;let dTrim=disp.trim()||mTrim;setIsSaving(!0);let rawSlug=(mTrim.startsWith('models/')?mTrim.slice(7):mTrim).replace(/[^a-zA-Z0-9_-]+/g,'-').toLowerCase();let modelObj={name:'models/'+rawSlug,displayName:dTrim,provider:prov,apiKey:key.trim(),apiUrl:url.trim(),externalModelName:mTrim,maxTokens:ctx,maxOutputTokens:out,supportsThinking:!0,oldLabel:e==='edit'&&n?n:void 0};fetch('http://127.0.0.1:50999/v1internal/saveCustomModel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(modelObj)}).then(x=>x.json()).then(res=>{setIsSaving(!1);if(res.success){try{if(typeof _cachedCustomModels!=='undefined'){let fIdx=_cachedCustomModels.findIndex(m=>(e==='edit'&&n&&((m.displayName||m.name)===n||m.name===n))||(m.displayName||m.name)===dTrim||m.name===modelObj.name||m.externalModelName===mTrim);if(fIdx>=0){_cachedCustomModels[fIdx]={..._cachedCustomModels[fIdx],...modelObj}}else{_cachedCustomModels.push(modelObj)}}}catch(_){}let k=Ut(ELo,{zeroShotCapable:!0,supportsImages:!0,supportsToolCalls:!0,supportsThinking:!0});let M=Ut(yLo,{modelId:aA.GOOGLE_GEMINI_INTERNAL_BYOM,apiProvider:lJt.API_PROVIDER_GOOGLE_EVERGREEN,chatModelName:dTrim,modelName:mTrim,maxTokens:ctx,modelFeatures:k});M.provider=prov;s(e==='edit'&&n?{type:'editCustomModel',oldLabel:n,label:dTrim,modelInfo:M}:{type:'addCustomModel',label:dTrim,modelInfo:M});let B={label:dTrim,value:aA.GOOGLE_GEMINI_INTERNAL_BYOM,isCustom:!0,customModelUrl:mTrim,disabled:!1};o(B);try{window.__agy_onModelsUpdated?.()}catch(_){}try{window._fetchCustomModelsAsync?.()}catch(_){}A(Ts.CASCADE_CUSTOM_MODEL_EVENT,go({extra:{action:e,model_name:dTrim}},'static action and user-provided model label'));i()}else{setTestStatus({type:'error',text:'✕ Erro ao salvar: '+(res.error||'Desconhecido')})}}).catch(err=>{setIsSaving(!1);setTestStatus({type:'error',text:'✕ Erro de conexão: '+err.message})})};if(!t)return null;let topPills=popModels.filter(x=>x.isPopular).slice(0,5);if(topPills.length===0)topPills=popModels.slice(0,4);return E(z0,{isOpen:t,onClose:i,onSubmit:onSave,title:e==='add'?'Adicionar Modelo Customizado (BYOK)':'Editar Modelo Customizado',className:'w-[90vw] max-w-[540px] rounded-md',children:E('div',{className:'flex w-full flex-col gap-3 py-1',children:[E('div',{className:'flex flex-col gap-1',children:[E('label',{className:'text-xs font-medium text-muted-foreground',children:'Provedor'}),E('select',{value:prov,onChange:k=>{let p=k.target.value;setProv(p);setUrl(defUrls[p]||'')},className:'w-full rounded-md border border-input bg-input-background p-2 text-foreground text-xs outline-none cursor-pointer',children:[E('option',{value:'openrouter',children:'OpenRouter'}),E('option',{value:'deepseek',children:'DeepSeek'}),E('option',{value:'openai',children:'OpenAI'}),E('option',{value:'ollama',children:'Ollama (Local)'}),E('option',{value:'groq',children:'Groq'}),E('option',{value:'mistral',children:'Mistral'}),E('option',{value:'cerebras',children:'Cerebras'}),E('option',{value:'anthropic',children:'Anthropic'}),E('option',{value:'custom',children:'Custom / OpenAI-Compatible'})]})]}),topPills.length>0&&E('div',{className:'flex flex-col gap-1',children:[E('label',{className:'text-xs font-medium text-muted-foreground',children:'⭐ Modelos Populares'}),E('div',{className:'flex flex-wrap gap-1.5',children:topPills.map(p=>E('button',{type:'button',key:p.id,onClick:()=>onSelectModel(p),className:'rounded border '+(mId===p.id&&!isCustomId?'border-primary bg-primary/20 text-primary font-medium':'border-border/60 bg-secondary/50 hover:bg-secondary text-foreground')+' px-2 py-1 text-[11px] transition-colors cursor-pointer',children:p.name||p.id}))})]}),E('div',{className:'flex flex-col gap-1',children:[E('label',{className:'text-xs font-medium text-muted-foreground',children:['Modelo ',E('span',{className:'text-destructive',children:'*'})]}),E('select',{value:isCustomId?'__custom__':mId,onChange:k=>onSelectDropdownChange(k.target.value),className:'w-full rounded-md border border-input bg-input-background p-2 text-foreground text-xs outline-none cursor-pointer',children:[E('option',{value:'',disabled:!0,children:popModels.length>0?'-- Selecione um modelo do provedor --':'-- Carregando modelos... --'},'_ph'),...popModels.map(x=>E('option',{value:x.id,children:(x.name&&x.name!==x.id?x.name+' ('+x.id+')':x.id)+(x.contextWindow?' ['+fmtTok(x.contextWindow)+']':'')},x.id)),E('option',{value:'__custom__',children:'➕ Outro (digitar ID manualmente...)'},'_custom')]}),(isCustomId||prov==='custom'||popModels.length===0)&&E('div',{className:'flex flex-col gap-1 mt-1',children:[E('input',{type:'text',value:mId,onChange:k=>onModelInput(k.target.value),placeholder:'ex: google/gemini-2.5-flash ou deepseek/deepseek-chat',className:'w-full rounded-md border border-input bg-input-background p-2 text-foreground text-xs outline-none'})]})]}),E('div',{className:'flex items-center justify-between rounded-md border border-border/40 bg-secondary/20 p-2 text-xs',children:[E('span',{className:'text-muted-foreground text-[11px]',children:'Limites Detectados:'}),E('div',{className:'flex gap-2',children:[E('span',{className:'rounded border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[11px] font-mono text-blue-400',children:['🌐 Contexto: ',fmtTok(ctx)]}),E('span',{className:'rounded border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[11px] font-mono text-green-400',children:['📤 Saída: ',fmtTok(out)]})]})]}),E('div',{className:'flex flex-col gap-1',children:[E('label',{className:'text-xs font-medium text-muted-foreground',children:'Nome de Exibição (Opcional)'}),E('input',{type:'text',value:disp,onChange:k=>setDisp(k.target.value),placeholder:'ex: Gemini 2.5 Flash (OpenRouter)',className:'w-full rounded-md border border-input bg-input-background p-2 text-foreground text-xs outline-none'})]}),prov!=='ollama'&&E('div',{className:'flex flex-col gap-1',children:[E('label',{className:'text-xs font-medium text-muted-foreground',children:'API Key'}),E('input',{type:'password',value:key,onChange:k=>setKey(k.target.value),placeholder:hasKey?'(Chave mestre já configurada - deixe em branco para manter)':'sk-...',className:'w-full rounded-md border border-input bg-input-background p-2 text-foreground text-xs outline-none'})]}),E('div',{className:'flex flex-col gap-1',children:[E('label',{className:'text-xs font-medium text-muted-foreground',children:'Endpoint URL'}),E('input',{type:'text',value:url,onChange:k=>setUrl(k.target.value),placeholder:defUrls[prov]||'',className:'w-full rounded-md border border-input bg-input-background p-2 text-foreground text-xs outline-none'})]}),testStatus&&E('div',{className:testStatus.type==='success'?'rounded p-2 text-xs bg-green-500/15 text-green-400 border border-green-500/30':testStatus.type==='error'?'rounded p-2 text-xs bg-red-500/15 text-red-400 border border-red-500/30':'rounded p-2 text-xs bg-secondary text-muted-foreground',children:testStatus.text}),E('div',{className:'flex w-full items-center justify-between pt-2 border-t border-border/40 mt-1',children:[E('button',{type:'button',onClick:onTest,disabled:isTesting,className:'rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer',children:isTesting?'Testando...':'Testar Conexão'}),E('div',{className:'flex items-center gap-2',children:[E(mn,{variant:'ghost',onClick:i,children:'Cancelar'}),e==='edit'&&E(mn,{variant:'destructive',onClick:onDelete,children:'Excluir'}),E('button',{type:'button',onClick:onSave,disabled:!mId.trim()||isSaving,className:'rounded bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity',children:isSaving?'Salvando...':'Salvar Modelo'})]})]})]})})}`;

  if (wbCode.includes(aaaStart) && wbCode.includes(aaaEnd)) {
    const sIdx = wbCode.indexOf(aaaStart);
    const eIdx = wbCode.indexOf(aaaEnd, sIdx);
    if (sIdx !== -1 && eIdx !== -1) {
      wbCode = wbCode.substring(0, sIdx) + aaaReplacement + wbCode.substring(eIdx + aaaEnd.length);
      console.log('   OK - workbench.desktop.main.js (Aaa) replaced with BYOK native dialog');
    }
  } else if (wbCode.includes('Adicionar Modelo Customizado (BYOK)')) {
    console.log('   OK - workbench.desktop.main.js (Aaa) already patched with BYOK native dialog');
  } else {
    console.warn('   WARN - Aaa target not found in workbench.desktop.main.js');
  }

  // E. Patch Ouu to re-render when custom_models.json updates on disk
  const ouuTarget = 'let[l,d]=We(null),u=Re(()=>{let _=VQo(a);for(let A of _)A.disabled=!r;return _},[a,r])';
  const ouuReplacement = 'let[l,d]=We(null),[_dv,_sdv]=We(0);yt(()=>{window.__agy_onModelsUpdated=()=>_sdv(v=>v+1);const _iv=setInterval(()=>{_fetchCustomModelsAsync(()=>{_sdv(v=>v+1)})},3000);return ()=>{clearInterval(_iv);delete window.__agy_onModelsUpdated}},[]);let u=Re(()=>{let _=VQo(a);for(let A of _)A.disabled=!r;return _},[a,r,_dv])';
  if (wbCode.includes(ouuTarget)) {
    wbCode = wbCode.replace(ouuTarget, ouuReplacement);
    console.log('   OK - workbench.desktop.main.js (Ouu) patched with live disk auto-sync');
  } else if (wbCode.includes('_sdv')) {
    if (wbCode.includes('_getDiskCustomModels()') && wbCode.includes('_sdv')) {
      wbCode = wbCode.replace('_getDiskCustomModels();if(JSON.stringify(_cachedCustomModels)!==_old)_sdv(v=>v+1)', '_fetchCustomModelsAsync(()=>{_sdv(v=>v+1)})');
      console.log('   OK - workbench.desktop.main.js (Ouu) updated to async fetch');
    } else {
      console.log('   OK - workbench.desktop.main.js (Ouu) already patched');
    }
  }

  // F. Add native custom scrollbar to model list and responsive max-h to panel
  const pouTarget = 'POu=()=>E("div",{"data-testid":"model-selector-panel",className:"flex flex-col max-h-80 overflow-hidden outline-none"';
  const pouReplacement = 'POu=()=>E("div",{"data-testid":"model-selector-panel",className:"flex flex-col max-h-[min(540px,75vh)] outline-none"';

  if (wbCode.includes(pouTarget)) {
    wbCode = wbCode.replace(pouTarget, pouReplacement);
    console.log('   OK - workbench.desktop.main.js (POu panel responsive max-h) patched');
  } else if (wbCode.includes('max-h-[min(540px,75vh)]')) {
    console.log('   OK - workbench.desktop.main.js (POu panel responsive max-h) already patched');
  } else if (wbCode.includes('max-h-[580px]')) {
    wbCode = wbCode.replace('max-h-[580px]', 'max-h-[min(540px,75vh)]');
    console.log('   OK - workbench.desktop.main.js (POu panel responsive max-h) updated to 75vh');
  }

  const bouScrollTarget = 'className:"flex flex-col flex-grow min-h-0 pt-0 overflow-y-auto overscroll-y-none pb-1 gap-px scrollbar-none"';
  const bouScrollReplacement = 'className:"flex flex-col flex-grow min-h-0 pt-0 overflow-y-auto overscroll-y-none pb-1 gap-px custom-scrollbar pr-1"';
  if (wbCode.includes(bouScrollTarget)) {
    wbCode = wbCode.replace(bouScrollTarget, bouScrollReplacement);
    console.log('   OK - workbench.desktop.main.js (BOu visible custom scrollbar) patched');
  } else if (wbCode.includes('custom-scrollbar pr-1')) {
    console.log('   OK - workbench.desktop.main.js (BOu visible custom scrollbar) already patched');
  }

  // G. Patch Puu, wqt, and Ouu to support models with reasoning effort suffixes seamlessly
  const puuTarget = 'Puu=(t,e,i)=>{let n=t.find(s=>s.label===i);if(n)return n;let r=e.find(s=>s.label===i);if(r)return r}';
  const puuReplacement = 'Puu=(t,e,i)=>{let _b=COu(i)?.base||i;let n=t.find(s=>s.label===i||s.label===_b);if(n)return n.label===i?n:{...n,label:i};let r=e.find(s=>s.label===i||s.label===_b);if(r)return r.label===i?r:{...r,label:i}}';
  if (wbCode.includes(puuTarget)) {
    wbCode = wbCode.replace(puuTarget, puuReplacement);
    console.log('   OK - workbench.desktop.main.js (Puu) patched for effort label lookup');
  } else if (wbCode.includes('Puu=(t,e,i)=>{let _b=COu(i)')) {
    console.log('   OK - workbench.desktop.main.js (Puu) already patched');
  }

  const wqtTarget = 'if(f){let A=b.find(F=>F.label===f);if(A)return A}';
  const wqtReplacement = 'if(f){let _b=COu(f)?.base||f;let A=b.find(F=>F.label===f||F.label===_b);if(A)return A.label===f?A:{...A,label:f}}';
  if (wbCode.includes(wqtTarget)) {
    wbCode = wbCode.replace(wqtTarget, wqtReplacement);
    console.log('   OK - workbench.desktop.main.js (wqt b.find) patched for effort label selection');
  } else if (wbCode.includes('let _b=COu(f)?.base||f')) {
    console.log('   OK - workbench.desktop.main.js (wqt b.find) already patched');
  }

  const ouuGTarget = 'let A=Puu(h,u,_);if(!A){console.error(`[Model Select] Invalid model label: ${_}`);return}let F=u.some(T=>T.label===_);d(F?_:null),n(A.value)';
  const ouuGReplacement = 'let A=Puu(h,u,_);if(!A){console.error(`[Model Select] Invalid model label: ${_}`);return}let _b=COu(_)?.base||_;let F=u.some(T=>T.label===_||T.label===_b);d(F?_:null),n(A.value)';
  if (wbCode.includes(ouuGTarget)) {
    wbCode = wbCode.replace(ouuGTarget, ouuGReplacement);
    console.log('   OK - workbench.desktop.main.js (Ouu g) patched for effort label validation');
  } else if (wbCode.includes('let _b=COu(_)?.base||_')) {
    console.log('   OK - workbench.desktop.main.js (Ouu g) already patched');
  }

  const ouuBTarget = 'if(l){let A=u.find(F=>F.label===l);if(A)return A}';
  const ouuBReplacement = 'if(l){let _b=COu(l)?.base||l;let A=u.find(F=>F.label===l||F.label===_b);if(A)return A.label===l?A:{...A,label:l}}';
  if (wbCode.includes(ouuBTarget)) {
    wbCode = wbCode.replace(ouuBTarget, ouuBReplacement);
    console.log('   OK - workbench.desktop.main.js (Ouu b) patched for effort label persistence');
  } else if (wbCode.includes('let _b=COu(l)?.base||l')) {
    console.log('   OK - workbench.desktop.main.js (Ouu b) already patched');
  }

  // H. Patch wqt to sync model selector truthfully per-conversation (eliminates false UI selection)

  const wqtOvTarget = wbCode.includes('d=nl(t)?.plannerConfig?.requestedModel,u=!0,h=!0,[f,g]=We(null)')
    ? 'd=nl(t)?.plannerConfig?.requestedModel,u=!0,h=!0,[f,g]=We(null)'
    : 'd=nl(t)?.plannerConfig?.requestedModel,u=a.osName==="linux"&&a.isGoogleInternal,h=a.isGoogleInternal,[f,g]=We(null)';
  const wqtOvReplacement = wbCode.includes('d=nl(t)?.plannerConfig?.requestedModel,u=!0,h=!0,[f,g]=We(null)')
    ? 'd=nl(t)?.plannerConfig?.requestedModel,_ov=nl(t)?.plannerConfig?.customModelInfoOverride,u=!0,h=!0,[f,g]=We(null)'
    : 'd=nl(t)?.plannerConfig?.requestedModel,_ov=nl(t)?.plannerConfig?.customModelInfoOverride,u=a.osName==="linux"&&a.isGoogleInternal,h=a.isGoogleInternal,[f,g]=We(null)';
  if (wbCode.includes(wqtOvTarget)) {
    wbCode = wbCode.replace(wqtOvTarget, wqtOvReplacement);
    console.log('   OK - workbench.desktop.main.js (wqt _ov extraction) patched');
  } else if (wbCode.includes('d=nl(t)?.plannerConfig?.requestedModel,_ov=')) {
    console.log('   OK - workbench.desktop.main.js (wqt _ov extraction) already patched');
  }

  const wqtCustomMatchTarget = 'let F=RTn(d,b);if(F)return F';
  const wqtCustomMatchReplacement = 'let F=(_ov&&b.find(k=>k.label===_ov.chatModelName||k.customModelUrl===_ov.modelName))||RTn(d,b);if(F)return F';
  if (wbCode.includes(wqtCustomMatchTarget)) {
    wbCode = wbCode.replace(wqtCustomMatchTarget, wqtCustomMatchReplacement);
    console.log('   OK - workbench.desktop.main.js (wqt precise custom model lookup) patched');
  } else if (wbCode.includes('let F=(_ov&&b.find(k=>k.label===')) {
    console.log('   OK - workbench.desktop.main.js (wqt precise custom model lookup) already patched');
  }

  // H2. Patch wqt to notify proxy of active model selection and conversation switch
  const wqtSelectTarget = 'let _=me((A,F=!0)=>{s("selected_model_changed",go({extra:{name:A.label}},"model label from server-controlled set"));let T=A.value===aA.GOOGLE_GEMINI_INTERNAL_BYOM;g(T?A.label:null);let D=Muu(A),V;if(T){let k=kQo(A.label,l);k&&(V=k)}r?.(D,V,F)},[s,r,l]);';
  const wqtSelectReplacement = 'let _=me((A,F=!0)=>{s("selected_model_changed",go({extra:{name:A.label}},"model label from server-controlled set"));let T=A.value===aA.GOOGLE_GEMINI_INTERNAL_BYOM;g(T?A.label:null);let D=Muu(A),V;if(T){let k=kQo(A.label,l);k&&(V=k)}try{fetch("http://127.0.0.1:50999/v1internal/selectModel",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({label:A.label,isCustom:T,override:V,native:!T})}).catch(()=>{})}catch(_e){}r?.(D,V,F)},[s,r,l]);yt(()=>{if(C){let T=C.value===aA.GOOGLE_GEMINI_INTERNAL_BYOM||!!C.isCustom;let V=T?kQo(C.label,l):void 0;try{fetch("http://127.0.0.1:50999/v1internal/selectModel",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({label:C.label,isCustom:T,override:V,native:!T})}).catch(()=>{})}catch(_e){}}},[C,l]);';

  if (wbCode.includes(wqtSelectTarget)) {
    wbCode = wbCode.replace(wqtSelectTarget, wqtSelectReplacement);
    console.log('   OK - workbench.desktop.main.js (wqt model selection notifier) patched');
  } else if (wbCode.includes('/v1internal/selectModel')) {
    console.log('   OK - workbench.desktop.main.js (wqt model selection notifier) already patched');
  }

  // I. Patch i1u ("Models & Usage" dialog) to merge BYOK quota
  const i1uQuotaTarget = 's.retrieveUserQuotaSummary?.(n,B)?.then(P=>{b(P.response?.groups||[]),C(P.response?.description)}).catch(P=>{e(po.USER_QUOTA_FETCH_FAILED,P)})';
  const i1uQuotaReplacement = 's.retrieveUserQuotaSummary?.(n,B)?.then(async P=>{let _g=P.response?.groups||[];try{const _bq=await fetch("http://127.0.0.1:50999/v1internal/quotaSummary").then(x=>x.json()).catch(()=>null);if(_bq?.groups?.length)_g=_g.concat(_bq.groups)}catch(_){}b(_g),C(P.response?.description)}).catch(async P=>{try{const _bq=await fetch("http://127.0.0.1:50999/v1internal/quotaSummary").then(x=>x.json()).catch(()=>null);if(_bq?.groups?.length){b(_bq.groups);return}}catch(_){}e(po.USER_QUOTA_FETCH_FAILED,P)})';

  if (wbCode.includes(i1uQuotaTarget)) {
    wbCode = wbCode.replace(i1uQuotaTarget, i1uQuotaReplacement);
    console.log('   OK - workbench.desktop.main.js (i1u Models & Usage Quota) patched');
  } else if (wbCode.includes('http://127.0.0.1:50999/v1internal/quotaSummary') && wbCode.includes('b(_g)')) {
    console.log('   OK - workbench.desktop.main.js (i1u Models & Usage Quota) already patched');
  } else {
    console.warn('   WARN - i1u quota target not found in workbench.desktop.main.js');
  }

  // J. Patch Rca (cached quota groups for model selector)
  const rcaFullTarget = 'function Rca(t,e){if(!e||!t?.retrieveUserQuotaSummary)return Promise.resolve(hN.cachedQuotaGroups||[]);e!==hN.cachedOauthToken&&(hN.cachedOauthToken=e,hN.cachedQuotaGroups=void 0,hN.lastRefreshTimestampMs=0);let i=Date.now();return i-hN.lastRefreshTimestampMs>vOu||!hN.cachedQuotaGroups?(hN.activeQuotaFetchPromise||(hN.lastRefreshTimestampMs=i,hN.activeQuotaFetchPromise=t.retrieveUserQuotaSummary(e,!0).then(n=>{let r=n.response?.groups||[];return hN.cachedQuotaGroups=r,r}).catch(()=>hN.cachedQuotaGroups||[]).finally(()=>{hN.activeQuotaFetchPromise=void 0})),hN.activeQuotaFetchPromise):Promise.resolve(hN.cachedQuotaGroups)}';
  const rcaFullReplacement = 'function Rca(t,e){let i=Date.now();if(e!==hN.cachedOauthToken){hN.cachedOauthToken=e,hN.cachedQuotaGroups=void 0,hN.lastRefreshTimestampMs=0}if(i-hN.lastRefreshTimestampMs>vOu||!hN.cachedQuotaGroups){if(!hN.activeQuotaFetchPromise){hN.lastRefreshTimestampMs=i;let _gFetch=(t?.retrieveUserQuotaSummary)?t.retrieveUserQuotaSummary(e,!0).then(n=>n.response?.groups||n.groups||[]).catch(()=>[]):Promise.resolve([]);let _bFetch=fetch("http://127.0.0.1:50999/v1internal/quotaSummary").then(x=>x.json()).then(d=>d.groups||[]).catch(()=>[]);hN.activeQuotaFetchPromise=Promise.all([_gFetch,_bFetch]).then(([gGroups,bGroups])=>{let merged=(gGroups||[]).slice();for(let b of(bGroups||[])){if(!merged.some(m=>m.displayName===b.displayName))merged.push(b)}return hN.cachedQuotaGroups=merged,merged}).catch(()=>hN.cachedQuotaGroups||[]).finally(()=>{hN.activeQuotaFetchPromise=void 0})}return hN.activeQuotaFetchPromise}return Promise.resolve(hN.cachedQuotaGroups||[])}';

  if (wbCode.includes(rcaFullTarget)) {
    wbCode = wbCode.replace(rcaFullTarget, rcaFullReplacement);
    console.log('   OK - workbench.desktop.main.js (Rca Quota parallel Google+BYOK fetcher) patched');
  } else if (wbCode.includes('Promise.all([_gFetch,_bFetch])')) {
    console.log('   OK - workbench.desktop.main.js (Rca Quota) already patched with parallel fetcher');
  } else if (wbCode.includes('t.retrieveUserQuotaSummary(e,!0).then(n=>{let r=n.response?.groups||[];return hN.cachedQuotaGroups=r,r})')) {
    wbCode = wbCode.replace('t.retrieveUserQuotaSummary(e,!0).then(n=>{let r=n.response?.groups||[];return hN.cachedQuotaGroups=r,r})', 't.retrieveUserQuotaSummary(e,!0).then(async n=>{let r=n.response?.groups||[];try{const _bq=await fetch("http://127.0.0.1:50999/v1internal/quotaSummary").then(x=>x.json()).catch(()=>null);if(_bq?.groups?.length)r=r.concat(_bq.groups)}catch(_){}return hN.cachedQuotaGroups=r,r})');
    console.log('   OK - workbench.desktop.main.js (Rca Quota partial) patched');
  } else {
    console.warn('   WARN - Rca target not found in workbench.desktop.main.js');
  }

  // J2. Guard service context hooks against unmounted crashes
  const p2eTarget = 'P2e=()=>{let t=ts(qko);if(!t)throw new Error("useAgentManagerServicesContext must be used within an AgentManagerServicesContextProvider");return t}';
  const p2eReplacement = 'P2e=()=>{try{let t=ts(k_n)??ts(qko);if(t)return t}catch(_){}return{core:{},editor:{}}}';
  if (wbCode.includes(p2eTarget)) {
    wbCode = wbCode.replace(p2eTarget, p2eReplacement);
    console.log('   OK - workbench.desktop.main.js (P2e safe fallback with SidePanel context) patched');
  } else if (wbCode.includes('ts(k_n)??ts(qko)')) {
    console.log('   OK - workbench.desktop.main.js (P2e safe fallback with SidePanel context) already patched');
  } else if (wbCode.includes('return{core:{},editor:{}}')) {
    wbCode = wbCode.replace('P2e=()=>{try{let t=ts(qko);if(t)return t}catch(_){}return{core:{},editor:{}}}', p2eReplacement);
    console.log('   OK - workbench.desktop.main.js (P2e updated with SidePanel context)');
  }

  const lftTarget = 'function Lft(){return P2e().core.cloudCodeService}';
  const lftReplacement = 'function Lft(){try{return(ts(k_n)??ts(qko))?.core?.cloudCodeService}catch(_){return void 0}}';
  if (wbCode.includes(lftTarget)) {
    wbCode = wbCode.replace(lftTarget, lftReplacement);
    console.log('   OK - workbench.desktop.main.js (Lft safe guard with SidePanel context) patched');
  } else if (wbCode.includes('(ts(k_n)??ts(qko))?.core?.cloudCodeService')) {
    console.log('   OK - workbench.desktop.main.js (Lft safe guard with SidePanel context) already patched');
  } else if (wbCode.includes('P2e()?.core?.cloudCodeService')) {
    wbCode = wbCode.replace('function Lft(){try{return P2e()?.core?.cloudCodeService}catch(_){return void 0}}', lftReplacement);
    console.log('   OK - workbench.desktop.main.js (Lft updated with SidePanel context)');
  }

  const z2nTarget = 'z2n=()=>{let t=B$d();return nl(t)}';
  const z2nReplacement = 'z2n=()=>{try{let t=B$d();return nl(t)}catch(_){return void 0}}';
  if (wbCode.includes(z2nTarget)) {
    wbCode = wbCode.replace(z2nTarget, z2nReplacement);
    console.log('   OK - workbench.desktop.main.js (z2n safe guard) patched');
  } else if (wbCode.includes('z2n=()=>{try{let t=B$d()')) {
    console.log('   OK - workbench.desktop.main.js (z2n safe guard) already patched');
  }

  // J2b. Guard Vqo against missing .remaining property on quota buckets
  const vqoQuotaTarget = 'function Vqo(t){return{remainingFraction:t.remaining.case==="remainingFraction"?t.remaining.value:void 0,refreshText:t.description||"",disabled:t.disabled??!1}}';
  const vqoQuotaReplacement = 'function Vqo(t){let _rf=t?.remaining?.case==="remainingFraction"?t.remaining.value:(t?.remainingFraction??t?.remaining?.value);return{remainingFraction:_rf,refreshText:t?.description||"",disabled:t?.disabled??!1}}';
  if (wbCode.includes(vqoQuotaTarget)) {
    wbCode = wbCode.replace(vqoQuotaTarget, vqoQuotaReplacement);
    console.log('   OK - workbench.desktop.main.js (Vqo safe remainingFraction extraction) patched');
  } else if (wbCode.includes('_rf=t?.remaining?.case')) {
    console.log('   OK - workbench.desktop.main.js (Vqo safe remainingFraction extraction) already patched');
  } else {
    console.warn('   WARN - Vqo target not found in workbench.desktop.main.js');
  }

  // J3. Enable native View Usage flyout submenu in MOu
  const mouTarget = '{userStatus:t}=eXe(),{logEvent:e}=pc(),i=Qr().get("modelQuota")?.enabled===!0';
  const mouReplacement = '{userStatus:t}=eXe(),{logEvent:e}=pc(),i=!0';
  if (wbCode.includes(mouTarget)) {
    wbCode = wbCode.replace(mouTarget, mouReplacement);
    console.log('   OK - workbench.desktop.main.js (MOu View Usage submenu flyout) enabled');
  } else if (wbCode.includes('{userStatus:t}=eXe(),{logEvent:e}=pc(),i=!0')) {
    console.log('   OK - workbench.desktop.main.js (MOu View Usage submenu flyout) already enabled');
  }

  const mouTriggerTarget = 'E(bs.SubmenuTrigger,{children:[E($e,{name:"speed"}),E("span",{className:"text-xs flex-1",children:"View Usage"})]})';
  const mouTriggerWithExtraChevron = 'E(bs.SubmenuTrigger,{className:"flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer",children:[E($e,{name:"speed",size:14}),E("span",{className:"text-xs flex-1",children:"View Usage"}),E($e,{name:"chevron_right",size:14,className:"opacity-40 shrink-0 ml-auto"})]})';
  const mouTriggerReplacement = 'E(bs.SubmenuTrigger,{className:"flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer",children:[E($e,{name:"speed",size:14}),E("span",{className:"text-xs flex-1",children:"View Usage"})]})';

  if (wbCode.includes(mouTriggerWithExtraChevron)) {
    wbCode = wbCode.replace(mouTriggerWithExtraChevron, mouTriggerReplacement);
    console.log('   OK - workbench.desktop.main.js (MOu trigger removed redundant chevron)');
  } else if (wbCode.includes(mouTriggerTarget)) {
    wbCode = wbCode.replace(mouTriggerTarget, mouTriggerReplacement);
    console.log('   OK - workbench.desktop.main.js (MOu trigger styling) patched');
  } else if (wbCode.includes(mouTriggerReplacement)) {
    console.log('   OK - workbench.desktop.main.js (MOu trigger styling) already clean without extra chevron');
  }

  // K. Inject modalCode.js for custom model creation modal
  const modalCodePath = path.join(__dirname, 'modalCode.js');
  if (fs.existsSync(modalCodePath)) {
    const modalMarker = '// AGY_ADD_MODEL_MODAL_INJECTED';
    const modalCode = fs.readFileSync(modalCodePath, 'utf8');
    if (wbCode.includes(modalMarker)) {
      const idx = wbCode.indexOf(modalMarker);
      wbCode = wbCode.substring(0, idx) + modalMarker + '\n' + modalCode + '\n';
      console.log('   OK - workbench.desktop.main.js modalCode.js updated');
    } else {
      wbCode += '\n' + modalMarker + '\n' + modalCode + '\n';
      console.log('   OK - workbench.desktop.main.js modalCode.js injected');
    }
  } else {
    console.warn('   WARN - modalCode.js not found at', modalCodePath);
  }

  fs.writeFileSync(wbPath, wbCode, 'utf8');
}

// 1b. Patch workbench.desktop.main.css (Custom Scrollbar for model selector and menus)
const wbCssPath = path.join(appDir, 'out', 'vs', 'workbench', 'workbench.desktop.main.css');
if (fs.existsSync(wbCssPath)) {
  let cssCode = fs.readFileSync(wbCssPath, 'utf8');
  const scrollbarCss = `
/* Antigravity BYOK Model Menu Scrollbar */
.custom-scrollbar {
  scrollbar-width: thin !important;
  scrollbar-color: rgba(140, 140, 140, 0.4) transparent !important;
}
.custom-scrollbar::-webkit-scrollbar {
  width: 6px !important;
  height: 6px !important;
  display: block !important;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent !important;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(140, 140, 140, 0.4) !important;
  border-radius: 4px !important;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: rgba(160, 160, 160, 0.7) !important;
}
`;
  if (!cssCode.includes('custom-scrollbar')) {
    cssCode += scrollbarCss;
    fs.writeFileSync(wbCssPath, cssCode, 'utf8');
    console.log('   OK - workbench.desktop.main.css (custom-scrollbar styles) appended');
  } else {
    console.log('   OK - workbench.desktop.main.css already contains custom-scrollbar styles');
  }
}

// 2. Patch out/main.js
if (fs.existsSync(mainPath)) {
  let mainCode = fs.readFileSync(mainPath, 'utf8');

  // Clean up old proxy markers if present
  const patchMarker = "// MRMPPRO_SELF_SUFFICIENT_PROXY_V2";
  const oldPatchMarker = "// MRMPPRO_GET_AVAILABLE_MODELS_INTERCEPT";
  if (mainCode.includes(patchMarker)) {
    mainCode = mainCode.substring(0, mainCode.indexOf(patchMarker)).trimEnd();
  } else if (mainCode.includes(oldPatchMarker)) {
    mainCode = mainCode.substring(0, mainCode.indexOf(oldPatchMarker)).trimEnd();
  }


  // B. Patch r2l(e) model state injection hook (with effort variants)
  const r2lTargetRegex = /function\s+r2l\s*\(e\)\s*\{\s*(try\{.*?catch\(_err\)\{\}\s*)?const\s+t\s*=\s*e\.models\s*,\s*r\s*=\s*new\s+Set\s*;/;
  const r2lReplacement = `function r2l(e){try{const _fs=require("fs"),_path=require("path"),_os=require("os"),_cp=_path.join(_os.homedir(),".gemini","antigravity-ide","custom_models.json");if(_fs.existsSync(_cp)){const _cm=JSON.parse(_fs.readFileSync(_cp,"utf8")),_list=Array.isArray(_cm)?_cm:(_cm.models||[]);for(const _m of _list){if(!_m.name&&!_m.displayName)continue;const _lvls=(_m.reasoningEffortLevels&&_m.reasoningEffortLevels.length)?_m.reasoningEffortLevels:[null];for(const _l of _lvls){let _raw=(_m.externalModelName||_m.name||"custom-model").replace(/^models\\//,"").replace(/[^a-zA-Z0-9]+/g,"-").replace(/^-+|-+$/g,"").toLowerCase();let _s="custom-"+_raw+(_l?"-"+_l.toLowerCase():"");let _disp=(_m.displayName||_m.name||"custom-model")+(_l?" ("+_l+")":"");let _in=_disp.toLowerCase();let _h=5381;for(let _k=0;_k<_in.length;_k++)_h=((_h<<5)+_h+_in.charCodeAt(_k))&4294967295;let _ph=1351+(Math.abs(_h)%290);e.models[_s]={displayName:_disp,model:_ph,supportsImages:!0,recommended:!1,maxTokens:1048576,maxOutputTokens:32768,supportedMimeTypes:{}}}}}}catch(_err){}const t=e.models,r=new Set;`;

  if (r2lTargetRegex.test(mainCode)) {
    mainCode = mainCode.replace(r2lTargetRegex, r2lReplacement);
    console.log('   OK - main.js r2l hook injected');
  }

  // C. Patch Kos (LS args) to route to port 50999
  const kosTargetRegex = /Kos=async\(e,t,r,n\)=>\{const i=\["--csrf_token",t,"--extension_server_port",e\.port\.toString\(\),"--extension_server_csrf_token",e\.csrfToken,"--app_data_dir",NC\.ideName,"--subclient_type","ide"\];r\.quality==="dev"&&i\.push\("--dev_mode"\);(const a=await n\.getCloudCodeUrl\(\);)?return i\.push\("--cloud_code_endpoint",(a|"http:\/\/127\.0\.0\.1:50999")\),i\}/;
  const kosReplacement = `Kos=async(e,t,r,n)=>{const i=["--csrf_token",t,"--extension_server_port",e.port.toString(),"--extension_server_csrf_token",e.csrfToken,"--app_data_dir",NC.ideName,"--subclient_type","ide"];r.quality==="dev"&&i.push("--dev_mode");return i.push("--cloud_code_endpoint","http://127.0.0.1:50999"),i}`;

  if (kosTargetRegex.test(mainCode)) {
    mainCode = mainCode.replace(kosTargetRegex, kosReplacement);
    console.log('   OK - main.js Kos (LS args) patched to proxy endpoint');
  }

  // C1. Patch getCloudCodeUrl in CloudCodeMainService to always return local proxy URL
  const getCloudCodeUrlTarget = 'async getCloudCodeUrl(){const t=await this.getOAuthTokenFromStateSyncIfUnexpired();return this.getBaseUrl(t??void 0)}';
  const getCloudCodeUrlReplacement = 'async getCloudCodeUrl(){return"http://127.0.0.1:50999"}';
  if (mainCode.includes(getCloudCodeUrlTarget)) {
    mainCode = mainCode.replace(getCloudCodeUrlTarget, getCloudCodeUrlReplacement);
    console.log('   OK - main.js getCloudCodeUrl patched to proxy endpoint');
  } else if (mainCode.includes(getCloudCodeUrlReplacement)) {
    console.log('   OK - main.js getCloudCodeUrl already patched');
  }

  // D1. Patch updateLSCloudCodeUrl in CloudCodeMainService (runs after loadCodeAssist/onboarding)
  const updateLsTarget = 'client.setCloudCodeURL(Ur(oSt,{url:await this.getCloudCodeUrl()}))';
  const updateLsReplacement = 'client.setCloudCodeURL(Ur(oSt,{url:"http://127.0.0.1:50999"}))';
  if (mainCode.includes(updateLsTarget)) {
    mainCode = mainCode.replace(updateLsTarget, updateLsReplacement);
    console.log('   OK - main.js updateLSCloudCodeUrl patched to proxy endpoint');
  } else if (mainCode.includes(updateLsReplacement)) {
    console.log('   OK - main.js updateLSCloudCodeUrl already patched');
  }

  // D2. Patch setCloudCodeURL call during initial LS startup
  const setUrlTargetRegex = /(const A=await this\._cloudCodeMainService\.getCloudCodeUrl\(\);)?this\._client\.client\.setCloudCodeURL\(Ur\(oSt,\{url:(A|"http:\/\/127\.0\.0\.1:50999")\}\)\)/;
  const setUrlReplacement = `this._client.client.setCloudCodeURL(Ur(oSt,{url:"http://127.0.0.1:50999"}))`;

  if (setUrlTargetRegex.test(mainCode)) {
    mainCode = mainCode.replace(setUrlTargetRegex, setUrlReplacement);
    console.log('   OK - main.js setCloudCodeURL startup gRPC call patched to proxy endpoint');
  }

  // E. Append Self-Sufficient Proxy Startup & WebRequest Interceptors
  const proxyInitCode = `

${patchMarker}
// MRMPPRO Self-Sufficient Proxy for Antigravity IDE
(async function _mrmppro_ide_proxy_init() {
  'use strict';
  try {
    const { createRequire } = await import('node:module');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');

    const _require = createRequire(import.meta.url);
    const _filename = fileURLToPath(import.meta.url);
    const _dirname = dirname(_filename);

    let _proxyPort = 50999;
    const _proxyModulePath = join(_dirname, 'mrmppro-proxy', 'proxy');

    try {
      const _proxyModule = _require(_proxyModulePath);
      _proxyModule.startProxy().then(function(port) {
        _proxyPort = port || 50999;
        console.log('[MRMPPRO IDE Proxy] Proxy server started on port ' + _proxyPort);
      }).catch(function(err) {
        console.error('[MRMPPRO IDE Proxy] Failed to start proxy:', err);
      });
    } catch (loadErr) {
      console.error('[MRMPPRO IDE Proxy] Failed to load proxy module:', loadErr);
    }

  } catch (initErr) {
    console.error('[MRMPPRO IDE Proxy] Fatal init error:', initErr);
  }
})();
`;

  mainCode = mainCode + proxyInitCode;
  fs.writeFileSync(mainPath, mainCode, 'utf8');
  console.log('   OK - main.js written with proxy & interceptors');
}

// 2.5 Patch extensions/antigravity/dist/extension.js (Language Server Manager)
const extJsPath = path.join(appDir, 'extensions', 'antigravity', 'dist', 'extension.js');
if (fs.existsSync(extJsPath)) {
  let extCode = fs.readFileSync(extJsPath, 'utf8');
  let extModified = false;
  const extTarget1 = 'const x=await o.getCloudCodeUrl();';
  const extReplacement1 = 'const x="http://127.0.0.1:50999";';
  if (extCode.includes(extTarget1)) {
    extCode = extCode.replace(extTarget1, extReplacement1);
    extModified = true;
    console.log('   OK - extension.js getCloudCodeUrl (startLanguageServer) patched to proxy endpoint');
  }
  const extTarget2 = 's=await o.getCloudCodeUrl()';
  const extReplacement2 = 's="http://127.0.0.1:50999"';
  if (extCode.includes(extTarget2)) {
    extCode = extCode.replace(extTarget2, extReplacement2);
    extModified = true;
    console.log('   OK - extension.js getCloudCodeUrl (secondary) patched to proxy endpoint');
  }
  if (extModified) {
    fs.writeFileSync(extJsPath, extCode, 'utf8');
    console.log('   OK - extension.js saved successfully');
  }
}

// 3. Binary Patch Language Server executable for BOTH endpoints
if (fs.existsSync(lsPath)) {
  try {
    const buf = fs.readFileSync(lsPath);
    let modified = false;
    const targets = [
      {
        search: Buffer.from('https://daily-cloudcode-pa.googleapis.com', 'ascii'),
        replace: Buffer.from('http://localhost:50999/v1internal/xxxxxxx', 'ascii')
      },
      {
        search: Buffer.from('https://cloudcode-pa.googleapis.com', 'ascii'),
        replace: Buffer.from('http://localhost:50999/v1internal/x', 'ascii')
      }
    ];

    for (const { search, replace } of targets) {
      let offset = 0;
      while ((offset = buf.indexOf(search, offset)) !== -1) {
        replace.copy(buf, offset);
        offset += replace.length;
        modified = true;
      }
    }

    if (modified) {
      fs.writeFileSync(lsPath, buf);
      if (process.platform !== 'win32') {
        try { fs.chmodSync(lsPath, 0o755); } catch (_) {}
      }
      console.log('   OK - Language Server binary saved successfully (both endpoints)');
    } else {
      if (process.platform !== 'win32') {
        try { fs.chmodSync(lsPath, 0o755); } catch (_) {}
      }
      console.log('   OK - Language Server binary already patched');
    }
  } catch (lsErr) {
    console.warn('[Patch-IDE] Notice: LS binary busy (deploy script will handle when IDE is closed)');
  }
}

// 4. Recalculate and update product.json checksums
if (fs.existsSync(productPath)) {
  try {
    const prod = JSON.parse(fs.readFileSync(productPath, 'utf8'));
    if (prod.checksums) {
      let updatedCount = 0;
      for (const [file] of Object.entries(prod.checksums)) {
        const fullPath = path.join(appDir, 'out', file);
        if (fs.existsSync(fullPath)) {
          const hash = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('base64').replace(/=+$/, '');
          prod.checksums[file] = hash;
          updatedCount++;
        }
      }
      fs.writeFileSync(productPath, JSON.stringify(prod, null, 2), 'utf8');
      console.log(`   OK - product.json updated (${updatedCount} file checksums synchronized)`);
    }
  } catch (err) {
    console.error('   WARN - Failed to update product.json:', err.message);
  }
}

console.log('[Patch-IDE] Patch completed successfully.');
