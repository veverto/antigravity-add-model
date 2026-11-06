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
const wbCssPath = path.join(appDir, 'out', 'vs', 'workbench', 'workbench.desktop.main.css');
const jetskiAgentPath = path.join(appDir, 'out', 'jetskiAgent', 'main.js');
const jetskiCssPath = path.join(appDir, 'out', 'jetskiMain.tailwind.css');
const productPath = path.join(appDir, 'product.json');
const lsBinaryName = process.platform === 'win32' ? 'language_server_windows_x64.exe' : 'language_server_linux_x64';
const lsPath = path.join(appDir, 'extensions', 'antigravity', 'bin', lsBinaryName);

console.log('[Patch-IDE] App Directory:', appDir);

if (!fs.existsSync(appDir)) {
  console.error('[Patch-IDE] ERROR: App directory not found at', appDir);
  process.exit(1);
}

// Helper: Ensure proxy modules and dependencies are deployed to app/out/mrmppro-proxy
function deployProxyModules(targetAppDir) {
  const proxyDir = path.join(targetAppDir, 'out', 'mrmppro-proxy');
  const distDir = path.join(__dirname, 'dist');
  if (!fs.existsSync(distDir)) {
    console.warn('[Patch-IDE] Notice: dist/ directory not found in repo, skipping proxy file copy.');
    return;
  }
  fs.mkdirSync(proxyDir, { recursive: true });

  const distFiles = [
    'proxy.js', 'proxy.js.map',
    'cryptoStore.js', 'cryptoStore.js.map',
    'schemaValidator.js', 'schemaValidator.js.map',
    'paths.js', 'paths.js.map',
    'storage.js', 'storage.js.map',
    'constants.js', 'constants.js.map'
  ];
  for (const f of distFiles) {
    const src = path.join(distDir, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(proxyDir, f));
    }
  }

  for (const helperFile of ['hubInterceptor.js', 'modalCode.js']) {
    const srcHelper = path.join(__dirname, helperFile);
    if (fs.existsSync(srcHelper)) {
      fs.copyFileSync(srcHelper, path.join(proxyDir, helperFile));
    }
  }

  for (const sub of ['proxy', 'autoSwitch', 'services']) {
    const srcSub = path.join(distDir, sub);
    const destSub = path.join(proxyDir, sub);
    if (fs.existsSync(srcSub)) {
      fs.cpSync(srcSub, destSub, { recursive: true, force: true });
    }
  }

  const elSrc = path.join(__dirname, 'node_modules', 'electron-log');
  const elDest = path.join(proxyDir, 'node_modules', 'electron-log');
  if (fs.existsSync(elSrc)) {
    fs.mkdirSync(path.join(proxyDir, 'node_modules'), { recursive: true });
    fs.cpSync(elSrc, elDest, { recursive: true, force: true });
  }

  const appElDest = path.join(targetAppDir, 'node_modules', 'electron-log');
  if (fs.existsSync(elSrc) && !fs.existsSync(appElDest)) {
    fs.cpSync(elSrc, appElDest, { recursive: true, force: true });
  }

  fs.writeFileSync(path.join(proxyDir, 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2), 'utf8');
  console.log('[Patch-IDE] Proxy modules deployed to', proxyDir);
}

deployProxyModules(appDir);

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

const makeByokSettingsCardSnippet = (fn) => `${fn}("div",{className:"rounded-xl border border-border bg-card p-4 space-y-3 mb-4"},[${fn}("div",{className:"flex items-center justify-between"},[${fn}("div",{className:"flex flex-col gap-0.5"},[${fn}("h3",{className:"m-0 text-sm font-semibold text-foreground flex items-center gap-2"},[${fn}("span",{},"BYOK Provider & Cost Management")]),${fn}("p",{className:"m-0 text-xs text-muted-foreground leading-relaxed"},"Manage configured custom providers, cost badges, and provider token overrides.")]),${fn}("button",{type:"button",onClick:()=>window.openByokSettingsModal?.("cost")||window.openCostSettingsModal?.()||window.openAddModelModal?.(null,null,"cost"),className:"rounded-md px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"},"Configure BYOK...")])]),`;

// 1. Patch workbench.desktop.main.js
if (fs.existsSync(wbPath)) {
  let wbCode = fs.readFileSync(wbPath, 'utf8');
  const is260 = wbCode.includes('aQd=') || wbCode.includes('kpo(');
  console.log(`[Patch-IDE] Detected workbench version pattern: ${is260 ? 'v2.6.0+' : 'v2.5.5'}`);

  if (is260) {
    // ==========================================
    // PATCHES FOR IDE 2.6.0+
    // ==========================================

    // A. Reasoning effort levels (aQd / Gdt / cQd)
    const effortDefsTarget260 = 'aQd=["low","medium","high","xhigh","max"],Gdt={low:"Low",medium:"Medium",high:"High",xhigh:"Extra",max:"Max"},lQd=new Map,cQd=/^(.*?)\\s*\\((low|medium|high|xhigh|max)(?:\\s+thinking)?\\)\\s*$/i';
    const effortDefsReplacement260 = 'aQd=["default","low","medium","high","xhigh","max"],Gdt={default:"Default",low:"Low",medium:"Medium",high:"High",xhigh:"Extra",max:"Max"},lQd=new Map,cQd=/^(.*?)\\s*\\((default|low|medium|high|xhigh|max)(?:\\s+thinking)?\\)\\s*$/i';
    if (wbCode.includes(effortDefsTarget260)) {
      wbCode = wbCode.replace(effortDefsTarget260, effortDefsReplacement260);
      console.log('   OK - workbench (aQd/Gdt/cQd) patched with Default effort level');
    } else if (wbCode.includes('default:"Default"')) {
      console.log('   OK - workbench (aQd/Gdt/cQd) already patched with Default effort level');
    }

    // B. Effort mapping (tWe)
    const tweTarget = 'tWe=t=>{if(!t.isCustom)return lQd.get(t.value)??dQd(t.label)}';
    const tweReplacement = 'tWe=t=>lQd.get(t.value)??dQd(t.label)';
    if (wbCode.includes(tweTarget)) {
      wbCode = wbCode.replace(tweTarget, tweReplacement);
      console.log('   OK - workbench (tWe) patched for custom models');
    } else if (wbCode.includes(tweReplacement)) {
      console.log('   OK - workbench (tWe) already patched for custom models');
    }

    // B1. Unlock supportsCustomModels and showCustomModelHeader
    const customFlagTarget260 = 'f=a.osName==="linux"&&a.isGoogleInternal,g=a.isGoogleInternal';
    const customFlagReplacement260 = 'f=!0,g=!0';
    if (wbCode.includes(customFlagTarget260)) {
      wbCode = wbCode.replace(customFlagTarget260, customFlagReplacement260);
      console.log('   OK - workbench (supportsCustomModels in KQt) unlocked (f=true, g=true)');
    } else if (wbCode.includes('f=!0,g=!0')) {
      console.log('   OK - workbench (supportsCustomModels in KQt) already unlocked');
    }

    if (wbCode.includes('Xjc=t=>Sun(t).supported')) {
      wbCode = wbCode.replace('Xjc=t=>Sun(t).supported', 'Xjc=t=>!0');
      console.log('   OK - workbench (Xjc) unlocked to always return supported=true');
    }
    if (wbCode.includes('F_o={supported:!1,customModels:{}}')) {
      wbCode = wbCode.replace('F_o={supported:!1,customModels:{}}', 'F_o={supported:!0,customModels:{}}');
      console.log('   OK - workbench (F_o) initial state unlocked (supported=true)');
    }

    // B1.1 VQd (Main chat model selector in v2.6.0+)
    const vqdEndTarget = 'M=z(()=>{x(!1),N(void 0)},[]),{isGoogleInternal:P}=Zh().product;return v("div",{className:`min-w-0 ${Fdt}`,children:[v(DZo,{placement:t,selectedModel:g,setSelectedModel:b,modelSorts:u,modelOptions:h,userStatus:f,refreshModels:async()=>{A.refreshUserStatus()},open:y,setIsOpen:w,customModels:a,supportsCustomModels:l,showCustomModelHeader:P,onAddCustomModel:F,onEditCustomModel:O,bestOfNConfig:i,contextWindow:S,isModelListLoading:d,finalFocus:C?_:void 0}),v(YUo,{isOpen:I,operation:T,onClose:M,modelName:k,customModelsState:D,pushCustomModelsUpdate:L,setSelectedModelConfig:b})]})';
    const vqdEndReplacement = 'M=z(()=>{x(!1),N(void 0)},[]);let[_dv,_sdv]=ce(0);Oe(()=>{window.__agy_onModelsUpdated=()=>_sdv(v=>v+1);const _iv=setInterval(()=>{_fetchCustomModelsAsync(()=>{_sdv(v=>v+1)})},3000);return ()=>{clearInterval(_iv);delete window.__agy_onModelsUpdated}},[]);let _liveCustom=P_o({customModels:{}});Oe(()=>{if(g){let I=g.value===kS.GOOGLE_GEMINI_INTERNAL_BYOM||!!g.isCustom;let V=I?Cun(g.label,{}):void 0;try{fetch("http://127.0.0.1:50999/v1internal/selectModel",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({label:g.label,isCustom:I,override:V,native:!I})}).catch(()=>{})}catch(_e){}}},[g]);return v("div",{className:`min-w-0 ${Fdt}`,children:[v(DZo,{placement:t,selectedModel:g,setSelectedModel:b,modelSorts:u,modelOptions:h,userStatus:f,refreshModels:async()=>{A.refreshUserStatus()},open:y,setIsOpen:w,customModels:_liveCustom,supportsCustomModels:!0,showCustomModelHeader:!0,onAddCustomModel:F,onEditCustomModel:O,bestOfNConfig:i,contextWindow:S,isModelListLoading:d,finalFocus:C?_:void 0}),v(YUo,{isOpen:I,operation:T,onClose:M,modelName:k,customModelsState:D,pushCustomModelsUpdate:L,setSelectedModelConfig:b})]})';

    if (wbCode.includes(vqdEndTarget)) {
      wbCode = wbCode.replace(vqdEndTarget, vqdEndReplacement);
      console.log('   OK - workbench (VQd chat model selector) unlocked (showCustomModelHeader=true, supportsCustomModels=true, live disk sync)');
    } else if (wbCode.includes('showCustomModelHeader:!0')) {
      console.log('   OK - workbench (VQd chat model selector) already unlocked');
    }

    const vqdSelectTarget = 'let G=B.isCustom?B:kQd(h,a,B.label);if(G){let Y=s?.getState(),J=Y?.trajectorySlice;o(Yjc({conversationId:e,model:G.value,customLabel:G.isCustom?G.label:void 0,contextWindow:W,pick:{atStep:J?.totalStepsLength||J?.stepsInSlice.length||0,queuedMessageIds:T4o(Y)}}))}else console.error(`[Model Select] Invalid model label: ${B.label}`);p()?.focus()}';
    const vqdSelectReplacement = 'let G=B.isCustom?B:kQd(h,a,B.label);if(G){let Y=s?.getState(),J=Y?.trajectorySlice;o(Yjc({conversationId:e,model:G.value,customLabel:G.isCustom?G.label:void 0,contextWindow:W,pick:{atStep:J?.totalStepsLength||J?.stepsInSlice.length||0,queuedMessageIds:T4o(Y)}}))}else console.error(`[Model Select] Invalid model label: ${B.label}`);try{fetch("http://127.0.0.1:50999/v1internal/selectModel",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({label:B.label,isCustom:!!B.isCustom,override:Cun(B.label,{}),native:!B.isCustom})}).catch(()=>{})}catch(_e){}p()?.focus()}';

    if (wbCode.includes(vqdSelectTarget)) {
      wbCode = wbCode.replace(vqdSelectTarget, vqdSelectReplacement);
      console.log('   OK - workbench (VQd model selection proxy notifier) patched');
    } else if (wbCode.includes('/v1internal/selectModel')) {
      console.log('   OK - workbench (VQd model selection proxy notifier) already patched');
    }

    // C. P_o & Cun dynamic loading of custom models
    const poTarget = ',P_o=t=>t?.customModels?Object.entries(t.customModels).map(([e,i])=>({label:e,value:i.modelId,isCustom:!0,customModelUrl:i.modelName})):[],Cun=(t,e)=>{if(e?.customModels)return e.customModels[t]}';
    const poReplacement = `;var _cachedCustomModels=${customModelsJsonLiteral},_lastCustomFetch=0,_fetchingCustomModels=!1;var _fetchCustomModelsAsync=cb=>{if(_fetchingCustomModels)return;_fetchingCustomModels=!0;try{fetch("http://127.0.0.1:50999/v1internal/customModels").then(r=>r.json()).then(d=>{const _l=Array.isArray(d)?d:(d.models||[]);if(_l&&_l.length){const _old=JSON.stringify(_cachedCustomModels);const _new=JSON.stringify(_l);_cachedCustomModels=_l;if(_old!==_new){cb?.();try{window.__agy_onModelsUpdated?.()}catch(_){}}}}).catch(()=>{}).finally(()=>{_fetchingCustomModels=!1})}catch(_e){_fetchingCustomModels=!1}};try{window._fetchCustomModelsAsync=_fetchCustomModelsAsync}catch(_e){}try{_fetchCustomModelsAsync()}catch(_e){}var _getDiskCustomModels=()=>{const _now=Date.now();if(!_cachedCustomModels||_cachedCustomModels.length===0||_now-_lastCustomFetch>2500){_lastCustomFetch=_now;_fetchCustomModelsAsync()}return _cachedCustomModels||[]};var P_o=t=>{let _r=[],_d=_getDiskCustomModels();for(const _m of _d){const _lbl=_m.displayName||_m.name;if(_lbl)_r.push({label:_lbl,value:326,isCustom:!0,customModelUrl:_m.externalModelName||_m.name||_lbl,supportsThinking:_m.supportsThinking!==!1,provider:_m.provider||'Custom'})}if(t?.customModels){for(const[e,i]of Object.entries(t.customModels)){if(!_r.some(_x=>_x.label===e)){let matched=_d.find(x=>(x.displayName||x.name)===e||x.name===e||x.externalModelName===i.modelName);let prov=matched?.provider||i.provider||'Custom';_r.push({label:e,value:i.modelId||326,isCustom:!0,customModelUrl:i.modelName,supportsThinking:!0,provider:prov})}}}return _r},Cun=(t,e)=>{if(e?.customModels&&e.customModels[t])return e.customModels[t];try{const _q=dQd(t);const _base=_q?.base||t;const _eff=_q?.effort;const _d=_getDiskCustomModels(),_m=_d.find(_x=>(_x.displayName||_x.name)===t||_x.name===t||(_x.displayName||_x.name)===_base);if(_m)return{modelId:326,apiProvider:1,chatModelName:_eff?((_m.displayName||_m.name)+" ("+Gdt[_eff]+")"):(_m.displayName||_m.name),modelName:_m.externalModelName||_m.name,maxTokens:(_m.maxTokens&&_m.maxTokens>64000?_m.maxTokens:1048576),effort:_eff,modelFeatures:{zeroShotCapable:!0,supportsImages:!0,supportsToolCalls:!0,supportsThinking:_m.supportsThinking!==!1}}}catch(_e){}return void 0}`;

    if (wbCode.includes(poTarget)) {
      wbCode = wbCode.replace(poTarget, poReplacement);
      console.log('   OK - workbench (P_o/Cun) patched for native Custom group dynamic loading');
    } else if (wbCode.includes('_getDiskCustomModels')) {
      console.log('   OK - workbench (P_o/Cun) already patched');
    }

    // D. EQd: Model item with pencil edit button (Standard bi.Item)
    const eqdTarget = 'EQd=({model:t,onEdit:e})=>{let{setSelectedModel:i,selectedModel:n}=FRe(),r=n?.label===t.label,s=t.disabled??!1,o=zr(),a=!s&&!!e;return v("div",{className:"group relative",children:[v(bi.Item,{"data-testid":$Jd,"data-model-label":t.label,selected:r,disabled:s,className:a?"pr-8":void 0,onClick:()=>{s||i(t)},children:v("span",{className:ht("flex items-center gap-1.5 min-w-0",s?"text-muted-foreground":""),children:[v("span",{className:"truncate text-xs text-left",children:t.label}),v(OEn,{option:t})]})}),a&&v(yt,{children:[v("button",{type:"button",tabIndex:-1,"data-tooltip-id":o,"aria-label":"Edit Model",className:"absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center rounded p-1 opacity-0 transition-opacity hover:bg-secondary group-hover:opacity-100",onClick:l=>{l.stopPropagation(),e?.(t)},children:v(Re,{name:"edit",size:12})}),v(ji,{id:o,children:"Edit Model"})]})]})}';
    const eqdReplacement = 'EQd=({model:t,onEdit:e})=>{let{setSelectedModel:i,selectedModel:n}=FRe(),r=n?.label===t.label,s=t.disabled??!1,o=zr(),a=!s;let _handleEdit=l=>{l.stopPropagation();if(e)e(t);else if(typeof window.openAddModelModal==="function")window.openAddModelModal(t?.provider,t?.label||t?.displayName||t?.name)};return v("div",{className:"group relative",children:[v(bi.Item,{"data-testid":$Jd,"data-model-label":t.label,selected:r,disabled:s,className:"pr-8",onClick:()=>{s||i(t)},children:v("span",{className:ht("flex items-center gap-1.5 min-w-0",s?"text-muted-foreground":""),children:[v("span",{className:"truncate text-xs text-left",children:t.label}),v(OEn,{option:t})]})}),a&&v(yt,{children:[v("button",{type:"button",tabIndex:-1,"data-tooltip-id":o,"aria-label":"Edit Model",className:"absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center rounded p-1 opacity-0 transition-opacity hover:bg-secondary group-hover:opacity-100 z-20 cursor-pointer",onClick:_handleEdit,children:v(Re,{name:"edit",size:12})}),v(ji,{id:o,children:"Edit Model"})]})]})},';
    if (wbCode.includes(eqdTarget)) {
      wbCode = wbCode.replace(eqdTarget, eqdReplacement);
      console.log('   OK - workbench (EQd) patched with standard item and edit action');
    } else if (wbCode.includes('EQd=({model:t,onEdit:e})=>{')) {
      const eqdStart = wbCode.indexOf('EQd=({model:t,onEdit:e})=>{');
      if (eqdStart !== -1) {
        const eqdEnd = wbCode.indexOf(',SQd=', eqdStart);
        if (eqdEnd !== -1) {
          wbCode = wbCode.substring(0, eqdStart) + eqdReplacement + wbCode.substring(eqdEnd + 1);
          console.log('   OK - workbench (EQd) refreshed with standard item and edit action');
        }
      }
    }

    // D2. SQd provider grouping & smart [+] actions
    const sqdTarget = 'SQd=({customModels:t,onAddCustomModel:e,onEditCustomModel:i})=>{let{supportsCustomModels:n}=FRe(),r=zr(),s=zr();return t.length===0&&!e?null:v("div",{children:[v("div",{className:ht("group flex select-none items-center justify-between gap-1 p-1 pl-2 text-xs font-medium",e&&!n?"cursor-not-allowed":""),children:[v("span",{className:"opacity-50",children:"Custom"}),e&&(n?v(yt,{children:[v("button",{onClick:e,tabIndex:-1,"data-testid":jJd,className:"cursor-pointer rounded-md p-1 opacity-50 hover:bg-secondary hover:opacity-100","data-tooltip-id":r,children:v(Re,{name:"add",size:12})}),v(ji,{id:r,children:"Add Model"})]}):v(yt,{children:[v("div",{"data-tooltip-id":s,className:"hidden group-hover:block",children:v(Re,{name:"warning",size:12,className:"shrink-0 fill-yellow-200 stroke-yellow-800"})}),v(ji,{id:s,className:"max-w-[250px] whitespace-normal",children:"Custom models are only supported on Linux machines."})]}))]}),v("div",{className:"flex flex-col gap-px",children:t.map(o=>v(EQd,{model:o,onEdit:i},o.label))})]})};';
    const sqdTargetAlt = 'SQd=({customModels:t,onAddCustomModel:e,onEditCustomModel:i})=>{let{supportsCustomModels:n}=FRe(),r=zr(),s=zr();return t.length===0&&!e?null:v("div",{children:[v("div",{className:ht("group flex select-none items-center justify-between gap-1 p-1 pl-2 text-xs font-medium",e&&!n?"cursor-not-allowed":""),children:[v("span",{className:"opacity-50",children:"Custom"}),e&&(n?v(yt,{children:[v("button",{onClick:e,tabIndex:-1,"data-testid":jJd,className:"cursor-pointer rounded-md p-1 opacity-50 hover:bg-secondary hover:opacity-100","data-tooltip-id":r,children:v(Re,{name:"add",size:12})}),v(ji,{id:r,children:"Add Model"})]}):v(yt,{children:[v("div",{"data-tooltip-id":s,className:"hidden group-hover:block",children:v(Re,{name:"warning",size:12,className:"shrink-0 fill-yellow-200 stroke-yellow-800"})}),v(ji,{id:s,className:"max-w-[250px] whitespace-normal",children:"Custom models are only supported on Linux machines."})]}))]}),v("div",{className:"flex flex-col gap-px",children:t.map(o=>v(EQd,{model:o,onEdit:i},o.label))})]})},';
    const sqdReplacement = `SQd=({customModels:t,onAddCustomModel:e,onEditCustomModel:i})=>{let{supportsCustomModels:n}=FRe(),r=zr();let _openAdd=(prov)=>{try{window.__agy_default_provider=(prov||"").toLowerCase()}catch(_){}if(e)e();else if(typeof window.openAddModelModal==="function")window.openAddModelModal(prov);else if(typeof window.__agy_openModal==="function")window.__agy_openModal(prov)};let _modelsList=(t&&t.length>0)?t:P_o({customModels:{}});if(_modelsList.length===0){return v("div",{className:"pt-1 border-t border-border/40 mt-1",children:[v("button",{type:"button",onClick:()=>_openAdd(),className:"w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer",children:[v(Re,{name:"add",size:13}),v("span",{children:"Add Custom Model..."})]})]})}let _groups={};const _pMap={openrouter:'OpenRouter',openai:'OpenAI',anthropic:'Anthropic',google:'Google',ollama:'Ollama',deepseek:'DeepSeek',groq:'Groq',mistral:'Mistral',cerebras:'Cerebras',kimi:'Kimi',fireworks:'Fireworks',lmstudio:'LM Studio',llamacpp:'llama.cpp',nvidia:'NVIDIA'};for(const _m of _modelsList){let _rawP=_m.provider||"Custom";let _p=_pMap[_rawP.toLowerCase()]||(_rawP.charAt(0).toUpperCase()+_rawP.slice(1));if(!_groups[_p])_groups[_p]=[];_groups[_p].push(_m)}let _sections=[];for(const[_prov,_models]of Object.entries(_groups)){_sections.push(v("div",{key:_prov,className:"flex flex-col gap-1 mt-1",children:[v("div",{className:"group flex select-none items-center justify-between gap-1 p-1 pl-2 text-xs font-medium",children:[v("span",{className:"opacity-60 font-semibold tracking-wide",children:_prov}),v(yt,{children:[v("button",{onClick:()=>_openAdd(_models[0]?.provider||_prov),type:"button",tabIndex:-1,className:"cursor-pointer rounded-md p-1 opacity-50 hover:bg-secondary hover:opacity-100","data-tooltip-id":r,children:v(Re,{name:"add",size:12})}),v(ji,{id:r,children:"Add "+_prov+" Model"})]})]}),v("div",{className:"flex flex-col gap-px",children:_models.map(o=>v(EQd,{model:o,onEdit:i},o.label))})]}));}return v("div",{children:[..._sections,v("div",{key:"_add_global",className:"pt-1 border-t border-border/40 mt-1.5",children:[v("button",{type:"button",onClick:()=>_openAdd(),className:"w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer",children:[v(Re,{name:"add",size:13}),v("span",{children:"Add Custom Model..."})]})]})]})},`;
    if (wbCode.includes(sqdTarget)) {
      wbCode = wbCode.replace(sqdTarget, sqdReplacement);
      console.log('   OK - workbench (SQd) patched with provider grouping & smart [+] actions');
    } else if (wbCode.includes(sqdTargetAlt)) {
      wbCode = wbCode.replace(sqdTargetAlt, sqdReplacement);
      console.log('   OK - workbench (SQd alt) patched with provider grouping & smart [+] actions');
    } else if (wbCode.includes('SQd=({customModels:t,onAddCustomModel:e,onEditCustomModel:i})=>{')) {
      const sqdStart = wbCode.indexOf('SQd=({customModels:t,onAddCustomModel:e,onEditCustomModel:i})=>{');
      if (sqdStart !== -1) {
        const sqdEnd = wbCode.indexOf(',CQd=', sqdStart);
        if (sqdEnd !== -1) {
          wbCode = wbCode.substring(0, sqdStart) + sqdReplacement + wbCode.substring(sqdEnd + 1);
          console.log('   OK - workbench (SQd) refreshed with latest provider grouping & smart [+] actions');
        }
      }
    }

    // D2.1. vQd Context Provider in workbench.desktop.main.js (v2.6.0+)
    const vqdTarget = 'return v(TZo.Provider,{value:{...t,setSelectedModel:e,customModels:t.customModels??[],supportsCustomModels:t.supportsCustomModels??!1,showCustomModelHeader:t.showCustomModelHeader??!1,isModelListLoading:t.isModelListLoading??!1,groups:a,effortIndex:o,bestOfNConfig:n},children:[i&&v(mQd,{open:t.open}),t.children]})}';
    const vqdReplacement = 'let _liveCust=(t.customModels&&t.customModels.length>0)?t.customModels:P_o({customModels:{}});let _openAdd=(prov)=>{try{window.__agy_default_provider=(prov||"").toLowerCase()}catch(_){}if(t.onAddCustomModel)t.onAddCustomModel();else if(typeof window.openAddModelModal==="function")window.openAddModelModal(prov);else if(typeof window.__agy_openModal==="function")window.__agy_openModal(prov)};let _openEdit=(mod)=>{if(t.onEditCustomModel)t.onEditCustomModel(mod);else if(typeof window.openAddModelModal==="function")window.openAddModelModal(mod?.provider,mod?.label||mod?.displayName||mod?.name)};return v(TZo.Provider,{value:{...t,setSelectedModel:e,customModels:_liveCust,supportsCustomModels:!0,showCustomModelHeader:!0,onAddCustomModel:_openAdd,onEditCustomModel:_openEdit,isModelListLoading:t.isModelListLoading??!1,groups:a,effortIndex:o,bestOfNConfig:n},children:[i&&v(mQd,{open:t.open}),t.children]})}';
    if (wbCode.includes(vqdTarget)) {
      wbCode = wbCode.replace(vqdTarget, vqdReplacement);
      console.log('   OK - workbench (vQd model dropdown context provider) patched');
    } else if (wbCode.includes('customModels:_liveCust,supportsCustomModels:!0')) {
      console.log('   OK - workbench (vQd) already patched');
    }

    // D2.2. IQd un-gate custom models list in workbench.desktop.main.js (v2.6.0+)
    const iqdCondTarget = 's&&v(SQd,{customModels:i,onAddCustomModel:n,onEditCustomModel:r})';
    const iqdCondReplacement = 'v(SQd,{customModels:i,onAddCustomModel:n,onEditCustomModel:r})';
    if (wbCode.includes(iqdCondTarget)) {
      wbCode = wbCode.replace(iqdCondTarget, iqdCondReplacement);
      console.log('   OK - workbench (IQd) un-gated custom models dropdown list');
    } else if (!wbCode.includes(iqdCondTarget) && wbCode.includes(iqdCondReplacement)) {
      console.log('   OK - workbench (IQd) already un-gated');
    }

    // D3. YUo Native Dialog replacement
    const yuoStart = 'YUo=({isOpen:t,operation:e,onClose:i,modelName:n,customModelsState:r,pushCustomModelsUpdate:s,setSelectedModelConfig:o})=>{';
    const yuoEnd = 'disabled:!a||!d||!h,className:"hover:opacity-90 rounded-md flex items-center gap-1 border-none bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed",children:"Save"})]})]})})}';
    const yuoReplacement = `YUo=({isOpen:t,operation:e,onClose:i,modelName:n,customModelsState:r,pushCustomModelsUpdate:s,setSelectedModelConfig:o})=>{let[prov,setProv]=ce("openrouter"),[mId,setMId]=ce(""),[disp,setDisp]=ce(""),[key,setKey]=ce(""),[url,setUrl]=ce("https://openrouter.ai/api/v1/chat/completions"),[ctx,setCtx]=ce(128000),[out,setOut]=ce(8192),[popModels,setPopModels]=ce([]),[hasKey,setHasKey]=ce(!1),[isCustomId,setIsCustomId]=ce(!1),[testStatus,setTestStatus]=ce(null),[isSaving,setIsSaving]=ce(!1),[isTesting,setIsTesting]=ce(!1),{logEvent:A}=Zs();const defUrls={openrouter:'https://openrouter.ai/api/v1/chat/completions',openai:'https://api.openai.com/v1/chat/completions',deepseek:'https://api.deepseek.com/chat/completions',ollama:'http://localhost:11434/v1/chat/completions',anthropic:'https://api.anthropic.com/v1/messages',groq:'https://api.groq.com/openai/v1/chat/completions',mistral:'https://api.mistral.ai/v1/chat/completions',cerebras:'https://api.cerebras.ai/v1/chat/completions',custom:''};const fmtTok=x=>x>=1e6?(x/1e6).toFixed(x%1e6===0?0:1)+'M tokens':x>=1e3?Math.round(x/1e3)+'k tokens':x+' tokens';Oe(()=>{if(t){setTestStatus(null);setIsSaving(!1);setIsTesting(!1);if(e==='edit'&&n){let baseLabel=(n||'').replace(/\\s*\\((low|medium|high|default).*?\\)$/i,'').trim();let found=(_cachedCustomModels||[]).find(m=>(m.displayName&&m.displayName===baseLabel)||(m.displayName&&m.displayName===n)||(m.name&&m.name===baseLabel)||(m.name&&m.name===n)||(m.externalModelName&&m.externalModelName===baseLabel));if(!found&&r?.customModels?.[n]){let old=r.customModels[n];found={provider:old.provider||'openrouter',externalModelName:old.modelName,displayName:old.chatModelName||n,apiUrl:old.apiUrl,maxTokens:old.maxTokens,maxOutputTokens:old.maxOutputTokens}}const applyFound=f=>{let _p=(f.provider||'openrouter').toLowerCase();setProv(_p);let mid=f.externalModelName||f.name||'';setMId(mid);setDisp(f.displayName||n);setUrl(f.apiUrl||defUrls[_p]||'');setCtx(f.maxTokens||128000);setOut(f.maxOutputTokens||8192);setKey('');setIsCustomId(!1)};if(found){applyFound(found)}else{fetch('http://127.0.0.1:50999/v1internal/customModels').then(x=>x.json()).then(list=>{if(Array.isArray(list)){let f=list.find(m=>(m.displayName&&m.displayName===baseLabel)||(m.displayName&&m.displayName===n)||(m.name&&m.name===baseLabel));if(f)applyFound(f)}}).catch(()=>{})}}else{let initP=(window.__agy_default_provider||'openrouter').toLowerCase();try{delete window.__agy_default_provider}catch(_){}setProv(initP);setMId('');setDisp('');setKey('');setUrl(defUrls[initP]||'');setCtx(128000);setOut(8192);setIsCustomId(!1)}}},[t,e,n]);Oe(()=>{if(t&&prov){fetch('http://127.0.0.1:50999/v1internal/providerModels?provider='+encodeURIComponent(prov)).then(x=>x.json()).then(d=>{let models=d.models||[];setPopModels(models);setHasKey(!!d.hasConfiguredKey);if(mId){let exists=models.some(x=>x.id===mId);setIsCustomId(!exists)}}).catch(()=>{})}},[t,prov]);const onSelectModel=m=>{setMId(m.id);setIsCustomId(!1);if(!disp||disp===mId||popModels.some(p=>p.name===disp||p.id===disp))setDisp(m.name||m.id);if(m.contextWindow||m.maxOutputTokens){setCtx(m.contextWindow||128000);setOut(m.maxOutputTokens||8192)}};const onSelectDropdownChange=val=>{if(val==='__custom__'){setIsCustomId(!0);setMId('')}else if(!val){setMId('')}else{setIsCustomId(!1);let chosen=popModels.find(x=>x.id===val);if(chosen){onSelectModel(chosen)}else{setMId(val)}}};const onModelInput=val=>{setMId(val);fetch('http://127.0.0.1:50999/v1internal/resolveModelSpec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({modelId:val.trim()})}).then(x=>x.json()).then(spec=>{if(spec&&spec.contextWindow){setCtx(spec.contextWindow);setOut(spec.maxOutputTokens)}}).catch(()=>{})};const onTest=()=>{setIsTesting(!0);setTestStatus({type:'loading',text:'Testando conexão...'});fetch('http://127.0.0.1:50999/v1internal/testConnection',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:prov,apiKey:key.trim(),apiUrl:url.trim()})}).then(x=>x.json()).then(res=>{setIsTesting(!1);setTestStatus(res.success?{type:'success',text:'✓ '+(res.message||'Conectado!')}:{type:'error',text:'✕ '+(res.error||'Falha na conexão.')})}).catch(err=>{setIsTesting(!1);setTestStatus({type:'error',text:'✕ Erro: '+err.message})})};const onDelete=()=>{if(e==='edit'&&n){fetch('http://127.0.0.1:50999/v1internal/deleteCustomModel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({modelName:n})}).catch(()=>{});try{if(typeof _cachedCustomModels!=='undefined'){_cachedCustomModels=_cachedCustomModels.filter(m=>(m.displayName||m.name)!==n&&m.name!==n)}}catch(_){}s({type:'removeCustomModel',label:n});try{window.__agy_onModelsUpdated?.()}catch(_){}try{window._fetchCustomModelsAsync?.()}catch(_){}i();A(Ji.CASCADE_CUSTOM_MODEL_EVENT,Sn({extra:{action:'delete',model_name:n}},'static action and user-provided model label'))}};const onSave=()=>{let mTrim=mId.trim();if(!mTrim)return;let dTrim=disp.trim()||mTrim;setIsSaving(!0);let rawSlug=(mTrim.startsWith('models/')?mTrim.slice(7):mTrim).replace(/[^a-zA-Z0-9_-]+/g,'-').toLowerCase();let modelObj={name:'models/'+rawSlug,displayName:dTrim,provider:prov,apiKey:key.trim(),apiUrl:url.trim(),externalModelName:mTrim,maxTokens:ctx,maxOutputTokens:out,supportsThinking:!0,oldLabel:e==='edit'&&n?n:void 0};fetch('http://127.0.0.1:50999/v1internal/saveCustomModel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(modelObj)}).then(x=>x.json()).then(res=>{setIsSaving(!1);if(res.success){try{if(typeof _cachedCustomModels!=='undefined'){let fIdx=_cachedCustomModels.findIndex(m=>(e==='edit'&&n&&((m.displayName||m.name)===n||m.name===n))||(m.displayName||m.name)===dTrim||m.name===modelObj.name||m.externalModelName===mTrim);if(fIdx>=0){_cachedCustomModels[fIdx]={..._cachedCustomModels[fIdx],...modelObj}}else{_cachedCustomModels.push(modelObj)}}}catch(_){}let k=lt(Kco,{zeroShotCapable:!0,supportsImages:!0,supportsToolCalls:!0,supportsThinking:!0});let M=lt(jco,{modelId:326,apiProvider:1,chatModelName:dTrim,modelName:mTrim,maxTokens:ctx,modelFeatures:k});M.provider=prov;s(e==='edit'&&n?{type:'editCustomModel',oldLabel:n,label:dTrim,modelInfo:M}:{type:'addCustomModel',label:dTrim,modelInfo:M});let B={label:dTrim,value:326,isCustom:!0,customModelUrl:mTrim,disabled:!1};o(B);try{window.__agy_onModelsUpdated?.()}catch(_){}try{window._fetchCustomModelsAsync?.()}catch(_){}A(Ji.CASCADE_CUSTOM_MODEL_EVENT,Sn({extra:{action:e,model_name:dTrim}},'static action and user-provided model label'));i()}else{setTestStatus({type:'error',text:'✕ Erro ao salvar: '+(res.error||'Desconhecido')})}}).catch(err=>{setIsSaving(!1);setTestStatus({type:'error',text:'✕ Erro de conexão: '+err.message})})};if(!t)return null;let topPills=popModels.filter(x=>x.isPopular).slice(0,5);if(topPills.length===0)topPills=popModels.slice(0,4);return v(bg,{isOpen:t,onClose:i,onSubmit:onSave,title:e==='add'?'Adicionar Modelo Customizado (BYOK)':'Editar Modelo Customizado',className:'w-[90vw] max-w-[540px] rounded-md',children:v('div',{className:'flex w-full flex-col gap-3 py-1',children:[v('div',{className:'flex flex-col gap-1',children:[v('label',{className:'text-xs font-medium text-muted-foreground',children:'Provedor'}),v('select',{value:prov,onChange:k=>{let p=k.target.value;setProv(p);setUrl(defUrls[p]||'')},className:'w-full rounded-md border border-input bg-input-background p-2 text-foreground text-xs outline-none cursor-pointer',children:[v('option',{value:'openrouter',children:'OpenRouter'}),v('option',{value:'deepseek',children:'DeepSeek'}),v('option',{value:'openai',children:'OpenAI'}),v('option',{value:'ollama',children:'Ollama (Local)'}),v('option',{value:'groq',children:'Groq'}),v('option',{value:'mistral',children:'Mistral'}),v('option',{value:'cerebras',children:'Cerebras'}),v('option',{value:'anthropic',children:'Anthropic'}),v('option',{value:'custom',children:'Custom / OpenAI-Compatible'})]})]}),topPills.length>0&&v('div',{className:'flex flex-col gap-1',children:[v('label',{className:'text-xs font-medium text-muted-foreground',children:'⭐ Modelos Populares'}),v('div',{className:'flex flex-wrap gap-1.5',children:topPills.map(p=>v('button',{type:'button',key:p.id,onClick:()=>onSelectModel(p),className:'rounded border '+(mId===p.id&&!isCustomId?'border-primary bg-primary/20 text-primary font-medium':'border-border/60 bg-secondary/50 hover:bg-secondary text-foreground')+' px-2 py-1 text-[11px] transition-colors cursor-pointer',children:p.name||p.id}))})]}),v('div',{className:'flex flex-col gap-1',children:[v('label',{className:'text-xs font-medium text-muted-foreground',children:['Modelo ',v('span',{className:'text-destructive',children:'*'})]}),v('select',{value:isCustomId?'__custom__':mId,onChange:k=>onSelectDropdownChange(k.target.value),className:'w-full rounded-md border border-input bg-input-background p-2 text-foreground text-xs outline-none cursor-pointer',children:[v('option',{value:'',disabled:!0,children:popModels.length>0?'-- Selecione um modelo do provedor --':'-- Carregando modelos... --'},'_ph'),...popModels.map(x=>v('option',{value:x.id,children:(x.name&&x.name!==x.id?x.name+' ('+x.id+')':x.id)+(x.contextWindow?' ['+fmtTok(x.contextWindow)+']':'')},x.id)),v('option',{value:'__custom__',children:'➕ Outro (digitar ID manualmente...)'},'_custom')]}),(isCustomId||prov==='custom'||popModels.length===0)&&v('div',{className:'flex flex-col gap-1 mt-1',children:[v('input',{type:'text',value:mId,onChange:k=>onModelInput(k.target.value),placeholder:'ex: google/gemini-2.5-flash ou deepseek/deepseek-chat',className:'w-full rounded-md border border-input bg-input-background p-2 text-foreground text-xs outline-none'})]})]}),v('div',{className:'flex items-center justify-between rounded-md border border-border/40 bg-secondary/20 p-2 text-xs',children:[v('span',{className:'text-muted-foreground text-[11px]',children:'Limites Detectados:'}),v('div',{className:'flex gap-2',children:[v('span',{className:'rounded border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[11px] font-mono text-blue-400',children:['🌐 Contexto: ',fmtTok(ctx)]}),v('span',{className:'rounded border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[11px] font-mono text-green-400',children:['📤 Saída: ',fmtTok(out)]})]})]}),v('div',{className:'flex flex-col gap-1',children:[v('label',{className:'text-xs font-medium text-muted-foreground',children:'Nome de Exibição (Opcional)'}),v('input',{type:'text',value:disp,onChange:k=>setDisp(k.target.value),placeholder:'ex: Gemini 2.5 Flash (OpenRouter)',className:'w-full rounded-md border border-input bg-input-background p-2 text-foreground text-xs outline-none'})]}),prov!=='ollama'&&v('div',{className:'flex flex-col gap-1',children:[v('label',{className:'text-xs font-medium text-muted-foreground',children:'API Key'}),v('input',{type:'password',value:key,onChange:k=>setKey(k.target.value),placeholder:hasKey?'(Chave mestre já configurada - deixe em branco para manter)':'sk-...',className:'w-full rounded-md border border-input bg-input-background p-2 text-foreground text-xs outline-none'})]}),v('div',{className:'flex flex-col gap-1',children:[v('label',{className:'text-xs font-medium text-muted-foreground',children:'Endpoint URL'}),v('input',{type:'text',value:url,onChange:k=>setUrl(k.target.value),placeholder:defUrls[prov]||'',className:'w-full rounded-md border border-input bg-input-background p-2 text-foreground text-xs outline-none'})]}),testStatus&&v('div',{className:testStatus.type==='success'?'rounded p-2 text-xs bg-green-500/15 text-green-400 border border-green-500/30':testStatus.type==='error'?'rounded p-2 text-xs bg-red-500/15 text-red-400 border border-red-500/30':'rounded p-2 text-xs bg-secondary text-muted-foreground',children:testStatus.text}),v('div',{className:'flex w-full items-center justify-between pt-2 border-t border-border/40 mt-1',children:[v('button',{type:'button',onClick:onTest,disabled:isTesting,className:'rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer',children:isTesting?'Testando...':'Testar Conexão'}),v('div',{className:'flex items-center gap-2',children:[v(Xt,{variant:'ghost',onClick:i,children:'Cancelar'}),e==='edit'&&v(Xt,{variant:'destructive',onClick:onDelete,children:'Excluir'}),v('button',{type:'button',onClick:onSave,disabled:!mId.trim()||isSaving,className:'rounded bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity',children:isSaving?'Salvando...':'Salvar Modelo'})]})]})]})})}`;

    if (wbCode.includes(yuoStart) && wbCode.includes(yuoEnd)) {
      const sIdx = wbCode.indexOf(yuoStart);
      const eIdx = wbCode.indexOf(yuoEnd, sIdx);
      if (sIdx !== -1 && eIdx !== -1) {
        wbCode = wbCode.substring(0, sIdx) + yuoReplacement + wbCode.substring(eIdx + yuoEnd.length);
        console.log('   OK - workbench (YUo) replaced with BYOK native dialog');
      }
    } else if (wbCode.includes('Adicionar Modelo Customizado (BYOK)')) {
      console.log('   OK - workbench (YUo) already patched with BYOK native dialog');
    }

    // E. Live disk auto-sync in KQt
    const kqtLiveTarget = '},[o?.cascadeModelConfigData]),S=oe(()=>{let w=P_o(l);for(let A of w)A.disabled=!f;return w},[l,f])';
    const kqtLiveReplacement = '},[o?.cascadeModelConfigData]);let[_dv,_sdv]=ce(0);Oe(()=>{window.__agy_onModelsUpdated=()=>_sdv(v=>v+1);const _iv=setInterval(()=>{_fetchCustomModelsAsync(()=>{_sdv(v=>v+1)})},3000);return ()=>{clearInterval(_iv);delete window.__agy_onModelsUpdated}},[]);let S=oe(()=>{let w=P_o(l);for(let A of w)A.disabled=!f;return w},[l,f,_dv])';
    if (wbCode.includes(kqtLiveTarget)) {
      wbCode = wbCode.replace(kqtLiveTarget, kqtLiveReplacement);
      console.log('   OK - workbench (KQt) patched with live disk auto-sync');
    } else if (wbCode.includes('_sdv')) {
      console.log('   OK - workbench (KQt) already patched with live auto-sync');
    }

    // F. Responsive max-h & custom scrollbar
    const tqdTarget = 'TQd=()=>v("div",{"data-testid":JJd,className:"flex flex-col max-h-80 overflow-hidden outline-none"';
    const tqdOldNoHidden = 'TQd=()=>v("div",{"data-testid":JJd,className:"flex flex-col max-h-[min(540px,75vh)] outline-none"';
    const tqdReplacement = 'TQd=()=>v("div",{"data-testid":JJd,className:"flex flex-col max-h-[min(540px,75vh)] overflow-hidden outline-none"';
    if (wbCode.includes(tqdTarget)) {
      wbCode = wbCode.replace(tqdTarget, tqdReplacement);
      console.log('   OK - workbench (TQd panel responsive max-h) patched');
    } else if (wbCode.includes(tqdOldNoHidden)) {
      wbCode = wbCode.replace(tqdOldNoHidden, tqdReplacement);
      console.log('   OK - workbench (TQd panel restored overflow-hidden) patched');
    } else if (wbCode.includes('max-h-[min(540px,75vh)] overflow-hidden outline-none')) {
      console.log('   OK - workbench (TQd panel responsive max-h) already patched');
    }

    const iqdScrollTarget = 'className:"flex flex-col flex-grow min-h-0 pt-0 overflow-y-auto overscroll-y-none pb-1 gap-px scrollbar-none"';
    const iqdScrollReplacement = 'className:"flex flex-col flex-grow min-h-0 pt-0 overflow-y-auto overscroll-y-none pb-1 gap-px custom-scrollbar pr-1"';
    if (wbCode.includes(iqdScrollTarget)) {
      wbCode = wbCode.replace(iqdScrollTarget, iqdScrollReplacement);
      console.log('   OK - workbench (IQd visible custom scrollbar) patched');
    } else if (wbCode.includes('custom-scrollbar pr-1')) {
      console.log('   OK - workbench (IQd visible custom scrollbar) already patched');
    }

    const wbPopupTarget = 'className:"min-w-64 max-w-80 !w-max p-1",children:v(TQd,{})';
    const wbPopupReplacement = 'className:"min-w-64 max-w-80 !w-max p-1 overflow-hidden",children:v(TQd,{})';
    if (wbCode.includes(wbPopupTarget)) {
      wbCode = wbCode.replace(wbPopupTarget, wbPopupReplacement);
      console.log('   OK - workbench (bi.Content popup outer overflow-hidden) patched');
    } else if (wbCode.includes(wbPopupReplacement)) {
      console.log('   OK - workbench (bi.Content popup outer overflow-hidden) already patched');
    }

    // G. Effort label lookup (kQd)
    const kqdTarget = 'kQd=(t,e,i)=>{let n=t.find(s=>s.label===i);if(n)return n;let r=e.find(s=>s.label===i);if(r)return r}';
    const kqdReplacement = 'kQd=(t,e,i)=>{let _b=dQd(i)?.base||i;let n=t.find(s=>s.label===i||s.label===_b);if(n)return n.label===i?n:{...n,label:i};let r=e.find(s=>s.label===i||s.label===_b);if(r)return r.label===i?r:{...r,label:i}}';
    if (wbCode.includes(kqdTarget)) {
      wbCode = wbCode.replace(kqdTarget, kqdReplacement);
      console.log('   OK - workbench (kQd) patched for effort label lookup');
    } else if (wbCode.includes('kQd=(t,e,i)=>{let _b=dQd(i)')) {
      console.log('   OK - workbench (kQd) already patched');
    }

    // H. Selection match & proxy notification (KQt)
    const kqtSelectTarget = 'y=z((w,A=!0)=>{s("selected_model_changed",Sn({extra:{name:w.label}},"model label from server-controlled set"));let I=w.value===kS.GOOGLE_GEMINI_INTERNAL_BYOM;b(I?w.label:null);let x=PZc(w),T;if(I){let V=Cun(w.label,l);V&&(T=V)}r?.(x,T,A)},[s,r,l]);';
    const kqtSelectReplacement = 'y=z((w,A=!0)=>{s("selected_model_changed",Sn({extra:{name:w.label}},"model label from server-controlled set"));let I=w.value===kS.GOOGLE_GEMINI_INTERNAL_BYOM;b(I?w.label:null);let x=PZc(w),T;if(I){let V=Cun(w.label,l);V&&(T=V)}try{fetch("http://127.0.0.1:50999/v1internal/selectModel",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({label:w.label,isCustom:I,override:T,native:!I})}).catch(()=>{})}catch(_e){}r?.(x,T,A)},[s,r,l]);Oe(()=>{if(_){let I=_.value===kS.GOOGLE_GEMINI_INTERNAL_BYOM||!!_.isCustom;let V=I?Cun(_.label,l):void 0;try{fetch("http://127.0.0.1:50999/v1internal/selectModel",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({label:_.label,isCustom:I,override:V,native:!I})}).catch(()=>{})}catch(_e){}}},[_,l]);';
    if (wbCode.includes(kqtSelectTarget)) {
      wbCode = wbCode.replace(kqtSelectTarget, kqtSelectReplacement);
      console.log('   OK - workbench (KQt selection notifier) patched');
    } else if (wbCode.includes('/v1internal/selectModel')) {
      console.log('   OK - workbench (KQt selection notifier) already patched');
    }

    // J. Quota remainingFraction guard (kpo)
    const kpoTarget = 'function kpo(t){let e=t.remaining.case==="remainingFraction"?t.remaining.value:void 0';
    const kpoReplacement = 'function kpo(t){let e=t?.remaining?.case==="remainingFraction"?t.remaining.value:(t?.remainingFraction??t?.remaining?.value)';
    if (wbCode.includes(kpoTarget)) {
      wbCode = wbCode.replace(kpoTarget, kpoReplacement);
      console.log('   OK - workbench (kpo safe remainingFraction extraction) patched');
    } else if (wbCode.includes('function kpo(t){let e=t?.remaining?.case')) {
      console.log('   OK - workbench (kpo safe remainingFraction extraction) already patched');
    }

    // J3. View Usage Trigger (xQd)
    const xqdFlagTarget = 'i=Kt().get("inputComponent")?.showModelUsage===!0';
    const xqdFlagReplacement = 'i=!0';
    if (wbCode.includes(xqdFlagTarget)) {
      wbCode = wbCode.replace(xqdFlagTarget, xqdFlagReplacement);
      console.log('   OK - workbench (xQd View Usage submenu flyout) enabled');
    } else if (wbCode.includes('showModelUsage===!0') === false) {
      console.log('   OK - workbench (xQd View Usage submenu flyout) already enabled');
    }

    const xqdTriggerTarget = 'v(bi.SubmenuTrigger,{children:[v(Re,{name:"speed"}),v("span",{className:"text-xs flex-1",children:"View Usage"})]})';
    const xqdTriggerReplacement = 'v(bi.SubmenuTrigger,{className:"flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer",children:[v(Re,{name:"speed",size:14}),v("span",{className:"text-xs flex-1",children:"View Usage"})]})';
    if (wbCode.includes(xqdTriggerTarget)) {
      wbCode = wbCode.replace(xqdTriggerTarget, xqdTriggerReplacement);
      console.log('   OK - workbench (xQd trigger styling) patched');
    } else if (wbCode.includes(xqdTriggerReplacement)) {
      console.log('   OK - workbench (xQd trigger styling) already clean without extra chevron');
    }

    // J4. Parallel Quota Fetcher (AZo)
    const azoTarget = 'let s=t.retrieveUserQuotaSummary(void 0,e).then(o=>{let a=o.response?.groups||[];return r>=gE.latestCompletedRequestId&&(gE.latestCompletedRequestId=r,gE.cachedQuotaGroups=a,gE.lastRefreshTimestampMs=Date.now()),a}).catch(()=>gE.cachedQuotaGroups||[]).finally(()=>{gE.activeQuotaFetchPromise===s&&(gE.activeQuotaFetchPromise=void 0,gE.activeFetchIsForced=!1)});';
    const azoReplacement = 'let _gFetch=(t?.retrieveUserQuotaSummary)?t.retrieveUserQuotaSummary(void 0,e).then(o=>o.response?.groups||o.groups||[]).catch(()=>[]):Promise.resolve([]);let _bFetch=fetch("http://127.0.0.1:50999/v1internal/quotaSummary").then(x=>x.json()).then(d=>d.groups||[]).catch(()=>[]);let s=Promise.all([_gFetch,_bFetch]).then(([gGroups,bGroups])=>{let merged=(gGroups||[]).slice();for(let b of(bGroups||[])){if(!merged.some(m=>m.displayName===b.displayName))merged.push(b)}if(r>=gE.latestCompletedRequestId){gE.latestCompletedRequestId=r;gE.cachedQuotaGroups=merged;gE.lastRefreshTimestampMs=Date.now()}return merged}).catch(()=>gE.cachedQuotaGroups||[]).finally(()=>{gE.activeQuotaFetchPromise===s&&(gE.activeQuotaFetchPromise=void 0,gE.activeFetchIsForced=!1)});';
    if (wbCode.includes(azoTarget)) {
      wbCode = wbCode.replace(azoTarget, azoReplacement);
      console.log('   OK - workbench (AZo Quota parallel Google+BYOK fetcher) patched');
    } else if (wbCode.includes('Promise.all([_gFetch,_bFetch])')) {
      console.log('   OK - workbench (AZo Quota) already patched with parallel fetcher');
    }

    // J5. Models & Usage Dialog Quota Fetcher
    const dialogQuotaTarget260 = 'n.retrieveUserQuotaSummary?.(void 0,x)?.then(T=>{g(T.response?.groups||[]),b(T.response?.description)}).catch(T=>{e(on.USER_QUOTA_FETCH_FAILED,T)})';
    const dialogQuotaReplacement260 = 'n.retrieveUserQuotaSummary?.(void 0,x)?.then(async T=>{let _g=T.response?.groups||[];try{const _bq=await fetch("http://127.0.0.1:50999/v1internal/quotaSummary").then(x=>x.json()).catch(()=>null);if(_bq?.groups?.length)_g=_g.concat(_bq.groups)}catch(_){}g(_g),b(T.response?.description)}).catch(async T=>{try{const _bq=await fetch("http://127.0.0.1:50999/v1internal/quotaSummary").then(x=>x.json()).catch(()=>null);if(_bq?.groups?.length){g(_bq.groups);return}}catch(_){}e(on.USER_QUOTA_FETCH_FAILED,T)})';
    if (wbCode.includes(dialogQuotaTarget260)) {
      wbCode = wbCode.replace(dialogQuotaTarget260, dialogQuotaReplacement260);
      console.log('   OK - workbench (2.6.0 Models & Usage Dialog Quota) patched');
    } else if (wbCode.includes('http://127.0.0.1:50999/v1internal/quotaSummary') && wbCode.includes('g(_g)')) {
      console.log('   OK - workbench (2.6.0 Models & Usage Dialog Quota) already patched');
    }

    // J6. Models & Usage Cost Settings Card (Workbench)
    const wbSettingsTarget = 'description:"Manage your model quota and credits.",children:[';
    const wbCardSnippet = makeByokSettingsCardSnippet('v');
    const oldWbCardDefRegex = /^\s*var AgyCostSettingsCard=[\s\S]*?;\n+/;
    if (oldWbCardDefRegex.test(wbCode)) {
      wbCode = wbCode.replace(oldWbCardDefRegex, '');
    }
    if (wbCode.includes('v(AgyCostSettingsCard,{})')) {
      wbCode = wbCode.replace('v(AgyCostSettingsCard,{})', wbCardSnippet);
      console.log('   OK - workbench (Models & Usage Cost Settings Card) updated to direct inline JSX');
    } else if (wbCode.includes(wbSettingsTarget) && !wbCode.includes('BYOK Provider & Cost Management')) {
      wbCode = wbCode.replace(wbSettingsTarget, wbSettingsTarget + wbCardSnippet);
      console.log('   OK - workbench (Models & Usage Cost Settings Card) injected');
    } else if (wbCode.includes('BYOK Provider & Cost Management')) {
      console.log('   OK - workbench (Models & Usage Cost Settings Card) already injected');
    }

    // J7. Cascade Bar: Always show file nav section (< Edited files 1/N >)
    const uonFileNavTarget = 'const n=i===1;this._fileNavSection.classList.toggle("hidden",n);';
    const uonFileNavReplacement = 'const n=!1;this._fileNavSection.classList.toggle("hidden",n);';
    if (wbCode.includes(uonFileNavTarget)) {
      wbCode = wbCode.replace(uonFileNavTarget, uonFileNavReplacement);
      console.log('   OK - workbench (uOn Cascade Bar file navigation always visible) patched');
    } else if (wbCode.includes(uonFileNavReplacement)) {
      console.log('   OK - workbench (uOn Cascade Bar file navigation) already patched');
    }

  } else {
    // ==========================================
    // PATCHES FOR LEGACY IDE 2.5.5
    // ==========================================

    // A. Patch EOu, U5n, and SOu for reasoning effort levels including "Default"
    const effortDefsTarget = 'EOu=["low","medium","high"],U5n={low:"Low",medium:"Medium",high:"High"},yOu=new Map,SOu=/^(.*?)\\s*\\((low|medium|high)(?:\\s+thinking)?\\)\\s*$/i';
    const effortDefsReplacement = 'EOu=["default","low","medium","high"],U5n={default:"Default",low:"Low",medium:"Medium",high:"High"},yOu=new Map,SOu=/^(.*?)\\s*\\((default|low|medium|high)(?:\\s+thinking)?\\)\\s*$/i';
    if (wbCode.includes(effortDefsTarget)) {
      wbCode = wbCode.replace(effortDefsTarget, effortDefsReplacement);
      console.log('   OK - workbench (EOu/U5n/SOu) patched with Default effort level');
    } else if (wbCode.includes('default:"Default"')) {
      console.log('   OK - workbench (EOu/U5n/SOu) already patched with Default effort level');
    }

    // B. Patch qZe so custom models can utilize effort submenus
    const qzeTarget = 'qZe=t=>{if(!t.isCustom)return yOu.get(t.value)??COu(t.label)}';
    const qzeReplacement = 'qZe=t=>yOu.get(t.value)??COu(t.label)';
    if (wbCode.includes(qzeTarget)) {
      wbCode = wbCode.replace(qzeTarget, qzeReplacement);
      console.log('   OK - workbench (qZe) patched for custom models');
    } else if (wbCode.includes(qzeReplacement)) {
      console.log('   OK - workbench (qZe) already patched for custom models');
    }

    // B1. Patch supportsCustomModels and showCustomModelHeader
    const customFlagTarget = 'a.osName==="linux"&&a.isGoogleInternal,h=a.isGoogleInternal';
    const customFlagReplacement = '!0,h=!0';
    if (wbCode.includes(customFlagTarget)) {
      wbCode = wbCode.replace(customFlagTarget, customFlagReplacement);
      console.log('   OK - workbench (supportsCustomModels) unlocked (u=true, h=true)');
    } else if (wbCode.includes(customFlagReplacement)) {
      console.log('   OK - workbench (supportsCustomModels) already unlocked');
    }

    // C. Patch VQo & kQo
    const vqoTarget = 'var VQo=t=>t?.customModels?Object.entries(t.customModels).map(([e,i])=>({label:e,value:i.modelId,isCustom:!0,customModelUrl:i.modelName})):[],kQo=(t,e)=>{if(e?.customModels)return e.customModels[t]}';
    const vqoReplacement = `var _cachedCustomModels=${customModelsJsonLiteral},_lastCustomFetch=0,_fetchingCustomModels=!1;var _fetchCustomModelsAsync=cb=>{if(_fetchingCustomModels)return;_fetchingCustomModels=!0;try{fetch("http://127.0.0.1:50999/v1internal/customModels").then(r=>r.json()).then(d=>{const _l=Array.isArray(d)?d:(d.models||[]);if(_l&&_l.length){const _old=JSON.stringify(_cachedCustomModels);const _new=JSON.stringify(_l);_cachedCustomModels=_l;if(_old!==_new){cb?.();try{window.__agy_onModelsUpdated?.()}catch(_){}}}}).catch(()=>{}).finally(()=>{_fetchingCustomModels=!1})}catch(_e){_fetchingCustomModels=!1}};try{window._fetchCustomModelsAsync=_fetchCustomModelsAsync}catch(_e){}try{_fetchCustomModelsAsync()}catch(_e){}var _getDiskCustomModels=()=>{const _now=Date.now();if(!_cachedCustomModels||_cachedCustomModels.length===0||_now-_lastCustomFetch>2500){_lastCustomFetch=_now;_fetchCustomModelsAsync()}return _cachedCustomModels||[]};var VQo=t=>{let _r=[],_d=_getDiskCustomModels();for(const _m of _d){const _lbl=_m.displayName||_m.name;if(_lbl)_r.push({label:_lbl,value:326,isCustom:!0,customModelUrl:_m.externalModelName||_m.name||_lbl,supportsThinking:_m.supportsThinking!==!1,provider:_m.provider||'Custom'})}if(t?.customModels){for(const[e,i]of Object.entries(t.customModels)){if(!_r.some(_x=>_x.label===e)){let matched=_d.find(x=>(x.displayName||x.name)===e||x.name===e||x.externalModelName===i.modelName);let prov=matched?.provider||i.provider||'Custom';_r.push({label:e,value:i.modelId||326,isCustom:!0,customModelUrl:i.modelName,supportsThinking:!0,provider:prov})}}}return _r},kQo=(t,e)=>{if(e?.customModels&&e.customModels[t])return e.customModels[t];try{const _q=COu(t);const _base=_q?.base||t;const _eff=_q?.effort;const _d=_getDiskCustomModels(),_m=_d.find(_x=>(_x.displayName||_x.name)===t||_x.name===t||(_x.displayName||_x.name)===_base);if(_m)return{modelId:326,apiProvider:1,chatModelName:_eff?((_m.displayName||_m.name)+" ("+U5n[_eff]+")"):(_m.displayName||_m.name),modelName:_m.externalModelName||_m.name,maxTokens:(_m.maxTokens&&_m.maxTokens>64000?_m.maxTokens:1048576),effort:_eff,modelFeatures:{zeroShotCapable:!0,supportsImages:!0,supportsToolCalls:!0,supportsThinking:_m.supportsThinking!==!1}}}catch(_e){}return void 0}`;

    if (wbCode.includes(vqoTarget)) {
      wbCode = wbCode.replace(vqoTarget, vqoReplacement);
      console.log('   OK - workbench (VQo/kQo) patched for native Custom group dynamic loading');
    } else if (wbCode.includes('_getDiskCustomModels')) {
      console.log('   OK - workbench (VQo/kQo) already patched');
    }

    // D. Patch TOu
    const touTarget = 'TOu=({model:t,onEdit:e})=>{let{setSelectedModel:i,selectedModel:n}=eXe(),r=n?.label===t.label,s=t.disabled??!1,o=Ya(),a=!s&&!!e;return E("div",{className:"group relative",children:[E(bs.Item,{selected:r,disabled:s,className:a?"pr-8":void 0,onClick:()=>{s||i(t)},children:E("span",{className:yi("flex items-center gap-1.5 min-w-0",s?"text-muted-foreground":""),children:[E("span",{className:"truncate text-xs text-left",children:t.label}),E(s5n,{option:t})]})}),a&&E(Ii,{children:[E("button",{type:"button",tabIndex:-1,"data-tooltip-id":o,"aria-label":"Edit Model",className:"absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center rounded p-1 opacity-0 transition-opacity hover:bg-secondary group-hover:opacity-100",onClick:l=>{l.stopPropagation(),e?.(t)},children:E($e,{name:"edit",size:12})}),E(Sr,{id:o,children:"Edit Model"})]})]})}';
    const touReplacement = 'TOu=({model:t,onEdit:e})=>{let{setSelectedModel:i,selectedModel:n}=eXe(),s=t.disabled??!1,o=Ya(),a=!s&&!!e;let _q=COu(n?.label||""),_isSel=n?.label===t.label||_q?.base===t.label;let _currEffort=_q?.base===t.label?_q.effort:"medium";let _efforts=["low","medium","high"];let _setEffort=eff=>{i({...t,label:t.label+" ("+U5n[eff]+")",effort:eff})};let _main=E(bs.SubmenuRoot,{children:[E(bs.SubmenuTrigger,{selected:_isSel,disabled:s,className:a?"pr-8":void 0,onClick:()=>{_setEffort(_currEffort)},children:[E("span",{className:yi("flex items-center gap-1.5 min-w-0",s?"text-muted-foreground":""),children:[E("span",{"data-testid":"model-selector-effort-group","data-model-base":t.label,className:"truncate text-xs text-left",children:[t.label,_isSel&&E("span",{className:"opacity-70",children:[" ",U5n[_currEffort]]})]}),E(s5n,{option:t})]})]}),E(bs.Content,{side:"right",align:"start",className:"min-w-40 p-1",children:E(bs.RadioGroup,{value:_currEffort,onValueChange:_setEffort,children:_efforts.map(eff=>E(bs.RadioItem,{value:eff,children:E("span",{"data-testid":"model-selector-effort-option","data-effort":eff,children:U5n[eff]})},eff))})})]});return E("div",{className:"group relative",children:[_main,a&&E(Ii,{children:[E("button",{type:"button",tabIndex:-1,"data-tooltip-id":o,"aria-label":"Edit Model",className:"absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center rounded p-1 opacity-0 transition-opacity hover:bg-secondary group-hover:opacity-100 z-20",onClick:l=>{l.stopPropagation(),e?.(t)},children:E($e,{name:"edit",size:12})}),E(Sr,{id:o,children:"Edit Model"})]})]})}';
    if (wbCode.includes(touTarget)) {
      wbCode = wbCode.replace(touTarget, touReplacement);
      console.log('   OK - workbench (TOu) patched with reasoning effort submenu');
    } else if (wbCode.includes('model-selector-effort-group')) {
      console.log('   OK - workbench (TOu) already patched');
    }

    // D2. Patch DOu
    const douTarget = 'DOu=({customModels:t,onAddCustomModel:e,onEditCustomModel:i})=>{let{supportsCustomModels:n}=eXe(),r=Ya(),s=Ya();return t.length===0&&!e?null:E("div",{children:[E("div",{className:yi("group flex select-none items-center justify-between gap-1 p-1 pl-2 text-xs font-medium",e&&!n?"cursor-not-allowed":""),children:[E("span",{className:"opacity-50",children:"Custom"}),e&&(n?E(Ii,{children:[E("button",{onClick:e,tabIndex:-1,className:"cursor-pointer rounded-md p-1 opacity-50 hover:bg-secondary hover:opacity-100","data-tooltip-id":r,children:E($e,{name:"add",size:12})}),E(Sr,{id:r,children:"Add Model"})]}):E(Ii,{children:[E("div",{"data-tooltip-id":s,className:"hidden group-hover:block",children:E($e,{name:"warning",size:12,className:"shrink-0 fill-yellow-200 stroke-yellow-800"})}),E(Sr,{id:s,className:"max-w-[250px] whitespace-normal",children:"Custom models are only supported on Linux machines."})]}))]}),E("div",{className:"flex flex-col gap-px",children:t.map(o=>E(TOu,{model:o,onEdit:i},o.label))})]})}'
    const douReplacement = `DOu=({customModels:t,onAddCustomModel:e,onEditCustomModel:i})=>{let{supportsCustomModels:n}=eXe(),r=Ya();let _openAdd=(prov)=>{try{window.__agy_default_provider=(prov||'').toLowerCase()}catch(_){}e?.()};if(t.length===0){return e?E("div",{className:"pt-1 border-t border-border/40 mt-1",children:[E("button",{type:"button",onClick:()=>_openAdd(),className:"w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer",children:[E($e,{name:"add",size:13}),E("span",{children:"Add Custom Model..."})]})]}):null}let _groups={};const _pMap={openrouter:'OpenRouter',openai:'OpenAI',anthropic:'Anthropic',google:'Google',ollama:'Ollama',deepseek:'DeepSeek',groq:'Groq',mistral:'Mistral',cerebras:'Cerebras',kimi:'Kimi',fireworks:'Fireworks',lmstudio:'LM Studio',llamacpp:'llama.cpp',nvidia:'NVIDIA'};for(const _m of t){let _rawP=_m.provider||"Custom";let _p=_pMap[_rawP.toLowerCase()]||(_rawP.charAt(0).toUpperCase()+_rawP.slice(1));if(!_groups[_p])_groups[_p]=[];_groups[_p].push(_m)}let _sections=[];for(const[_prov,_models]of Object.entries(_groups)){_sections.push(E("div",{key:_prov,className:"flex flex-col gap-1 mt-1",children:[E("div",{className:"group flex select-none items-center justify-between gap-1 p-1 pl-2 text-xs font-medium",children:[E("span",{className:"opacity-60 font-semibold tracking-wide",children:_prov}),e&&n&&E(Ii,{children:[E("button",{onClick:()=>_openAdd(_models[0]?.provider||_prov),tabIndex:-1,className:"cursor-pointer rounded-md p-1 opacity-50 hover:bg-secondary hover:opacity-100","data-tooltip-id":r,children:E($e,{name:"add",size:12})}),E(Sr,{id:r,children:"Add "+_prov+" Model"})]})]}),E("div",{className:"flex flex-col gap-px",children:_models.map(o=>E(TOu,{model:o,onEdit:i},o.label))})]}));}return E("div",{children:[..._sections,e&&E("div",{key:"_add_global",className:"pt-1 border-t border-border/40 mt-1.5",children:[E("button",{type:"button",onClick:()=>_openAdd(),className:"w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer",children:[E($e,{name:"add",size:13}),E("span",{children:"Add Custom Model..."})]})]})]})}`;
    if (wbCode.includes(douTarget)) {
      wbCode = wbCode.replace(douTarget, douReplacement);
      console.log('   OK - workbench (DOu) patched with provider grouping & smart [+] actions');
    } else if (wbCode.includes('Add Custom Model...')) {
      console.log('   OK - workbench (DOu) already patched with provider grouping');
    }

    // D3. Patch Aaa
    const aaaStart = 'Aaa=({isOpen:t,operation:e,onClose:i,modelName:n,customModelsState:r,pushCustomModelsUpdate:s,setSelectedModelConfig:o})=>{';
    const aaaEnd = 'disabled:!a||!d||!h,className:"hover:opacity-90 rounded-md flex items-center gap-1 border-none bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed",children:"Save"})]})]})})}';
    const aaaReplacement = `Aaa=({isOpen:t,operation:e,onClose:i,modelName:n,customModelsState:r,pushCustomModelsUpdate:s,setSelectedModelConfig:o})=>{let[prov,setProv]=We("openrouter"),[mId,setMId]=We(""),[disp,setDisp]=We(""),[key,setKey]=We(""),[url,setUrl]=We("https://openrouter.ai/api/v1/chat/completions"),[ctx,setCtx]=We(128000),[out,setOut]=We(8192),[popModels,setPopModels]=We([]),[hasKey,setHasKey]=We(!1),[isCustomId,setIsCustomId]=We(!1),[testStatus,setTestStatus]=We(null),[isSaving,setIsSaving]=We(!1),[isTesting,setIsTesting]=We(!1),{logEvent:A}=pc();const defUrls={openrouter:'https://openrouter.ai/api/v1/chat/completions',openai:'https://api.openai.com/v1/chat/completions',deepseek:'https://api.deepseek.com/chat/completions',ollama:'http://localhost:11434/v1/chat/completions',anthropic:'https://api.anthropic.com/v1/messages',groq:'https://api.groq.com/openai/v1/chat/completions',mistral:'https://api.mistral.ai/v1/chat/completions',cerebras:'https://api.cerebras.ai/v1/chat/completions',custom:''};const fmtTok=x=>x>=1e6?(x/1e6).toFixed(x%1e6===0?0:1)+'M tokens':x>=1e3?Math.round(x/1e3)+'k tokens':x+' tokens';yt(()=>{if(t){setTestStatus(null);setIsSaving(!1);setIsTesting(!1);if(e==='edit'&&n){let baseLabel=(n||'').replace(/\\s*\\((low|medium|high|default).*?\\)$/i,'').trim();let found=(_cachedCustomModels||[]).find(m=>(m.displayName&&m.displayName===baseLabel)||(m.displayName&&m.displayName===n)||(m.name&&m.name===baseLabel)||(m.name&&m.name===n)||(m.externalModelName&&m.externalModelName===baseLabel));if(!found&&r?.customModels?.[n]){let old=r.customModels[n];found={provider:old.provider||'openrouter',externalModelName:old.modelName,displayName:old.chatModelName||n,apiUrl:old.apiUrl,maxTokens:old.maxTokens,maxOutputTokens:old.maxOutputTokens}}const applyFound=f=>{let _p=(f.provider||'openrouter').toLowerCase();setProv(_p);let mid=f.externalModelName||f.name||'';setMId(mid);setDisp(f.displayName||n);setUrl(f.apiUrl||defUrls[_p]||'');setCtx(f.maxTokens||128000);setOut(f.maxOutputTokens||8192);setKey('');setIsCustomId(!1)};if(found){applyFound(found)}else{fetch('http://127.0.0.1:50999/v1internal/customModels').then(x=>x.json()).then(list=>{if(Array.isArray(list)){let f=list.find(m=>(m.displayName&&m.displayName===baseLabel)||(m.displayName&&m.displayName===n)||(m.name&&m.name===baseLabel));if(f)applyFound(f)}}).catch(()=>{})}}else{let initP=(window.__agy_default_provider||'openrouter').toLowerCase();try{delete window.__agy_default_provider}catch(_){}setProv(initP);setMId('');setDisp('');setKey('');setUrl(defUrls[initP]||'');setCtx(128000);setOut(8192);setIsCustomId(!1)}}},[t,e,n]);yt(()=>{if(t&&prov){fetch('http://127.0.0.1:50999/v1internal/providerModels?provider='+encodeURIComponent(prov)).then(x=>x.json()).then(d=>{let models=d.models||[];setPopModels(models);setHasKey(!!d.hasConfiguredKey);if(mId){let exists=models.some(x=>x.id===mId);setIsCustomId(!exists)}}).catch(()=>{})}},[t,prov]);const onSelectModel=m=>{setMId(m.id);setIsCustomId(!1);if(!disp||disp===mId||popModels.some(p=>p.name===disp||p.id===disp))setDisp(m.name||m.id);if(m.contextWindow||m.maxOutputTokens){setCtx(m.contextWindow||128000);setOut(m.maxOutputTokens||8192)}};const onSelectDropdownChange=val=>{if(val==='__custom__'){setIsCustomId(!0);setMId('')}else if(!val){setMId('')}else{setIsCustomId(!1);let chosen=popModels.find(x=>x.id===val);if(chosen){onSelectModel(chosen)}else{setMId(val)}}};const onModelInput=val=>{setMId(val);fetch('http://127.0.0.1:50999/v1internal/resolveModelSpec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({modelId:val.trim()})}).then(x=>x.json()).then(spec=>{if(spec&&spec.contextWindow){setCtx(spec.contextWindow);setOut(spec.maxOutputTokens)}}).catch(()=>{})};const onTest=()=>{setIsTesting(!0);setTestStatus({type:'loading',text:'Testando conexão...'});fetch('http://127.0.0.1:50999/v1internal/testConnection',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:prov,apiKey:key.trim(),apiUrl:url.trim()})}).then(x=>x.json()).then(res=>{setIsTesting(!1);setTestStatus(res.success?{type:'success',text:'✓ '+(res.message||'Conectado!')}:{type:'error',text:'✕ '+(res.error||'Falha na conexão.')})}).catch(err=>{setIsTesting(!1);setTestStatus({type:'error',text:'✕ Erro: '+err.message})})};const onDelete=()=>{if(e==='edit'&&n){fetch('http://127.0.0.1:50999/v1internal/deleteCustomModel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({modelName:n})}).catch(()=>{});try{if(typeof _cachedCustomModels!=='undefined'){_cachedCustomModels=_cachedCustomModels.filter(m=>(m.displayName||m.name)!==n&&m.name!==n)}}catch(_){}s({type:'removeCustomModel',label:n});try{window.__agy_onModelsUpdated?.()}catch(_){}try{window._fetchCustomModelsAsync?.()}catch(_){}i();A(Ts.CASCADE_CUSTOM_MODEL_EVENT,go({extra:{action:'delete',model_name:n}},'static action and user-provided model label'))}};const onSave=()=>{let mTrim=mId.trim();if(!mTrim)return;let dTrim=disp.trim()||mTrim;setIsSaving(!0);let rawSlug=(mTrim.startsWith('models/')?mTrim.slice(7):mTrim).replace(/[^a-zA-Z0-9_-]+/g,'-').toLowerCase();let modelObj={name:'models/'+rawSlug,displayName:dTrim,provider:prov,apiKey:key.trim(),apiUrl:url.trim(),externalModelName:mTrim,maxTokens:ctx,maxOutputTokens:out,supportsThinking:!0,oldLabel:e==='edit'&&n?n:void 0};fetch('http://127.0.0.1:50999/v1internal/saveCustomModel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(modelObj)}).then(x=>x.json()).then(res=>{setIsSaving(!1);if(res.success){try{if(typeof _cachedCustomModels!=='undefined'){let fIdx=_cachedCustomModels.findIndex(m=>(e==='edit'&&n&&((m.displayName||m.name)===n||m.name===n))||(m.displayName||m.name)===dTrim||m.name===modelObj.name||m.externalModelName===mTrim);if(fIdx>=0){_cachedCustomModels[fIdx]={..._cachedCustomModels[fIdx],...modelObj}}else{_cachedCustomModels.push(modelObj)}}}catch(_){}let k=Ut(ELo,{zeroShotCapable:!0,supportsImages:!0,supportsToolCalls:!0,supportsThinking:!0});let M=Ut(yLo,{modelId:aA.GOOGLE_GEMINI_INTERNAL_BYOM,apiProvider:lJt.API_PROVIDER_GOOGLE_EVERGREEN,chatModelName:dTrim,modelName:mTrim,maxTokens:ctx,modelFeatures:k});M.provider=prov;s(e==='edit'&&n?{type:'editCustomModel',oldLabel:n,label:dTrim,modelInfo:M}:{type:'addCustomModel',label:dTrim,modelInfo:M});let B={label:dTrim,value:aA.GOOGLE_GEMINI_INTERNAL_BYOM,isCustom:!0,customModelUrl:mTrim,disabled:!1};o(B);try{window.__agy_onModelsUpdated?.()}catch(_){}try{window._fetchCustomModelsAsync?.()}catch(_){}A(Ts.CASCADE_CUSTOM_MODEL_EVENT,go({extra:{action:e,model_name:dTrim}},'static action and user-provided model label'));i()}else{setTestStatus({type:'error',text:'✕ Erro ao salvar: '+(res.error||'Desconhecido')})}}).catch(err=>{setIsSaving(!1);setTestStatus({type:'error',text:'✕ Erro de conexão: '+err.message})})};if(!t)return null;let topPills=popModels.filter(x=>x.isPopular).slice(0,5);if(topPills.length===0)topPills=popModels.slice(0,4);return E(z0,{isOpen:t,onClose:i,onSubmit:onSave,title:e==='add'?'Adicionar Modelo Customizado (BYOK)':'Editar Modelo Customizado',className:'w-[90vw] max-w-[540px] rounded-md',children:E('div',{className:'flex w-full flex-col gap-3 py-1',children:[E('div',{className:'flex flex-col gap-1',children:[E('label',{className:'text-xs font-medium text-muted-foreground',children:'Provedor'}),E('select',{value:prov,onChange:k=>{let p=k.target.value;setProv(p);setUrl(defUrls[p]||'')},className:'w-full rounded-md border border-input bg-input-background p-2 text-foreground text-xs outline-none cursor-pointer',children:[E('option',{value:'openrouter',children:'OpenRouter'}),E('option',{value:'deepseek',children:'DeepSeek'}),E('option',{value:'openai',children:'OpenAI'}),E('option',{value:'ollama',children:'Ollama (Local)'}),E('option',{value:'groq',children:'Groq'}),E('option',{value:'mistral',children:'Mistral'}),E('option',{value:'cerebras',children:'Cerebras'}),E('option',{value:'anthropic',children:'Anthropic'}),E('option',{value:'custom',children:'Custom / OpenAI-Compatible'})]})]}),topPills.length>0&&E('div',{className:'flex flex-col gap-1',children:[E('label',{className:'text-xs font-medium text-muted-foreground',children:'⭐ Modelos Populares'}),E('div',{className:'flex flex-wrap gap-1.5',children:topPills.map(p=>E('button',{type:'button',key:p.id,onClick:()=>onSelectModel(p),className:'rounded border '+(mId===p.id&&!isCustomId?'border-primary bg-primary/20 text-primary font-medium':'border-border/60 bg-secondary/50 hover:bg-secondary text-foreground')+' px-2 py-1 text-[11px] transition-colors cursor-pointer',children:p.name||p.id}))})]}),E('div',{className:'flex flex-col gap-1',children:[E('label',{className:'text-xs font-medium text-muted-foreground',children:['Modelo ',E('span',{className:'text-destructive',children:'*'})]}),E('select',{value:isCustomId?'__custom__':mId,onChange:k=>onSelectDropdownChange(k.target.value),className:'w-full rounded-md border border-input bg-input-background p-2 text-foreground text-xs outline-none cursor-pointer',children:[E('option',{value:'',disabled:!0,children:popModels.length>0?'-- Selecione um modelo do provedor --':'-- Carregando modelos... --'},'_ph'),...popModels.map(x=>E('option',{value:x.id,children:(x.name&&x.name!==x.id?x.name+' ('+x.id+')':x.id)+(x.contextWindow?' ['+fmtTok(x.contextWindow)+']':'')},x.id)),E('option',{value:'__custom__',children:'➕ Outro (digitar ID manualmente...)'},'_custom')]}),(isCustomId||prov==='custom'||popModels.length===0)&&E('div',{className:'flex flex-col gap-1 mt-1',children:[E('input',{type:'text',value:mId,onChange:k=>onModelInput(k.target.value),placeholder:'ex: google/gemini-2.5-flash ou deepseek/deepseek-chat',className:'w-full rounded-md border border-input bg-input-background p-2 text-foreground text-xs outline-none'})]})]}),E('div',{className:'flex items-center justify-between rounded-md border border-border/40 bg-secondary/20 p-2 text-xs',children:[E('span',{className:'text-muted-foreground text-[11px]',children:'Limites Detectados:'}),E('div',{className:'flex gap-2',children:[E('span',{className:'rounded border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[11px] font-mono text-blue-400',children:['🌐 Contexto: ',fmtTok(ctx)]}),E('span',{className:'rounded border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[11px] font-mono text-green-400',children:['📤 Saída: ',fmtTok(out)]})]})]}),E('div',{className:'flex flex-col gap-1',children:[E('label',{className:'text-xs font-medium text-muted-foreground',children:'Nome de Exibição (Opcional)'}),E('input',{type:'text',value:disp,onChange:k=>setDisp(k.target.value),placeholder:'ex: Gemini 2.5 Flash (OpenRouter)',className:'w-full rounded-md border border-input bg-input-background p-2 text-foreground text-xs outline-none'})]}),prov!=='ollama'&&E('div',{className:'flex flex-col gap-1',children:[E('label',{className:'text-xs font-medium text-muted-foreground',children:'API Key'}),E('input',{type:'password',value:key,onChange:k=>setKey(k.target.value),placeholder:hasKey?'(Chave mestre já configurada - deixe em branco para manter)':'sk-...',className:'w-full rounded-md border border-input bg-input-background p-2 text-foreground text-xs outline-none'})]}),E('div',{className:'flex flex-col gap-1',children:[E('label',{className:'text-xs font-medium text-muted-foreground',children:'Endpoint URL'}),E('input',{type:'text',value:url,onChange:k=>setUrl(k.target.value),placeholder:defUrls[prov]||'',className:'w-full rounded-md border border-input bg-input-background p-2 text-foreground text-xs outline-none'})]}),testStatus&&E('div',{className:testStatus.type==='success'?'rounded p-2 text-xs bg-green-500/15 text-green-400 border border-green-500/30':testStatus.type==='error'?'rounded p-2 text-xs bg-red-500/15 text-red-400 border border-red-500/30':'rounded p-2 text-xs bg-secondary text-muted-foreground',children:testStatus.text}),E('div',{className:'flex w-full items-center justify-between pt-2 border-t border-border/40 mt-1',children:[E('button',{type:'button',onClick:onTest,disabled:isTesting,className:'rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer',children:isTesting?'Testando...':'Testar Conexão'}),E('div',{className:'flex items-center gap-2',children:[E(mn,{variant:'ghost',onClick:i,children:'Cancelar'}),e==='edit'&&E(mn,{variant:'destructive',onClick:onDelete,children:'Excluir'}),E('button',{type:'button',onClick:onSave,disabled:!mId.trim()||isSaving,className:'rounded bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity',children:isSaving?'Salvando...':'Salvar Modelo'})]})]})]})})}`;
    if (wbCode.includes(aaaStart) && wbCode.includes(aaaEnd)) {
      const sIdx = wbCode.indexOf(aaaStart);
      const eIdx = wbCode.indexOf(aaaEnd, sIdx);
      if (sIdx !== -1 && eIdx !== -1) {
        wbCode = wbCode.substring(0, sIdx) + aaaReplacement + wbCode.substring(eIdx + aaaEnd.length);
        console.log('   OK - workbench (Aaa) replaced with BYOK native dialog');
      }
    } else if (wbCode.includes('Adicionar Modelo Customizado (BYOK)')) {
      console.log('   OK - workbench (Aaa) already patched with BYOK native dialog');
    }

    // E. Live disk sync (Ouu)
    const ouuTarget = 'let[l,d]=We(null),u=Re(()=>{let _=VQo(a);for(let A of _)A.disabled=!r;return _},[a,r])';
    const ouuReplacement = 'let[l,d]=We(null),[_dv,_sdv]=We(0);yt(()=>{window.__agy_onModelsUpdated=()=>_sdv(v=>v+1);const _iv=setInterval(()=>{_fetchCustomModelsAsync(()=>{_sdv(v=>v+1)})},3000);return ()=>{clearInterval(_iv);delete window.__agy_onModelsUpdated}},[]);let u=Re(()=>{let _=VQo(a);for(let A of _)A.disabled=!r;return _},[a,r,_dv])';
    if (wbCode.includes(ouuTarget)) {
      wbCode = wbCode.replace(ouuTarget, ouuReplacement);
      console.log('   OK - workbench (Ouu) patched with live disk auto-sync');
    } else if (wbCode.includes('_sdv')) {
      console.log('   OK - workbench (Ouu) already patched');
    }

    // F. POu & BOu
    const pouTarget = 'POu=()=>E("div",{"data-testid":"model-selector-panel",className:"flex flex-col max-h-80 overflow-hidden outline-none"';
    const pouOldNoHidden = 'POu=()=>E("div",{"data-testid":"model-selector-panel",className:"flex flex-col max-h-[min(540px,75vh)] outline-none"';
    const pouReplacement = 'POu=()=>E("div",{"data-testid":"model-selector-panel",className:"flex flex-col max-h-[min(540px,75vh)] overflow-hidden outline-none"';
    if (wbCode.includes(pouTarget)) {
      wbCode = wbCode.replace(pouTarget, pouReplacement);
      console.log('   OK - workbench (POu panel responsive max-h) patched');
    } else if (wbCode.includes(pouOldNoHidden)) {
      wbCode = wbCode.replace(pouOldNoHidden, pouReplacement);
      console.log('   OK - workbench (POu panel restored overflow-hidden) patched');
    } else if (wbCode.includes('max-h-[min(540px,75vh)] overflow-hidden outline-none')) {
      console.log('   OK - workbench (POu panel responsive max-h) already patched');
    }

    const bouScrollTarget = 'className:"flex flex-col flex-grow min-h-0 pt-0 overflow-y-auto overscroll-y-none pb-1 gap-px scrollbar-none"';
    const bouScrollReplacement = 'className:"flex flex-col flex-grow min-h-0 pt-0 overflow-y-auto overscroll-y-none pb-1 gap-px custom-scrollbar pr-1"';
    if (wbCode.includes(bouScrollTarget)) {
      wbCode = wbCode.replace(bouScrollTarget, bouScrollReplacement);
      console.log('   OK - workbench (BOu visible custom scrollbar) patched');
    } else if (wbCode.includes('custom-scrollbar pr-1')) {
      console.log('   OK - workbench (BOu visible custom scrollbar) already patched');
    }

    // G. Puu effort lookup
    const puuTarget = 'Puu=(t,e,i)=>{let n=t.find(s=>s.label===i);if(n)return n;let r=e.find(s=>s.label===i);if(r)return r}';
    const puuReplacement = 'Puu=(t,e,i)=>{let _b=COu(i)?.base||i;let n=t.find(s=>s.label===i||s.label===_b);if(n)return n.label===i?n:{...n,label:i};let r=e.find(s=>s.label===i||s.label===_b);if(r)return r.label===i?r:{...r,label:i}}';
    if (wbCode.includes(puuTarget)) {
      wbCode = wbCode.replace(puuTarget, puuReplacement);
      console.log('   OK - workbench (Puu) patched for effort label lookup');
    } else if (wbCode.includes('Puu=(t,e,i)=>{let _b=COu(i)')) {
      console.log('   OK - workbench (Puu) already patched');
    }

    const wqtTarget = 'if(f){let A=b.find(F=>F.label===f);if(A)return A}';
    const wqtReplacement = 'if(f){let _b=COu(f)?.base||f;let A=b.find(F=>F.label===f||F.label===_b);if(A)return A.label===f?A:{...A,label:f}}';
    if (wbCode.includes(wqtTarget)) {
      wbCode = wbCode.replace(wqtTarget, wqtReplacement);
      console.log('   OK - workbench (wqt b.find) patched for effort label selection');
    }

    // H. wqt selection notifier
    const wqtSelectTarget = 'let _=me((A,F=!0)=>{s("selected_model_changed",go({extra:{name:A.label}},"model label from server-controlled set"));let T=A.value===aA.GOOGLE_GEMINI_INTERNAL_BYOM;g(T?A.label:null);let D=Muu(A),V;if(T){let k=kQo(A.label,l);k&&(V=k)}r?.(D,V,F)},[s,r,l]);';
    const wqtSelectReplacement = 'let _=me((A,F=!0)=>{s("selected_model_changed",go({extra:{name:A.label}},"model label from server-controlled set"));let T=A.value===aA.GOOGLE_GEMINI_INTERNAL_BYOM;g(T?A.label:null);let D=Muu(A),V;if(T){let k=kQo(A.label,l);k&&(V=k)}try{fetch("http://127.0.0.1:50999/v1internal/selectModel",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({label:A.label,isCustom:T,override:V,native:!T})}).catch(()=>{})}catch(_e){}r?.(D,V,F)},[s,r,l]);yt(()=>{if(C){let T=C.value===aA.GOOGLE_GEMINI_INTERNAL_BYOM||!!C.isCustom;let V=T?kQo(C.label,l):void 0;try{fetch("http://127.0.0.1:50999/v1internal/selectModel",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({label:C.label,isCustom:T,override:V,native:!T})}).catch(()=>{})}catch(_e){}}},[C,l]);';
    if (wbCode.includes(wqtSelectTarget)) {
      wbCode = wbCode.replace(wqtSelectTarget, wqtSelectReplacement);
      console.log('   OK - workbench (wqt model selection notifier) patched');
    }

    // J. Vqo quota guard
    const vqoQuotaTarget = 'function Vqo(t){return{remainingFraction:t.remaining.case==="remainingFraction"?t.remaining.value:void 0,refreshText:t.description||"",disabled:t.disabled??!1}}';
    const vqoQuotaReplacement = 'function Vqo(t){let _rf=t?.remaining?.case==="remainingFraction"?t.remaining.value:(t?.remainingFraction??t?.remaining?.value);return{remainingFraction:_rf,refreshText:t?.description||"",disabled:t?.disabled??!1}}';
    if (wbCode.includes(vqoQuotaTarget)) {
      wbCode = wbCode.replace(vqoQuotaTarget, vqoQuotaReplacement);
      console.log('   OK - workbench (Vqo safe remainingFraction extraction) patched');
    }

    // J3. MOu View Usage
    const mouTarget = '{userStatus:t}=eXe(),{logEvent:e}=pc(),i=Qr().get("modelQuota")?.enabled===!0';
    const mouReplacement = '{userStatus:t}=eXe(),{logEvent:e}=pc(),i=!0';
    if (wbCode.includes(mouTarget)) {
      wbCode = wbCode.replace(mouTarget, mouReplacement);
      console.log('   OK - workbench (MOu View Usage submenu flyout) enabled');
    }

    const mouTriggerTarget = 'E(bs.SubmenuTrigger,{children:[E($e,{name:"speed"}),E("span",{className:"text-xs flex-1",children:"View Usage"})]})';
    const mouTriggerWithExtraChevron = 'E(bs.SubmenuTrigger,{className:"flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer",children:[E($e,{name:"speed",size:14}),E("span",{className:"text-xs flex-1",children:"View Usage"}),E($e,{name:"chevron_right",size:14,className:"opacity-40 shrink-0 ml-auto"})]})';
    const mouTriggerReplacement = 'E(bs.SubmenuTrigger,{className:"flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer",children:[E($e,{name:"speed",size:14}),E("span",{className:"text-xs flex-1",children:"View Usage"})]})';
    if (wbCode.includes(mouTriggerWithExtraChevron)) {
      wbCode = wbCode.replace(mouTriggerWithExtraChevron, mouTriggerReplacement);
    } else if (wbCode.includes(mouTriggerTarget)) {
      wbCode = wbCode.replace(mouTriggerTarget, mouTriggerReplacement);
    }

    // J4. Rca Parallel Quota Fetcher
    const rcaFullTarget = 'function Rca(t,e){if(!e||!t?.retrieveUserQuotaSummary)return Promise.resolve(hN.cachedQuotaGroups||[]);e!==hN.cachedOauthToken&&(hN.cachedOauthToken=e,hN.cachedQuotaGroups=void 0,hN.lastRefreshTimestampMs=0);let i=Date.now();return i-hN.lastRefreshTimestampMs>vOu||!hN.cachedQuotaGroups?(hN.activeQuotaFetchPromise||(hN.lastRefreshTimestampMs=i,hN.activeQuotaFetchPromise=t.retrieveUserQuotaSummary(e,!0).then(n=>{let r=n.response?.groups||[];return hN.cachedQuotaGroups=r,r}).catch(()=>hN.cachedQuotaGroups||[]).finally(()=>{hN.activeQuotaFetchPromise=void 0})),hN.activeQuotaFetchPromise):Promise.resolve(hN.cachedQuotaGroups)}';
    const rcaFullReplacement = 'function Rca(t,e){let i=Date.now();if(e!==hN.cachedOauthToken){hN.cachedOauthToken=e,hN.cachedQuotaGroups=void 0,hN.lastRefreshTimestampMs=0}if(i-hN.lastRefreshTimestampMs>vOu||!hN.cachedQuotaGroups){if(!hN.activeQuotaFetchPromise){hN.lastRefreshTimestampMs=i;let _gFetch=(t?.retrieveUserQuotaSummary)?t.retrieveUserQuotaSummary(e,!0).then(n=>n.response?.groups||n.groups||[]).catch(()=>[]):Promise.resolve([]);let _bFetch=fetch("http://127.0.0.1:50999/v1internal/quotaSummary").then(x=>x.json()).then(d=>d.groups||[]).catch(()=>[]);hN.activeQuotaFetchPromise=Promise.all([_gFetch,_bFetch]).then(([gGroups,bGroups])=>{let merged=(gGroups||[]).slice();for(let b of(bGroups||[])){if(!merged.some(m=>m.displayName===b.displayName))merged.push(b)}return hN.cachedQuotaGroups=merged,merged}).catch(()=>hN.cachedQuotaGroups||[]).finally(()=>{hN.activeQuotaFetchPromise=void 0})}return hN.activeQuotaFetchPromise}return Promise.resolve(hN.cachedQuotaGroups||[])}';
    if (wbCode.includes(rcaFullTarget)) {
      wbCode = wbCode.replace(rcaFullTarget, rcaFullReplacement);
      console.log('   OK - workbench (Rca Quota parallel Google+BYOK fetcher) patched');
    }

    // J5. i1u Models & Usage dialog
    const i1uQuotaTarget = 's.retrieveUserQuotaSummary?.(n,B)?.then(P=>{b(P.response?.groups||[]),C(P.response?.description)}).catch(P=>{e(po.USER_QUOTA_FETCH_FAILED,P)})';
    const i1uQuotaReplacement = 's.retrieveUserQuotaSummary?.(n,B)?.then(async P=>{let _g=P.response?.groups||[];try{const _bq=await fetch("http://127.0.0.1:50999/v1internal/quotaSummary").then(x=>x.json()).catch(()=>null);if(_bq?.groups?.length)_g=_g.concat(_bq.groups)}catch(_){}b(_g),C(P.response?.description)}).catch(async P=>{try{const _bq=await fetch("http://127.0.0.1:50999/v1internal/quotaSummary").then(x=>x.json()).catch(()=>null);if(_bq?.groups?.length){b(_bq.groups);return}}catch(_){}e(po.USER_QUOTA_FETCH_FAILED,P)})';
    if (wbCode.includes(i1uQuotaTarget)) {
      wbCode = wbCode.replace(i1uQuotaTarget, i1uQuotaReplacement);
      console.log('   OK - workbench (i1u Models & Usage Quota) patched');
    }
  }

  // K. Inject modalCode.js
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
  }

  fs.writeFileSync(wbPath, wbCode, 'utf8');
}

// 1b. Patch workbench.desktop.main.css
if (fs.existsSync(wbCssPath)) {
  let cssCode = fs.readFileSync(wbCssPath, 'utf8');

  // Clean up any old scrollbar and cascade bar blocks to avoid duplicate injections
  const scrollbarBlockRegex = /\/\* === AGY_SCROLLBAR_CSS_START ===[\s\S]*?\/\* === AGY_SCROLLBAR_CSS_END === \*\/|\/\* Antigravity BYOK Model Menu[\s\S]*?(?=(\/\* Antigravity Enhanced Cascade Bar|\/\* ===|$))/g;
  cssCode = cssCode.replace(scrollbarBlockRegex, '');
  const orphanedPanelRegex = /\[data-testid="model-selector-panel"\]\s*(?=\/\*|$)/g;
  cssCode = cssCode.replace(orphanedPanelRegex, '');
  const cascadeBlockRegex = /\/\* Antigravity Enhanced Cascade Bar[\s\S]*?$/;
  cssCode = cssCode.replace(cascadeBlockRegex, '');
  cssCode = cssCode.trimEnd();

  const scrollbarCss = `
/* === AGY_SCROLLBAR_CSS_START === */
/* Antigravity BYOK Model Menu & Modal Clean Scrollbar */
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
[data-testid="model-selector-panel"] > div,
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
[data-testid="model-selector-panel"] > div::-webkit-scrollbar,
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
/* === AGY_SCROLLBAR_CSS_END === */

/* Antigravity Enhanced Cascade Bar & File Nav Controls */
.cascade-bar {
  z-index: 100 !important;
}
.cascade-bar .bar-mode {
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.5) !important;
  border: 1px solid var(--vscode-commandCenter-activeBorder, rgba(255, 255, 255, 0.2)) !important;
  background-color: var(--vscode-quickInput-background, #1f1f23) !important;
  border-radius: 8px !important;
  padding: 4px 8px !important;
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
}
.cascade-bar .file-with-diff .resolve-changes {
  gap: 8px !important;
  padding: 2px 8px 2px 2px !important;
  border-right: 1px solid var(--vscode-commandCenter-activeBorder, rgba(255, 255, 255, 0.15)) !important;
  display: flex !important;
  align-items: center !important;
}
.cascade-bar .file-with-diff .resolve-changes button.keep-changes {
  padding: 5px 14px !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  border-radius: 5px !important;
  background-color: #059669 !important;
  color: #ffffff !important;
  display: flex !important;
  align-items: center !important;
  gap: 6px !important;
  cursor: pointer !important;
  border: none !important;
  transition: background-color 0.15s ease !important;
}
.cascade-bar .file-with-diff .resolve-changes button.keep-changes:hover {
  background-color: #10b981 !important;
}
.cascade-bar .file-with-diff .resolve-changes button.discard-changes {
  padding: 5px 12px !important;
  font-size: 12px !important;
  font-weight: 500 !important;
  border-radius: 5px !important;
  background-color: rgba(239, 68, 68, 0.1) !important;
  border: 1px solid rgba(239, 68, 68, 0.3) !important;
  color: #fca5a5 !important;
  display: flex !important;
  align-items: center !important;
  gap: 6px !important;
  cursor: pointer !important;
  transition: all 0.15s ease !important;
}
.cascade-bar .file-with-diff .resolve-changes button.discard-changes:hover {
  background-color: rgba(239, 68, 68, 0.25) !important;
  color: #ffffff !important;
}
.cascade-bar .file-with-diff .file-nav-section {
  padding: 2px 8px !important;
  gap: 6px !important;
  font-size: 12px !important;
  font-weight: 500 !important;
  border-left: 1px solid var(--vscode-commandCenter-activeBorder, rgba(255, 255, 255, 0.15)) !important;
  display: flex !important;
  align-items: center !important;
}
.cascade-bar .file-with-diff .file-nav-section.hidden {
  display: flex !important;
}
.cascade-bar .file-with-diff button:is(.prev-file,.next-file) {
  padding: 4px 6px !important;
  border-radius: 4px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  cursor: pointer !important;
  background-color: rgba(255, 255, 255, 0.06) !important;
  color: var(--vscode-foreground) !important;
}
.cascade-bar .file-with-diff button:is(.prev-file,.next-file):hover {
  background-color: rgba(255, 255, 255, 0.15) !important;
}
.cascade-bar .file-with-diff .hunk-nav {
  padding: 2px 6px !important;
  gap: 4px !important;
  display: flex !important;
  align-items: center !important;
}
.cascade-bar .file-with-diff .hunk-nav button:is(.previous-hunk,.next-hunk) {
  padding: 4px 6px !important;
  border-radius: 4px !important;
  cursor: pointer !important;
  background-color: rgba(255, 255, 255, 0.06) !important;
  color: var(--vscode-foreground) !important;
}
.cascade-bar .file-with-diff .hunk-nav button:is(.previous-hunk,.next-hunk):hover {
  background-color: rgba(255, 255, 255, 0.15) !important;
}
.cascade-bar .bar-mode .shortcut {
  font-size: 10px !important;
  padding: 1px 5px !important;
  background: rgba(255, 255, 255, 0.12) !important;
  border-radius: 3px !important;
  opacity: 0.8 !important;
  margin-left: 4px !important;
}
`;
  cssCode += scrollbarCss;
  fs.writeFileSync(wbCssPath, cssCode, 'utf8');
  console.log('   OK - workbench.desktop.main.css (custom-scrollbar & enhanced cascade bar styles) updated');
}

// 1c. Patch out/jetskiAgent/main.js (Antigravity v2.6.0+ dedicated agent panel bundle)
if (fs.existsSync(jetskiAgentPath)) {
  console.log('[Patch-IDE] Detected Jetski Agent bundle: v2.6.0+ dedicated agent panel');
  let jsCode = fs.readFileSync(jetskiAgentPath, 'utf8');

  // A. Redux initial state unlocked
  const azrTarget = 'azr={supported:!1,customModels:{}}';
  const azrReplacement = 'azr={supported:!0,customModels:{}}';
  if (jsCode.includes(azrTarget)) {
    jsCode = jsCode.replace(azrTarget, azrReplacement);
    console.log('   OK - jetskiAgent (azr initial state) unlocked (supported=true)');
  } else if (jsCode.includes('azr={supported:!0')) {
    console.log('   OK - jetskiAgent (azr initial state) already unlocked');
  }

  // B. Effort formatting and custom model effort parsing
  const bteTarget = 'bte={low:"Low",medium:"Medium",high:"High",xhigh:"Extra",max:"Max"}';
  const bteReplacement = 'bte={default:"Default",low:"Low",medium:"Medium",high:"High",xhigh:"Extra",max:"Max"}';
  if (jsCode.includes(bteTarget)) {
    jsCode = jsCode.replace(bteTarget, bteReplacement);
    console.log('   OK - jetskiAgent (bte) effort dictionary patched with Default');
  } else if (jsCode.includes('default:"Default",low:"Low"')) {
    console.log('   OK - jetskiAgent (bte) already contains Default');
  }

  const byTarget = 'bY=e=>{if(!e.isCustom)return Tqa.get(e.value)??_qa(e.label)}';
  const byReplacement = 'bY=e=>{let _eff=_qa(e.label);if(_eff)return _eff;if(!e.isCustom)return Tqa.get(e.value);return{base:e.label,effort:"medium"}}';
  if (jsCode.includes(byTarget)) {
    jsCode = jsCode.replace(byTarget, byReplacement);
    console.log('   OK - jetskiAgent (bY) custom models effort parsing patched');
  } else if (jsCode.includes('return{base:e.label,effort:"medium"}}')) {
    console.log('   OK - jetskiAgent (bY) already patched');
  }

  // C. Dynamic loading of custom models from disk & live update sync
  const lzrTarget = ',lzr=e=>e?.customModels?Object.entries(e.customModels).map(([t,r])=>({label:t,value:r.modelId,isCustom:!0,customModelUrl:r.modelName})):[],$at=(e,t)=>{if(t?.customModels)return t.customModels[e]}';
  const lzrReplacement = `;var _cachedCustomModels=${customModelsJsonLiteral},_lastCustomFetch=0,_fetchingCustomModels=!1;var _fetchCustomModelsAsync=cb=>{if(_fetchingCustomModels)return;_fetchingCustomModels=!0;try{fetch("http://127.0.0.1:50999/v1internal/customModels").then(r=>r.json()).then(d=>{const _l=Array.isArray(d)?d:(d.models||[]);if(_l&&_l.length){const _old=JSON.stringify(_cachedCustomModels);const _new=JSON.stringify(_l);_cachedCustomModels=_l;if(_old!==_new){cb?.();try{window.__agy_onModelsUpdated?.()}catch(_){}}}}).catch(()=>{}).finally(()=>{_fetchingCustomModels=!1})}catch(_e){_fetchingCustomModels=!1}};try{window._fetchCustomModelsAsync=_fetchCustomModelsAsync}catch(_e){}try{_fetchCustomModelsAsync()}catch(_e){}var _getDiskCustomModels=()=>{const _now=Date.now();if(!_cachedCustomModels||_cachedCustomModels.length===0||_now-_lastCustomFetch>2500){_lastCustomFetch=_now;_fetchCustomModelsAsync()}return _cachedCustomModels||[]};var lzr=e=>{let _r=[],_d=_getDiskCustomModels();for(const _m of _d){const _lbl=_m.displayName||_m.name;if(_lbl)_r.push({label:_lbl,value:326,isCustom:!0,customModelUrl:_m.externalModelName||_m.name||_lbl,supportsThinking:_m.supportsThinking!==!1,provider:_m.provider||'Custom'})}if(e?.customModels){for(const[t,r]of Object.entries(e.customModels)){if(!_r.some(_x=>_x.label===t)){let matched=_d.find(x=>(x.displayName||x.name)===t||x.name===t||x.externalModelName===r.modelName);let prov=matched?.provider||r.provider||'Custom';_r.push({label:t,value:r.modelId||326,isCustom:!0,customModelUrl:r.modelName,supportsThinking:!0,provider:prov})}}}return _r},$at=(e,t)=>{if(t?.customModels&&t.customModels[e])return t.customModels[e];try{const _q=_qa(e);const _base=_q?.base||e;const _eff=_q?.effort;const _d=_getDiskCustomModels(),_m=_d.find(_x=>(_x.displayName||_x.name)===e||_x.name===e||(_x.displayName||_x.name)===_base);if(_m)return{modelId:326,apiProvider:1,chatModelName:_eff?((_m.displayName||_m.name)+" ("+bte[_eff]+")"):(_m.displayName||_m.name),modelName:_m.externalModelName||_m.name,maxTokens:(_m.maxTokens&&_m.maxTokens>64000?_m.maxTokens:1048576),effort:_eff,modelFeatures:{zeroShotCapable:!0,supportsImages:!0,supportsToolCalls:!0,supportsThinking:_m.supportsThinking!==!1}}}catch(_e){}return void 0}`;
  if (jsCode.includes(lzrTarget)) {
    jsCode = jsCode.replace(lzrTarget, lzrReplacement);
    console.log('   OK - jetskiAgent (lzr/$at dynamic disk models & live sync) patched');
  } else if (jsCode.includes('var _cachedCustomModels=')) {
    console.log('   OK - jetskiAgent (lzr/$at) already patched');
  }

  // D. Xqa: Model item with pencil edit button (Standard Rt.Item)
  const xqaTarget = 'Xqa=({model:e,onEdit:t})=>{let{setSelectedModel:r,selectedModel:n}=GB(),i=n?.label===e.label,a=e.disabled??!1,o=Tr(),s=!a&&!!t;return d("div",{className:"group relative",children:[d(Rt.Item,{"data-testid":Aqa,"data-model-label":e.label,selected:i,disabled:a,className:s?"pr-8":void 0,onClick:()=>{a||r(e)},children:d("span",{className:ke("flex items-center gap-1.5 min-w-0",a?"text-muted-foreground":""),children:[d("span",{className:"truncate text-xs text-left",children:e.label}),d(uEt,{option:e})]})}),s&&d(Oe,{children:[d("button",{type:"button",tabIndex:-1,"data-tooltip-id":o,"aria-label":"Edit Model",className:"absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center rounded p-1 opacity-0 transition-opacity hover:bg-secondary group-hover:opacity-100",onClick:l=>{l.stopPropagation(),t?.(e)},children:d(de,{name:"edit",size:12})}),d(Yt,{id:o,children:"Edit Model"})]})]})},';
  const xqaOldEffortTarget = 'Xqa=({model:e,onEdit:t})=>{let{setSelectedModel:r,selectedModel:n}=GB(),a=e.disabled??!1,o=Tr(),s=!a&&!!t;let _q=_qa(n?.label||""),_isSel=n?.label===e.label||_q?.base===e.label;let _currEffort=_q?.base===e.label?_q.effort:"medium";let _efforts=["low","medium","high"];let _setEffort=eff=>{r({...e,label:e.label+" ("+bte[eff]+")",effort:eff})};let _main=d(Rt.SubmenuRoot,{children:[d(Rt.SubmenuTrigger,{selected:_isSel,disabled:a,className:s?"pr-8":void 0,onClick:()=>{_setEffort(_currEffort)},children:[d("span",{className:ke("flex items-center gap-1.5 min-w-0",a?"text-muted-foreground":""),children:[d("span",{"data-testid":"model-selector-effort-group","data-model-base":e.label,className:"truncate text-xs text-left",children:[e.label,_isSel&&d("span",{className:"opacity-70",children:[" ",bte[_currEffort]]})]}),d(uEt,{option:e})]})]}),d(Rt.Content,{side:"right",align:"start",className:"min-w-40 p-1",children:d(Rt.RadioGroup,{value:_currEffort,onValueChange:_setEffort,children:_efforts.map(eff=>d(Rt.RadioItem,{value:eff,children:d("span",{"data-testid":"model-selector-effort-option","data-effort":eff,children:bte[eff]})},eff))})})]});return d("div",{className:"group relative",children:[_main,s&&d(Oe,{children:[d("button",{type:"button",tabIndex:-1,"data-tooltip-id":o,"aria-label":"Edit Model",className:"absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center rounded p-1 opacity-0 transition-opacity hover:bg-secondary group-hover:opacity-100 z-20",onClick:l=>{l.stopPropagation(),t?.(e)},children:d(de,{name:"edit",size:12})}),d(Yt,{id:o,children:"Edit Model"})]})]})},';
  const xqaReplacement = 'Xqa=({model:e,onEdit:t})=>{let{setSelectedModel:r,selectedModel:n}=GB(),i=n?.label===e.label,a=e.disabled??!1,o=Tr(),s=!a;let _handleEdit=l=>{l.stopPropagation();if(t)t(e);else if(typeof window.openAddModelModal==="function")window.openAddModelModal(e?.provider,e?.label||e?.displayName||e?.name)};return d("div",{className:"group relative",children:[d(Rt.Item,{"data-testid":Aqa,"data-model-label":e.label,selected:i,disabled:a,className:"pr-8",onClick:()=>{a||r(e)},children:d("span",{className:ke("flex items-center gap-1.5 min-w-0",a?"text-muted-foreground":""),children:[d("span",{className:"truncate text-xs text-left",children:e.label}),d(uEt,{option:e})]})}),s&&d(Oe,{children:[d("button",{type:"button",tabIndex:-1,"data-tooltip-id":o,"aria-label":"Edit Model",className:"absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center rounded p-1 opacity-0 transition-opacity hover:bg-secondary group-hover:opacity-100 z-20 cursor-pointer",onClick:_handleEdit,children:d(de,{name:"edit",size:12})}),d(Yt,{id:o,children:"Edit Model"})]})]})},';
  if (jsCode.includes(xqaTarget)) {
    jsCode = jsCode.replace(xqaTarget, xqaReplacement);
    console.log('   OK - jetskiAgent (Xqa) patched with native Rt.Item & edit button');
  } else if (jsCode.includes(xqaOldEffortTarget)) {
    jsCode = jsCode.replace(xqaOldEffortTarget, xqaReplacement);
    console.log('   OK - jetskiAgent (Xqa old effort) patched with native Rt.Item & edit button');
  } else if (jsCode.includes('_handleEdit=')) {
    console.log('   OK - jetskiAgent (Xqa) already patched');
  }

  // E. kqa: Custom models list with Provider Grouping and smart [+] buttons
  const kqaTarget = 'kqa=({customModels:e,onAddCustomModel:t,onEditCustomModel:r})=>{let{supportsCustomModels:n}=GB(),i=Tr(),a=Tr();return e.length===0&&!t?null:d("div",{children:[d("div",{className:ke("group flex select-none items-center justify-between gap-1 p-1 pl-2 text-xs font-medium",t&&!n?"cursor-not-allowed":""),children:[d("span",{className:"opacity-50",children:"Custom"}),t&&(n?d(Oe,{children:[d("button",{onClick:t,tabIndex:-1,"data-testid":pqa,className:"cursor-pointer rounded-md p-1 opacity-50 hover:bg-secondary hover:opacity-100","data-tooltip-id":i,children:d(de,{name:"add",size:12})}),d(Yt,{id:i,children:"Add Model"})]}):d(Oe,{children:[d("div",{"data-tooltip-id":a,className:"hidden group-hover:block",children:d(de,{name:"warning",size:12,className:"shrink-0 fill-yellow-200 stroke-yellow-800"})}),d(Yt,{id:a,className:"max-w-[250px] whitespace-normal",children:"Custom models are only supported on Linux machines."})]}))]}),d("div",{className:"flex flex-col gap-px",children:e.map(o=>d(Xqa,{model:o,onEdit:r},o.label))})]})};';
  const kqaTargetAlt = 'kqa=({customModels:e,onAddCustomModel:t,onEditCustomModel:r})=>{let{supportsCustomModels:n}=GB(),i=Tr(),a=Tr();return e.length===0&&!t?null:d("div",{children:[d("div",{className:ke("group flex select-none items-center justify-between gap-1 p-1 pl-2 text-xs font-medium",t&&!n?"cursor-not-allowed":""),children:[d("span",{className:"opacity-50",children:"Custom"}),t&&(n?d(Oe,{children:[d("button",{onClick:t,tabIndex:-1,"data-testid":pqa,className:"cursor-pointer rounded-md p-1 opacity-50 hover:bg-secondary hover:opacity-100","data-tooltip-id":i,children:d(de,{name:"add",size:12})}),d(Yt,{id:i,children:"Add Model"})]}):d(Oe,{children:[d("div",{"data-tooltip-id":a,className:"hidden group-hover:block",children:d(de,{name:"warning",size:12,className:"shrink-0 fill-yellow-200 stroke-yellow-800"})}),d(Yt,{id:a,className:"max-w-[250px] whitespace-normal",children:"Custom models are only supported on Linux machines."})]}))]}),d("div",{className:"flex flex-col gap-px",children:e.map(o=>d(Xqa,{model:o,onEdit:r},o.label))})]})},';
  const kqaReplacement = `kqa=({customModels:e,onAddCustomModel:t,onEditCustomModel:r})=>{let{supportsCustomModels:n}=GB(),i=Tr();let _openAdd=(prov)=>{try{window.__agy_default_provider=(prov||'').toLowerCase()}catch(_){}if(t)t();else if(typeof window.openAddModelModal==='function')window.openAddModelModal(prov)};let _modelsList=(e&&e.length>0)?e:lzr({customModels:{}});if(!_modelsList||_modelsList.length===0){return d("div",{className:"pt-1 border-t border-border/40 mt-1",children:[d("button",{type:"button",onClick:()=>_openAdd(),className:"w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer",children:[d(de,{name:"add",size:13}),d("span",{children:"Add Custom Model..."})]})]})}let _groups={};const _pMap={openrouter:'OpenRouter',openai:'OpenAI',anthropic:'Anthropic',google:'Google',ollama:'Ollama',deepseek:'DeepSeek',groq:'Groq',mistral:'Mistral',cerebras:'Cerebras',kimi:'Kimi',fireworks:'Fireworks',lmstudio:'LM Studio',llamacpp:'llama.cpp',nvidia:'NVIDIA'};for(const _m of _modelsList){let _rawP=_m.provider||"Custom";let _p=_pMap[_rawP.toLowerCase()]||(_rawP.charAt(0).toUpperCase()+_rawP.slice(1));if(!_groups[_p])_groups[_p]=[];_groups[_p].push(_m)}let _sections=[];for(const[_prov,_items]of Object.entries(_groups)){_sections.push(d("div",{key:_prov,className:"flex flex-col gap-1 mt-1",children:[d("div",{className:"group flex select-none items-center justify-between gap-1 p-1 pl-2 text-xs font-medium",children:[d("span",{className:"opacity-60 font-semibold tracking-wide",children:_prov}),d(Oe,{children:[d("button",{onClick:()=>_openAdd(_items[0]?.provider||_prov),type:"button",tabIndex:-1,className:"cursor-pointer rounded-md p-1 opacity-50 hover:bg-secondary hover:opacity-100","data-tooltip-id":i,children:d(de,{name:"add",size:12})}),d(Yt,{id:i,children:"Add "+_prov+" Model"})]})]}),d("div",{className:"flex flex-col gap-px",children:_items.map(o=>d(Xqa,{model:o,onEdit:r},o.label))})]}));}return d("div",{children:[..._sections,d("div",{key:"_add_global",className:"pt-1 border-t border-border/40 mt-1.5",children:[d("button",{type:"button",onClick:()=>_openAdd(),className:"w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer",children:[d(de,{name:"add",size:13}),d("span",{children:"Add Custom Model..."})]})]})]})};`;
  if (jsCode.includes(kqaTarget)) {
    jsCode = jsCode.replace(kqaTarget, kqaReplacement);
    console.log('   OK - jetskiAgent (kqa) patched with provider grouping & [+] actions');
  } else if (jsCode.includes(kqaTargetAlt)) {
    jsCode = jsCode.replace(kqaTargetAlt, kqaReplacement);
    console.log('   OK - jetskiAgent (kqa alt) patched with provider grouping & [+] actions');
  } else if (jsCode.includes('kqa=({customModels:e,onAddCustomModel:t,onEditCustomModel:r})=>{')) {
    const kqaStart = jsCode.indexOf('kqa=({customModels:e,onAddCustomModel:t,onEditCustomModel:r})=>{');
    if (kqaStart !== -1) {
      const kqaEnd = jsCode.indexOf(';Wqa=', kqaStart);
      if (kqaEnd !== -1) {
        jsCode = jsCode.substring(0, kqaStart) + kqaReplacement + jsCode.substring(kqaEnd);
        console.log('   OK - jetskiAgent (kqa) refreshed with latest provider grouping & [+] actions');
      }
    }
  }

  // E2. Gqa: Primary Model Dropdown Context Provider
  const gqaTarget = 'return d(Ipn.Provider,{value:{...e,setSelectedModel:t,customModels:e.customModels??[],supportsCustomModels:e.supportsCustomModels??!1,showCustomModelHeader:e.showCustomModelHeader??!1,isModelListLoading:e.isModelListLoading??!1,groups:s,effortIndex:o,bestOfNConfig:n},children:[r&&d(wqa,{open:e.open}),e.children]})}';
  const gqaReplacement = 'let _liveCust=(e.customModels&&e.customModels.length>0)?e.customModels:lzr({customModels:{}});let _openAdd=(prov)=>{try{window.__agy_default_provider=(prov||"").toLowerCase()}catch(_){}if(e.onAddCustomModel)e.onAddCustomModel();else if(typeof window.openAddModelModal==="function")window.openAddModelModal(prov);else if(typeof window.__agy_openModal==="function")window.__agy_openModal(prov)};let _openEdit=(mod)=>{if(e.onEditCustomModel)e.onEditCustomModel(mod);else if(typeof window.openAddModelModal==="function")window.openAddModelModal(mod?.provider,mod?.label||mod?.displayName||mod?.name)};return d(Ipn.Provider,{value:{...e,setSelectedModel:t,customModels:_liveCust,supportsCustomModels:!0,showCustomModelHeader:!0,onAddCustomModel:_openAdd,onEditCustomModel:_openEdit,isModelListLoading:e.isModelListLoading??!1,groups:s,effortIndex:o,bestOfNConfig:n},children:[r&&d(wqa,{open:e.open}),e.children]})}';
  if (jsCode.includes(gqaTarget)) {
    jsCode = jsCode.replace(gqaTarget, gqaReplacement);
    console.log('   OK - jetskiAgent (Gqa model dropdown context provider) patched');
  } else if (jsCode.includes('customModels:_liveCust,supportsCustomModels:!0')) {
    console.log('   OK - jetskiAgent (Gqa) already patched');
  }

  // E3. Qqa: Unconditional Custom Models List rendering
  const qqaCondTarget = 'a&&d(kqa,{customModels:r,onAddCustomModel:n,onEditCustomModel:i})';
  const qqaCondReplacement = 'd(kqa,{customModels:r,onAddCustomModel:n,onEditCustomModel:i})';
  if (jsCode.includes(qqaCondTarget)) {
    jsCode = jsCode.replace(qqaCondTarget, qqaCondReplacement);
    console.log('   OK - jetskiAgent (Qqa) un-gated custom models dropdown list');
  } else if (!jsCode.includes(qqaCondTarget) && jsCode.includes(qqaCondReplacement)) {
    console.log('   OK - jetskiAgent (Qqa) already un-gated');
  }

  // F. qqa: Main chat model selector unlock and proxy notification
  const qqaEndTarget = 'w=O(()=>{F(!1),T(void 0)},[]),{isGoogleInternal:G}=lo().product;return d("div",{className:`min-w-0 ${dte}`,children:[d(Tpn,{placement:e,selectedModel:m,setSelectedModel:p,modelSorts:h,modelOptions:f,userStatus:E,refreshModels:async()=>{N.refreshUserStatus()},open:C,setIsOpen:S,customModels:s,supportsCustomModels:l,showCustomModelHeader:G,onAddCustomModel:U,onEditCustomModel:B,bestOfNConfig:r,contextWindow:R,isModelListLoading:u,finalFocus:v?V:void 0}),d($0n,{isOpen:I,operation:L,onClose:w,modelName:x,customModelsState:y,pushCustomModelsUpdate:_,setSelectedModelConfig:p})]})';
  const qqaEndReplacement = 'w=O(()=>{F(!1),T(void 0)},[]);let[_dv,_sdv]=j(0);ge(()=>{window.__agy_onModelsUpdated=()=>_sdv(v=>v+1);const _iv=setInterval(()=>{_fetchCustomModelsAsync(()=>{_sdv(v=>v+1)})},3000);return ()=>{clearInterval(_iv);delete window.__agy_onModelsUpdated}},[]);let _liveCustom=lzr({customModels:{}});ge(()=>{if(m){let I=m.value===Zc.GOOGLE_GEMINI_INTERNAL_BYOM||!!m.isCustom;let V=I?$at(m.label,{}):void 0;try{fetch("http://127.0.0.1:50999/v1internal/selectModel",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({label:m.label,isCustom:I,override:V,native:!I})}).catch(()=>{})}catch(_e){}}},[m]);return d("div",{className:`min-w-0 ${dte}`,children:[d(Tpn,{placement:e,selectedModel:m,setSelectedModel:p,modelSorts:h,modelOptions:f,userStatus:E,refreshModels:async()=>{N.refreshUserStatus()},open:C,setIsOpen:S,customModels:_liveCustom,supportsCustomModels:!0,showCustomModelHeader:!0,onAddCustomModel:U,onEditCustomModel:B,bestOfNConfig:r,contextWindow:R,isModelListLoading:u,finalFocus:v?V:void 0}),d($0n,{isOpen:I,operation:L,onClose:w,modelName:x,customModelsState:y,pushCustomModelsUpdate:_,setSelectedModelConfig:p})]})';
  if (jsCode.includes(qqaEndTarget)) {
    jsCode = jsCode.replace(qqaEndTarget, qqaEndReplacement);
    console.log('   OK - jetskiAgent (qqa chat model selector) unlocked (showCustomModelHeader=true, supportsCustomModels=true, live disk sync)');
  } else if (jsCode.includes('customModels:_liveCustom')) {
    console.log('   OK - jetskiAgent (qqa chat model selector) already unlocked');
  }

  const qqaSelectTarget = 'else console.error(`[Model Select] Invalid model label: ${D.label}`);g()?.focus()}';
  const qqaSelectReplacement = 'else console.error(`[Model Select] Invalid model label: ${D.label}`);try{fetch("http://127.0.0.1:50999/v1internal/selectModel",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({label:D.label,isCustom:!!D.isCustom,override:$at(D.label,{}),native:!D.isCustom})}).catch(()=>{})}catch(_e){}g()?.focus()}';
  if (jsCode.includes(qqaSelectTarget)) {
    jsCode = jsCode.replace(qqaSelectTarget, qqaSelectReplacement);
    console.log('   OK - jetskiAgent (qqa model selection proxy notifier) patched');
  } else if (jsCode.includes('/v1internal/selectModel')) {
    console.log('   OK - jetskiAgent (qqa model selection proxy notifier) already patched');
  }

  // G. $0n: Modal dialog delegation to modalCode.js
  const s0nTarget = '$0n=({isOpen:e,operation:t,onClose:r,modelName:n,customModelsState:i,pushCustomModelsUpdate:a,setSelectedModelConfig:o})=>{let[s,l]=j(""),';
  const s0nReplacement = '$0n=({isOpen:e,operation:t,onClose:r,modelName:n,customModelsState:i,pushCustomModelsUpdate:a,setSelectedModelConfig:o})=>{if(!e)return null;try{if(typeof window!=="undefined"&&(window.openAddModelModal||window.__agy_openModal)){let _fn=window.openAddModelModal||window.__agy_openModal;setTimeout(()=>{_fn(window.__agy_default_provider||"openrouter",t==="edit"?n:void 0)},10);r?.();return null}}catch(_e){}let[s,l]=j(""),';
  if (jsCode.includes(s0nTarget)) {
    jsCode = jsCode.replace(s0nTarget, s0nReplacement);
    console.log('   OK - jetskiAgent ($0n modal dialog) delegated to BYOK modal');
  } else if (jsCode.includes('window.openAddModelModal||window.__agy_openModal')) {
    console.log('   OK - jetskiAgent ($0n modal dialog) already delegated');
  }

  // H. Native Quota Service Hook (H7) integration
  const h7Target = 'function H7(){let e=BU().core.cloudCodeService,t=nt().get("models")?.geminiModelsOnly===!0;return z(()=>{if(!t||!e.retrieveUserQuotaSummary)return e;let r=e.retrieveUserQuotaSummary.bind(e);return{...e,retrieveUserQuotaSummary:async(n,i)=>{let a=await r(n,i);return a.response?{...a,response:{...a.response,groups:[...Czi(a.response.groups,t)??[]]}}:a}}},[e,t])}';
  const h7Replacement = 'function H7(){let e=BU().core.cloudCodeService,t=nt().get("models")?.geminiModelsOnly===!0;return z(()=>{if(!e)return e;let r=e.retrieveUserQuotaSummary?.bind(e);return{...e,retrieveUserQuotaSummary:async(n,i)=>{let a=r?await r(n,i).catch(()=>({})):{};let bRes=await fetch("http://127.0.0.1:50999/v1internal/quotaSummary").then(x=>x.json()).catch(()=>({groups:[]}));let gGroups=a?.response?.groups||a?.groups||[];let bGroups=bRes?.groups||[];let merged=[...gGroups];for(let bg of bGroups){if(!merged.some(m=>m.displayName===bg.displayName))merged.push(bg)}return a?.response?{...a,response:{...a.response,groups:merged}}:{...a,groups:merged,response:{groups:merged}}}}},[e,t])}';
  if (jsCode.includes(h7Target)) {
    jsCode = jsCode.replace(h7Target, h7Replacement);
    console.log('   OK - jetskiAgent (H7 native quota service hook) patched to merge BYOK quotas');
  } else if (jsCode.includes('/v1internal/quotaSummary')) {
    console.log('   OK - jetskiAgent (H7 native quota service hook) already patched');
  }

  // I. Safe Quota Bucket extraction & description subtext (rOr)
  const rorTarget = 'function rOr(e){let t=e.remaining.case==="remainingFraction"?e.remaining.value:void 0,r=e.resetTime?rl(e.resetTime):void 0,n=e.description?Vzi(r):void 0;return{remainingFraction:t,refreshText:e.description||"",subtext:n,disabled:e.disabled??!1}}';
  const rorReplacement = 'function rOr(e){let t=e?.remaining?.case==="remainingFraction"?e.remaining.value:(e?.remainingFraction??e?.remaining?.value),r=e.resetTime?rl(e.resetTime):void 0,n=r?Vzi(r):(e.description||void 0);return{remainingFraction:t,refreshText:e.description||"",subtext:n,disabled:e.disabled??!1}}';
  if (jsCode.includes(rorTarget)) {
    jsCode = jsCode.replace(rorTarget, rorReplacement);
    console.log('   OK - jetskiAgent (rOr safe bucket remainingFraction & description subtext) patched');
  } else if (jsCode.includes('e?.remaining?.case')) {
    console.log('   OK - jetskiAgent (rOr) already patched');
  }

  // J. iCn: Cascade Chat Model Selector unlock & live disk sync (Antigravity v2.6.0 primary selector)
  const icnInitTarget = 'E=s.osName==="linux"&&s.isGoogleInternal,m=s.isGoogleInternal,[g,p]=j(null),';
  const icnInitReplacement = 'E=!0,m=!0,[g,p]=j(null),[_dv,_sdv]=j(0);ge(()=>{window.__agy_onModelsUpdated=()=>_sdv(v=>v+1);const _iv=setInterval(()=>{_fetchCustomModelsAsync?.(()=>{_sdv(v=>v+1)})},3000);return ()=>{clearInterval(_iv);delete window.__agy_onModelsUpdated}},[]);let ';
  if (jsCode.includes(icnInitTarget)) {
    jsCode = jsCode.replace(icnInitTarget, icnInitReplacement);
    console.log('   OK - jetskiAgent (iCn cascade chat model selector) unlocked (E=true, m=true, live disk sync)');
  } else if (jsCode.includes('E=!0,m=!0,[g,p]=j(null)')) {
    console.log('   OK - jetskiAgent (iCn) already unlocked');
  }

  const icnModelsTarget = 'R=z(()=>{let S=lzr(l);for(let N of S)N.disabled=!E;return S},[l,E]),';
  const icnModelsReplacement = 'R=z(()=>{let S=lzr(l);for(let N of S)N.disabled=!1;return S},[l,E,_dv]),';
  if (jsCode.includes(icnModelsTarget)) {
    jsCode = jsCode.replace(icnModelsTarget, icnModelsReplacement);
    console.log('   OK - jetskiAgent (iCn custom models list) un-disabled');
  } else if (jsCode.includes('N.disabled=!1;return S},[l,E,_dv]')) {
    console.log('   OK - jetskiAgent (iCn models) already un-disabled');
  }

  const icnSelectTarget = 'let I=S.value===Zc.GOOGLE_GEMINI_INTERNAL_BYOM;p(I?S.label:null);let F=bzi(S),L;if(I){let Z=$at(S.label,l);Z&&(L=Z)}i?.(F,L,N)';
  const icnSelectReplacement = 'let I=S.value===Zc.GOOGLE_GEMINI_INTERNAL_BYOM||!!S.isCustom;p(I?S.label:null);let F=bzi(S),L;if(I){let Z=$at(S.label,l);Z&&(L=Z);try{fetch("http://127.0.0.1:50999/v1internal/selectModel",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({label:S.label,isCustom:I,override:Z,native:!I})}).catch(()=>{})}catch(_e){}}else{try{fetch("http://127.0.0.1:50999/v1internal/selectModel",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({label:S.label,isCustom:!1,native:!0})}).catch(()=>{})}catch(_e){}}i?.(F,L,N)';
  if (jsCode.includes(icnSelectTarget)) {
    jsCode = jsCode.replace(icnSelectTarget, icnSelectReplacement);
    console.log('   OK - jetskiAgent (iCn model selection notifier) patched');
  } else if (jsCode.includes('GOOGLE_GEMINI_INTERNAL_BYOM||!!S.isCustom')) {
    console.log('   OK - jetskiAgent (iCn selection notifier) already patched');
  }

  // J2. Unlock native View Usage (showModelUsage gating)
  const showModelUsageTarget = '("inputComponent")?.showModelUsage===!0';
  const showModelUsageReplacement = '("inputComponent")?.showModelUsage!==!1';
  if (jsCode.includes(showModelUsageTarget)) {
    jsCode = jsCode.replaceAll(showModelUsageTarget, showModelUsageReplacement);
    console.log('   OK - jetskiAgent (showModelUsage) unlocked for native View Usage');
  } else if (jsCode.includes(showModelUsageReplacement)) {
    console.log('   OK - jetskiAgent (showModelUsage) already unlocked');
  }

  // J3. Responsive Scrollbars on model selector and submenus
  const kqaMaxHTarget = 'Kqa=()=>d("div",{"data-testid":fqa,className:"flex flex-col max-h-80 overflow-hidden outline-none"';
  const kqaMaxHReplacement = 'Kqa=()=>d("div",{"data-testid":fqa,className:"flex flex-col max-h-[min(540px,75vh)] overflow-hidden outline-none"';
  if (jsCode.includes(kqaMaxHTarget)) {
    jsCode = jsCode.replace(kqaMaxHTarget, kqaMaxHReplacement);
    console.log('   OK - jetskiAgent (Kqa panel responsive max-h) patched');
  } else if (jsCode.includes('max-h-[min(540px,75vh)]')) {
    console.log('   OK - jetskiAgent (Kqa panel responsive max-h) already patched');
  }

  const qqaScrollTarget = 'overflow-y-auto overscroll-y-none pb-1 gap-px scrollbar-none';
  const qqaScrollReplacement = 'overflow-y-auto overscroll-y-none pb-1 gap-px custom-scrollbar pr-1';
  if (jsCode.includes(qqaScrollTarget)) {
    jsCode = jsCode.replace(qqaScrollTarget, qqaScrollReplacement);
    console.log('   OK - jetskiAgent (Qqa visible custom scrollbar) patched');
  } else if (jsCode.includes('custom-scrollbar pr-1')) {
    console.log('   OK - jetskiAgent (Qqa visible custom scrollbar) already patched');
  }

  const rtContentTarget = 'className:"min-w-64 max-w-80 !w-max p-1",children:d(Kqa,{})';
  const rtContentReplacement = 'className:"min-w-64 max-w-80 !w-max p-1 overflow-hidden",children:d(Kqa,{})';
  if (jsCode.includes(rtContentTarget)) {
    jsCode = jsCode.replace(rtContentTarget, rtContentReplacement);
    console.log('   OK - jetskiAgent (Rt.Content popup outer overflow-hidden) patched');
  } else if (jsCode.includes(rtContentReplacement)) {
    console.log('   OK - jetskiAgent (Rt.Content popup outer overflow-hidden) already patched');
  }

  const reasoningSubmenuTarget = 'd(Rt.Content,{side:"right",align:"start",className:"min-w-40",children:a&&R.base==="Gemini 4 Argon"';
  const reasoningSubmenuReplacement = 'd(Rt.Content,{side:"right",align:"start",className:"min-w-40 max-h-[min(360px,70vh)] overflow-y-auto custom-scrollbar",children:a&&R.base==="Gemini 4 Argon"';
  if (jsCode.includes(reasoningSubmenuTarget)) {
    jsCode = jsCode.replace(reasoningSubmenuTarget, reasoningSubmenuReplacement);
    console.log('   OK - jetskiAgent (reasoning submenu custom scrollbar & responsive max-h) patched');
  } else if (jsCode.includes('className:"min-w-40 max-h-[min(360px,70vh)] overflow-y-auto custom-scrollbar",children:a&&R.base==="Gemini 4 Argon"')) {
    console.log('   OK - jetskiAgent (reasoning submenu custom scrollbar) already patched');
  }

  const contextWindowSubmenuTarget = 'd(Rt.Content,{side:"right",align:"start",className:"min-w-40",collisionBoundary:"viewport"';
  const contextWindowSubmenuReplacement = 'd(Rt.Content,{side:"right",align:"start",className:"min-w-40 max-h-[min(360px,70vh)] overflow-y-auto custom-scrollbar",collisionBoundary:"viewport"';
  if (jsCode.includes(contextWindowSubmenuTarget)) {
    jsCode = jsCode.replace(contextWindowSubmenuTarget, contextWindowSubmenuReplacement);
    console.log('   OK - jetskiAgent (context window submenu custom scrollbar & responsive max-h) patched');
  } else if (jsCode.includes('className:"min-w-40 max-h-[min(360px,70vh)] overflow-y-auto custom-scrollbar",collisionBoundary:"viewport"')) {
    console.log('   OK - jetskiAgent (context window submenu custom scrollbar) already patched');
  }

  // J4. Assistant Response Cost & Token Badges (LOa)
  const agyCostBadgeDef = `
var AgyCostBadge=({stepIndex:e,metadata:t,responseText:r})=>{let[u,s]=j(null),[c,f]=j(null);let trajId=t?.sourceTrajectoryStepInfo?.trajectoryId;ge(()=>{fetch("http://127.0.0.1:50999/v1internal/costSettings").then(x=>x.json()).then(x=>f(x)).catch(()=>{});let q="http://127.0.0.1:50999/v1internal/usage";if(trajId&&e!==void 0)q+="?conversationId="+encodeURIComponent(trajId)+"&stepIndex="+encodeURIComponent(e);else if(trajId)q+="?conversationId="+encodeURIComponent(trajId);fetch(q).then(x=>x.json()).then(x=>{if(x&&(x.promptTokens||x.totalTokens||x.costUsd!==void 0||x.provider))s(x)}).catch(()=>{})},[e,trajId]);if(!c||!u)return null;let provKey=(u.provider||"custom").toLowerCase();let ov=c.providerOverrides?.[provKey];let showBadge=(ov&&typeof ov.enabled==="boolean")?ov.enabled:(c.providers?.[provKey]!==!1&&(c.showCostBadges!==!1));if(!showBadge)return null;let showSession=(ov&&typeof ov.showSessionTotal==="boolean")?ov.showSessionTotal:(c.showSessionTotal!==!1);let isCust=u.isCustom;let provLbl=isCust?(u.provider?u.provider.toUpperCase():"CUSTOM"):"GOOGLE NATIVE";let inTok=(u.inputTokens||0).toLocaleString();let outTok=(u.outputTokens||0).toLocaleString();let costStr=isCust?(u.costUsd>0?"$"+u.costUsd.toFixed(4):"Free"):"Quota (Free)";let totStr=u.sessionTotalCostUsd>0?"$"+u.sessionTotalCostUsd.toFixed(4):"$0.0000";return d("div",{className:"mt-2 pt-1.5 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground select-none px-2 font-sans","data-testid":"agy-cost-badge"},[d("div",{className:"flex items-center gap-1.5 flex-wrap"},[d("span",{className:"px-1.5 py-0.5 rounded text-[10px] font-medium "+(isCust?"bg-indigo-500/15 text-indigo-400 border border-indigo-500/25":"bg-emerald-500/15 text-emerald-400 border border-emerald-500/25")},provLbl),d("span",{},inTok+" in / "+outTok+" out"),d("span",{className:"opacity-40"},"·"),d("span",{className:"font-medium text-foreground/80"},costStr)]),showSession&&d("div",{className:"text-[10px] opacity-75 font-mono"},"Total: "+totStr)])};
`;
  const loaTarget = 't.recitationMetadata&&r===xr.DONE&&d(yOa,{recitations:t.recitationMetadata.recitations||[]}),r===xr.DONE&&i!==void 0&&d(_Oa,{stepIndex:i})';
  const loaReplacement = 't.recitationMetadata&&r===xr.DONE&&d(yOa,{recitations:t.recitationMetadata.recitations||[]}),r===xr.DONE&&i!==void 0&&d(_Oa,{stepIndex:i}),r===xr.DONE&&d(AgyCostBadge,{stepIndex:i,metadata:n,responseText:l})';

  if (jsCode.includes(loaTarget)) {
    if (!jsCode.includes('var AgyCostBadge=')) {
      jsCode = agyCostBadgeDef + '\n' + jsCode;
    }
    jsCode = jsCode.replace(loaTarget, loaReplacement);
    console.log('   OK - jetskiAgent (LOa assistant response cost badge) patched');
  } else if (jsCode.includes('AgyCostBadge')) {
    const oldBadgeRegex = /var AgyCostBadge=[\s\S]*?;\n/;
    if (oldBadgeRegex.test(jsCode)) {
      jsCode = jsCode.replace(oldBadgeRegex, agyCostBadgeDef.trim() + '\n');
    }
    console.log('   OK - jetskiAgent (LOa assistant response cost badge) refreshed with latest override logic');
  }

  // J5. Models & Usage Cost Settings Card (jetskiAgent)
  const jsSettingsTarget = 'description:"Manage your model quota and credits.",children:[';
  const jsCardSnippet = makeByokSettingsCardSnippet('d');
  if (jsCode.includes(jsSettingsTarget) && !jsCode.includes('BYOK Provider & Cost Management')) {
    jsCode = jsCode.replace(jsSettingsTarget, jsSettingsTarget + jsCardSnippet);
    console.log('   OK - jetskiAgent (Models & Usage Cost Settings Card) injected');
  } else if (jsCode.includes('BYOK Provider & Cost Management')) {
    console.log('   OK - jetskiAgent (Models & Usage Cost Settings Card) already injected');
  }

  // J6. Enhanced Code Changes Widget & File Navigation Controls (o1n, s1n, t6a)
  const o1nTarget = 'o1n=({onAcceptAll:e,onRejectAll:t})=>{let{logEvent:r}=nn(),{cascadeContext:{state:{agentStateProvider:n}}}=Br();return d("div",{className:"flex flex-row items-center gap-1",children:[d("button",{type:"button",className:"cursor-pointer select-none rounded px-1 text-sm opacity-50 hover:opacity-70 border-none bg-transparent",onClick:()=>{(async()=>{let i=n.getState(),a=oN(i),o=U5(i);r(Wt.CASCADE_CHANGES_REJECT_ALL,zt({extra:{trajectoryId:a??"",stepIndex:o?(o-1).toString():""}},"system-generated trajectory/step identifiers")),await t()})()},children:"Reject all"}),d("button",{type:"button",className:"hover:bg-secondary cursor-pointer select-none rounded bg-primary px-1 text-sm text-primary-foreground border-none",onClick:()=>{(async()=>{let i=n.getState(),a=oN(i),o=U5(i);r(Wt.CASCADE_CHANGES_ACCEPT_ALL,zt({extra:{trajectoryId:a??"",stepIndex:o?(o-1).toString():""}},"system-generated trajectory/step identifiers")),await e()})()},children:"Accept all"})]})},';
  const o1nReplacement = 'o1n=({onAcceptAll:e,onRejectAll:t})=>{let{logEvent:r}=nn(),{cascadeContext:{state:{agentStateProvider:n}}}=Br();return d("div",{className:"flex flex-row items-center gap-1.5",children:[d("button",{type:"button",className:"cursor-pointer select-none rounded-md px-2.5 py-1 text-xs font-medium border border-border/80 text-muted-foreground hover:text-foreground hover:bg-destructive/15 hover:border-destructive/40 transition-colors",onClick:()=>{(async()=>{let i=n.getState(),a=oN(i),o=U5(i);r(Wt.CASCADE_CHANGES_REJECT_ALL,zt({extra:{trajectoryId:a??"",stepIndex:o?(o-1).toString():""}},"system-generated trajectory/step identifiers")),await t()})()},children:"Reject all"}),d("button",{type:"button",className:"cursor-pointer select-none rounded-md px-3 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all border border-emerald-500/30 flex items-center gap-1",onClick:()=>{(async()=>{let i=n.getState(),a=oN(i),o=U5(i);r(Wt.CASCADE_CHANGES_ACCEPT_ALL,zt({extra:{trajectoryId:a??"",stepIndex:o?(o-1).toString():""}},"system-generated trajectory/step identifiers")),await e()})()},children:[d(de,{name:"check",size:13}),d("span",{children:"Accept all"})]})]})},';
  if (jsCode.includes(o1nTarget)) {
    jsCode = jsCode.replace(o1nTarget, o1nReplacement);
    console.log('   OK - jetskiAgent (o1n enhanced Accept all / Reject all buttons) patched');
  } else if (jsCode.includes('bg-emerald-600 hover:bg-emerald-500')) {
    console.log('   OK - jetskiAgent (o1n) already patched');
  }

  const s1nTarget = 's1n=({fileDiffData:e})=>{let{workspaceInfo:t,stepHandler:{openFile:r}={}}=Br(),{homeDir:n,workspaceUris:i}=t;return d("div",{className:"flex flex-col",children:e.map((a,o)=>{let{uri:s,diffType:l,numInsertions:u,numDeletions:h}=a;return d("div",{className:"flex cursor-pointer select-none flex-row items-center gap-x-2 border-border p-1 px-2 hover:bg-muted",onClick:f=>{r?.(s),f.stopPropagation(),f.preventDefault()},children:[d("div",{className:ke("flex aspect-square h-3 w-3 flex-none items-center justify-center rounded-sm border",l==="addition"?"!border-green text-green":"!border-orange text-orange"),children:l==="addition"?d(de,{name:"add",size:10}):d("span",{className:"h-1 w-1 flex-none rounded-full border !border-orange bg-orange"})}),d("div",{className:"flex flex-row items-center gap-x-1",children:[d("span",{className:"min-w-5 text-xs text-green-500",children:["+",u]}),d("span",{className:"min-w-5 text-xs text-red-500",children:["-",h]})]}),d("span",{className:"whitespace-nowrap text-sm opacity-80",children:EE(s)}),d("span",{"data-tooltip-id":`changes-overview-${o}`,className:"min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs opacity-50",dir:"rtl",children:[d("bdi",{children:_N(s,n,i)}),d(Yt,{id:`changes-overview-${o}`,children:d("bdi",{children:_N(s,n,i)})})]})]},o)})})};';
  const s1nReplacement = 's1n=({fileDiffData:e,activeIndex:t,onSelectIndex:r})=>{let{workspaceInfo:n,stepHandler:{openFile:i}={}}=Br(),{homeDir:a,workspaceUris:o}=n;return d("div",{className:"flex flex-col gap-0.5",children:e.map((s,l)=>{let{uri:u,diffType:c,numInsertions:h,numDeletions:p}=s;let isAct=t===l;return d("div",{key:l,className:ke("flex cursor-pointer select-none flex-row items-center justify-between gap-x-2 rounded px-2 py-1 transition-colors text-xs hover:bg-muted/70",isAct?"bg-muted border border-border/60":"border border-transparent"),onClick:f=>{r?.(l),i?.(u),f.stopPropagation(),f.preventDefault()},children:[d("div",{className:"flex items-center gap-2 min-w-0 overflow-hidden",children:[d("div",{className:ke("flex aspect-square h-3.5 w-3.5 flex-none items-center justify-center rounded border",c==="addition"?"border-emerald-500/50 text-emerald-400 bg-emerald-500/10":"border-amber-500/50 text-amber-400 bg-amber-500/10"),children:c==="addition"?d(de,{name:"add",size:11}):d("span",{className:"h-1.5 w-1.5 flex-none rounded-full bg-amber-400"})}),d("span",{className:"whitespace-nowrap font-medium text-foreground/90 overflow-hidden text-ellipsis",children:EE(u)}),d("span",{"data-tooltip-id":`changes-overview-${l}`,className:"min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] opacity-40",dir:"rtl",children:[d("bdi",{children:_N(u,a,o)}),d(Yt,{id:`changes-overview-${l}`,children:d("bdi",{children:_N(u,a,o)})})]})]}),d("div",{className:"flex flex-row items-center gap-1.5 flex-none font-mono text-[10px]",children:[h>0&&d("span",{className:"px-1.5 py-0.2 rounded text-emerald-400 bg-emerald-500/10 border border-emerald-500/20",children:["+",h]}),p>0&&d("span",{className:"px-1.5 py-0.2 rounded text-rose-400 bg-rose-500/10 border border-rose-500/20",children:["-",p]})]})]})})})};';
  if (jsCode.includes(s1nTarget)) {
    jsCode = jsCode.replace(s1nTarget, s1nReplacement);
    console.log('   OK - jetskiAgent (s1n enhanced file diff list with styled +/- badges) patched');
  } else if (jsCode.includes('activeIndex:t,onSelectIndex:r')) {
    console.log('   OK - jetskiAgent (s1n) already patched');
  }

  const t6aTarget = 'function t6a(){let{fileDiffData:e}=von(),t=nt().get("conversationView")?.inlineFileChangesCloseAll,[r,n]=j(!0);if(e.length===0)return null;let i=()=>(t?.(!0),Promise.resolve()),a=()=>(t?.(!1),Promise.resolve()),o=e.length,s=`${o} File${o===1?"":"s"} With Changes`;return d("div",{className:"relative flex flex-col w-full mb-2 border border-gray-500/10 bg-ide-editor-background rounded-lg",children:[r&&d("div",{className:"border-b border-border/50 max-h-48 overflow-y-auto bg-ide-editor-background p-1",children:d(s1n,{fileDiffData:e})}),d("div",{className:"flex min-h-[1.8rem] justify-between items-center px-2 py-1",children:[d("div",{className:"flex items-center gap-x-2 overflow-hidden",children:d("button",{type:"button","data-testid":"expand-button",className:"flex flex-row items-center gap-1.5 cursor-pointer select-none text-xs font-medium hover:opacity-80 overflow-hidden bg-transparent border-none p-0 focus:outline-none",onClick:()=>{n(!r)},children:[d(de,{name:"description",size:14,className:"text-muted-foreground flex-none"}),d("span",{className:"whitespace-nowrap overflow-hidden text-ellipsis",children:s}),r?d(de,{name:"keyboard_arrow_up",size:14,className:"text-muted-foreground flex-none"}):d(de,{name:"keyboard_arrow_down",size:14,className:"text-muted-foreground flex-none"})]})}),d("div",{className:"flex items-center gap-1",children:d(o1n,{onAcceptAll:i,onRejectAll:a})})]})]})}';
  const t6aReplacement = 'function t6a(){let{fileDiffData:e}=von(),t=nt().get("conversationView")?.inlineFileChangesCloseAll,[r,n]=j(!0),[fIdx,setFIdx]=j(0);let{stepHandler:{openFile:openFn}={}}=Br();if(e.length===0)return null;let i=()=>(t?.(!0),Promise.resolve()),a=()=>(t?.(!1),Promise.resolve()),o=e.length,s=`${o} File${o===1?"":"s"} With Changes`;let navPrev=(ev)=>{ev.stopPropagation();let next=(fIdx-1+o)%o;setFIdx(next);if(e[next]?.uri)openFn?.(e[next].uri)};let navNext=(ev)=>{ev.stopPropagation();let next=(fIdx+1)%o;setFIdx(next);if(e[next]?.uri)openFn?.(e[next].uri)};return d("div",{className:"relative flex flex-col w-full mb-2.5 border border-border/80 bg-ide-editor-background rounded-lg shadow-sm overflow-hidden",children:[r&&d("div",{className:"border-b border-border/60 max-h-52 overflow-y-auto bg-ide-editor-background p-1.5",children:d(s1n,{fileDiffData:e,activeIndex:fIdx,onSelectIndex:setFIdx})}),d("div",{className:"flex min-h-[2.2rem] justify-between items-center px-2.5 py-1.5 bg-secondary/30",children:[d("div",{className:"flex items-center gap-x-2 overflow-hidden",children:[d("button",{type:"button","data-testid":"expand-button",className:"flex flex-row items-center gap-1.5 cursor-pointer select-none text-xs font-medium hover:opacity-80 overflow-hidden bg-transparent border-none p-0 focus:outline-none",onClick:()=>{n(!r)},children:[d(de,{name:"description",size:15,className:"text-muted-foreground flex-none"}),d("span",{className:"whitespace-nowrap overflow-hidden text-ellipsis font-medium",children:s}),r?d(de,{name:"keyboard_arrow_up",size:15,className:"text-muted-foreground flex-none"}):d(de,{name:"keyboard_arrow_down",size:15,className:"text-muted-foreground flex-none"})]}),o>1&&d("div",{className:"flex items-center gap-1 ml-2 pl-2 border-l border-border/60 text-xs text-muted-foreground select-none",children:[d("button",{type:"button",onClick:navPrev,className:"cursor-pointer hover:text-foreground hover:bg-secondary p-0.5 rounded transition-colors border-none bg-transparent flex items-center justify-center",title:"Arquivo anterior",children:d(de,{name:"chevron_left",size:14})}),d("span",{className:"text-[11px] font-mono px-1 font-semibold text-foreground/80"},(fIdx+1)+"/"+o),d("button",{type:"button",onClick:navNext,className:"cursor-pointer hover:text-foreground hover:bg-secondary p-0.5 rounded transition-colors border-none bg-transparent flex items-center justify-center",title:"Próximo arquivo",children:d(de,{name:"chevron_right",size:14})})]})]}),d("div",{className:"flex items-center gap-1.5",children:d(o1n,{onAcceptAll:i,onRejectAll:a})})]})]})}';
  if (jsCode.includes(t6aTarget)) {
    jsCode = jsCode.replace(t6aTarget, t6aReplacement);
    console.log('   OK - jetskiAgent (t6a file diff widget with header stepper < 1/N >) patched');
  } else if (jsCode.includes('navPrev=(ev)=>{')) {
    if (jsCode.includes('p-1.5 custom-scrollbar')) {
      jsCode = jsCode.replace('p-1.5 custom-scrollbar', 'p-1.5');
      console.log('   OK - jetskiAgent (t6a cleaned up custom-scrollbar to prevent double bars)');
    }
    console.log('   OK - jetskiAgent (t6a) already patched');
  }

  // J6b. Unlock conversation inlineFileChangesEnabled so t6a renders
  const inlineDiffTarget = 'l=nt().get("conversationView")?.inlineFileChangesEnabled??!1';
  const inlineDiffReplacement = 'l=!0';
  if (jsCode.includes(inlineDiffTarget)) {
    jsCode = jsCode.replace(inlineDiffTarget, inlineDiffReplacement);
    console.log('   OK - jetskiAgent (inlineFileChangesEnabled chat diff box) unlocked');
  } else if (jsCode.includes('l=!0,u=slt(e),h=P$r')) {
    console.log('   OK - jetskiAgent (inlineFileChangesEnabled chat diff box) already unlocked');
  }

  // K. Inject modalCode.js
  const modalCodePath = path.join(__dirname, 'modalCode.js');
  if (fs.existsSync(modalCodePath)) {
    const modalMarker = '// AGY_ADD_MODEL_MODAL_INJECTED';
    const modalCode = fs.readFileSync(modalCodePath, 'utf8');
    if (jsCode.includes(modalMarker)) {
      const idx = jsCode.indexOf(modalMarker);
      jsCode = jsCode.substring(0, idx) + modalMarker + '\n' + modalCode + '\n';
      console.log('   OK - jetskiAgent/main.js modalCode.js updated');
    } else {
      jsCode += '\n' + modalMarker + '\n' + modalCode + '\n';
      console.log('   OK - jetskiAgent/main.js modalCode.js injected');
    }
  }

  fs.writeFileSync(jetskiAgentPath, jsCode, 'utf8');
  console.log('   OK - out/jetskiAgent/main.js written successfully');
}

// 1d. Patch out/jetskiMain.tailwind.css
if (fs.existsSync(jetskiCssPath)) {
  let cssCode = fs.readFileSync(jetskiCssPath, 'utf8');

  // Clean up any old scrollbar blocks to avoid duplicates
  const scrollbarBlockRegex = /\/\* === AGY_SCROLLBAR_CSS_START ===[\s\S]*?\/\* === AGY_SCROLLBAR_CSS_END === \*\/|\/\* Antigravity BYOK Model Menu[\s\S]*?(?=(\/\* ===|$))/g;
  cssCode = cssCode.replace(scrollbarBlockRegex, '');
  const orphanedPanelRegex = /\[data-testid="model-selector-panel"\]\s*(?=\/\*|$)/g;
  cssCode = cssCode.replace(orphanedPanelRegex, '');
  cssCode = cssCode.replace(/\.custom-scrollbar[^{]*\{[\s\S]*?\}\s*/g, '');
  cssCode = cssCode.trimEnd();

  const scrollbarCss = `
/* === AGY_SCROLLBAR_CSS_START === */
/* Antigravity BYOK Model Menu Scrollbar - Native Thin Overlay */
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
[data-testid="model-selector-panel"] > div,
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
[data-testid="model-selector-panel"] > div::-webkit-scrollbar,
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
/* === AGY_SCROLLBAR_CSS_END === */
`;
  cssCode += '\n' + scrollbarCss + '\n';
  fs.writeFileSync(jetskiCssPath, cssCode, 'utf8');
  console.log('   OK - jetskiMain.tailwind.css (custom-scrollbar styles) updated');
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

  // Model state injection hook: rLo(e) for 2.6.0+, r2l(e) for 2.5.5
  const rLoTargetRegex = /function\s+rLo\s*\(e\)\s*\{\s*(try\{.*?catch\(_err\)\{\}\s*)?const\s+t\s*=\s*e\.models\s*,\s*n\s*=\s*new\s+Set\s*;/;
  const r2lTargetRegex = /function\s+r2l\s*\(e\)\s*\{\s*(try\{.*?catch\(_err\)\{\}\s*)?const\s+t\s*=\s*e\.models\s*,\s*r\s*=\s*new\s+Set\s*;/;

  const customModelsInjector = `try{const _fs=globalThis.require?globalThis.require("fs"):(typeof TYa!=="undefined"?TYa:void 0),_path=globalThis.require?globalThis.require("path"):(typeof FA!=="undefined"?FA:void 0),_os=globalThis.require?globalThis.require("os"):(typeof W4o!=="undefined"?W4o:void 0);if(_fs&&_path&&_os){const _cp=_path.join(_os.homedir(),".gemini","antigravity-ide","custom_models.json");if(_fs.existsSync(_cp)){const _cm=JSON.parse(_fs.readFileSync(_cp,"utf8")),_list=Array.isArray(_cm)?_cm:(_cm.models||[]);for(const _m of _list){if(!_m.name&&!_m.displayName)continue;const _lvls=(_m.reasoningEffortLevels&&_m.reasoningEffortLevels.length)?_m.reasoningEffortLevels:[null];for(const _l of _lvls){let _raw=(_m.externalModelName||_m.name||"custom-model").replace(/^models\\//,"").replace(/[^a-zA-Z0-9]+/g,"-").replace(/^-+|-+$/g,"").toLowerCase();let _s="custom-"+_raw+(_l?"-"+_l.toLowerCase():"");let _disp=(_m.displayName||_m.name||"custom-model")+(_l?" ("+_l+")":"");let _in=_disp.toLowerCase();let _h=5381;for(let _k=0;_k<_in.length;_k++)_h=((_h<<5)+_h+_in.charCodeAt(_k))&4294967295;let _ph=1351+(Math.abs(_h)%290);e.models[_s]={displayName:_disp,model:_ph,supportsImages:!0,recommended:!1,maxTokens:1048576,maxOutputTokens:32768,supportedMimeTypes:{}}}}}}}catch(_err){}`;

  if (rLoTargetRegex.test(mainCode)) {
    mainCode = mainCode.replace(rLoTargetRegex, `function rLo(e){${customModelsInjector}const t=e.models,n=new Set;`);
    console.log('   OK - main.js rLo (v2.6.0) hook injected');
  } else if (r2lTargetRegex.test(mainCode)) {
    mainCode = mainCode.replace(r2lTargetRegex, `function r2l(e){${customModelsInjector}const t=e.models,r=new Set;`);
    console.log('   OK - main.js r2l (v2.5.5) hook injected');
  }

  // Models & Usage Cost Settings Card (main.js)
  const mainSettingsTarget = 'description:"Manage your model quota and credits.",children:[';
  const mainCardSnippet = makeByokSettingsCardSnippet('h');
  const oldMainCardDefRegex = /^\s*var AgyCostSettingsCard=[\s\S]*?;\n+/;
  if (oldMainCardDefRegex.test(mainCode)) {
    mainCode = mainCode.replace(oldMainCardDefRegex, '');
  }
  if (mainCode.includes('h(AgyCostSettingsCard,{})')) {
    mainCode = mainCode.replace('h(AgyCostSettingsCard,{})', mainCardSnippet);
    console.log('   OK - main.js (Models & Usage Cost Settings Card) updated to direct inline JSX');
  } else if (mainCode.includes(mainSettingsTarget) && !mainCode.includes('BYOK Provider & Cost Management')) {
    mainCode = mainCode.replace(mainSettingsTarget, mainSettingsTarget + mainCardSnippet);
    console.log('   OK - main.js (Models & Usage Cost Settings Card) injected');
  } else if (mainCode.includes('BYOK Provider & Cost Management')) {
    console.log('   OK - main.js (Models & Usage Cost Settings Card) already injected');
  }

  // LS args (2.5.5 legacy)
  const kosTargetRegex = /Kos=async\(e,t,r,n\)=>\{const i=\["--csrf_token",t,"--extension_server_port",e\.port\.toString\(\),"--extension_server_csrf_token",e\.csrfToken,"--app_data_dir",NC\.ideName,"--subclient_type","ide"\];r\.quality==="dev"&&i\.push\("--dev_mode"\);(const a=await n\.getCloudCodeUrl\(\);)?return i\.push\("--cloud_code_endpoint",(a|"http:\/\/127\.0\.0\.1:50999")\),i\}/;
  if (kosTargetRegex.test(mainCode)) {
    mainCode = mainCode.replace(kosTargetRegex, `Kos=async(e,t,r,n)=>{const i=["--csrf_token",t,"--extension_server_port",e.port.toString(),"--extension_server_csrf_token",e.csrfToken,"--app_data_dir",NC.ideName,"--subclient_type","ide"];r.quality==="dev"&&i.push("--dev_mode");return i.push("--cloud_code_endpoint","http://127.0.0.1:50999"),i}`);
    console.log('   OK - main.js Kos (LS args) patched to proxy endpoint');
  }

  // getCloudCodeUrl redirect
  const getCloudCodeUrlTarget = 'async getCloudCodeUrl(){const t=await this.getOAuthTokenFromStateSyncIfUnexpired();return this.getBaseUrl(t??void 0)}';
  const getCloudCodeUrlReplacement = 'async getCloudCodeUrl(){return"http://127.0.0.1:50999"}';
  if (mainCode.includes(getCloudCodeUrlTarget)) {
    mainCode = mainCode.replace(getCloudCodeUrlTarget, getCloudCodeUrlReplacement);
    console.log('   OK - main.js getCloudCodeUrl patched to proxy endpoint');
  } else if (mainCode.includes(getCloudCodeUrlReplacement)) {
    console.log('   OK - main.js getCloudCodeUrl already patched');
  }

  // updateLSCloudCodeUrl (2.5.5 legacy)
  const updateLsTarget = 'client.setCloudCodeURL(Ur(oSt,{url:await this.getCloudCodeUrl()}))';
  const updateLsReplacement = 'client.setCloudCodeURL(Ur(oSt,{url:"http://127.0.0.1:50999"}))';
  if (mainCode.includes(updateLsTarget)) {
    mainCode = mainCode.replace(updateLsTarget, updateLsReplacement);
    console.log('   OK - main.js updateLSCloudCodeUrl patched to proxy endpoint');
  }

  // setCloudCodeURL startup (2.5.5 legacy)
  const setUrlTargetRegex = /(const A=await this\._cloudCodeMainService\.getCloudCodeUrl\(\);)?this\._client\.client\.setCloudCodeURL\(Ur\(oSt,\{url:(A|"http:\/\/127\.0\.0\.1:50999")\}\)\)/;
  if (setUrlTargetRegex.test(mainCode)) {
    mainCode = mainCode.replace(setUrlTargetRegex, `this._client.client.setCloudCodeURL(Ur(oSt,{url:"http://127.0.0.1:50999"}))`);
    console.log('   OK - main.js setCloudCodeURL startup gRPC call patched to proxy endpoint');
  }

  // Append Self-Sufficient Proxy Startup
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

// 2.5 Patch extensions (if legacy antigravity extension exists)
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

// 2.6 Patch v2.6.0+ built-in agy extension (extensions/agy/vscode/extension.js)
const agyExtJsPath = path.join(appDir, 'extensions', 'agy', 'vscode', 'extension.js');
if (fs.existsSync(agyExtJsPath)) {
  let agyExtCode = fs.readFileSync(agyExtJsPath, 'utf8');
  let agyExtModified = false;

  const agySpawnTarget = 'let d=["--hub",`--hub-port=${a.targetPort}`,"--app_data_dir=antigravity",`--csrf_token=${this.csrfToken}`,...a.baseExtraArgs],g=`http://127.0.0.1:${a.targetPort}`,h;';
  const agySpawnReplacement = 'let _byokHubPort=a.targetPort,_byokProxySrv=null;try{a.serverEnv=Object.assign({},a.serverEnv,{CLOUD_CODE_URL:"http://127.0.0.1:50999"});const _hi=require("path").join(__dirname,"..","..","..","out","mrmppro-proxy","hubInterceptor.js");if(require("fs").existsSync(_hi)){const _rp=await this.getAvailableEphemeralPort();_byokProxySrv=await require(_hi).startHubInterceptor(a.targetPort,_rp,this.csrfToken);if(_byokProxySrv)_byokHubPort=_rp}}catch(_e){console.error("[BYOK Hub Interceptor] Error:",_e)}let d=["--hub",`--hub-port=${_byokHubPort}`,"--app_data_dir=antigravity",`--csrf_token=${this.csrfToken}`,...a.baseExtraArgs],g=`http://127.0.0.1:${a.targetPort}`,h;';
  if (agyExtCode.includes(agySpawnTarget)) {
    agyExtCode = agyExtCode.replace(agySpawnTarget, agySpawnReplacement);
    agyExtModified = true;
    console.log('   OK - extensions/agy/vscode/extension.js (spawnAndWaitForPort) patched with BYOK Hub Interceptor & CLOUD_CODE_URL');
  } else if (agyExtCode.includes('startHubInterceptor')) {
    const oldCallPattern = 'const _rp=b(await c(this.getAvailableEphemeralPort()));_byokProxySrv=b(await c(require(_hi).startHubInterceptor(a.targetPort,_rp,this.csrfToken)));';
    const newCallPattern = 'const _rp=await this.getAvailableEphemeralPort();_byokProxySrv=await require(_hi).startHubInterceptor(a.targetPort,_rp,this.csrfToken);';
    if (agyExtCode.includes(oldCallPattern)) {
      agyExtCode = agyExtCode.replace(oldCallPattern, newCallPattern);
      agyExtModified = true;
      console.log('   OK - extensions/agy/vscode/extension.js (spawnAndWaitForPort) upgraded to native await');
    } else {
      console.log('   OK - extensions/agy/vscode/extension.js (spawnAndWaitForPort) already patched');
    }
  }

  const agyExitTarget = 'this.serverProcess=x;this.attachServerProcessStreams(x,p);';
  const agyExitReplacement = 'this.serverProcess=x;if(_byokProxySrv){x.on("exit",()=>{try{_byokProxySrv.close()}catch(_){}})}this.attachServerProcessStreams(x,p);';
  if (agyExtCode.includes(agyExitTarget)) {
    agyExtCode = agyExtCode.replace(agyExitTarget, agyExitReplacement);
    agyExtModified = true;
    console.log('   OK - extensions/agy/vscode/extension.js (serverProcess exit cleanup) patched');
  } else if (agyExtCode.includes('_byokProxySrv.close()')) {
    console.log('   OK - extensions/agy/vscode/extension.js (serverProcess exit cleanup) already patched');
  }

  if (agyExtModified) {
    fs.writeFileSync(agyExtJsPath, agyExtCode, 'utf8');
    console.log('   OK - extensions/agy/vscode/extension.js saved successfully');
  }
}

// 3. Binary Patch Language Server executable (conditional on existence)
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
} else {
  console.log('   INFO - Language Server binary not present in extensions/antigravity/bin; skipping binary byte-patch cleanly (v2.6.0+ thin client architecture)');
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
