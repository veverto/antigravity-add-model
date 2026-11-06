'use strict';

const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROXY_URL = 'http://127.0.0.1:50999';

function loadDiskCustomModels() {
  const customModelsPath = path.join(os.homedir(), '.gemini', 'antigravity-ide', 'custom_models.json');
  try {
    if (fs.existsSync(customModelsPath)) {
      const raw = JSON.parse(fs.readFileSync(customModelsPath, 'utf8'));
      return Array.isArray(raw) ? raw : (raw.models || []);
    }
  } catch (_) {}
  return [];
}

function loadModalCode() {
  const candidates = [
    path.join(__dirname, 'modalCode.js'),
    path.join(__dirname, '..', '..', 'antigravity-add-model-ide', 'modalCode.js')
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, 'utf8');
      }
    } catch (_) {}
  }
  return '';
}

function resolveSymbols(code) {
  const syms = {};
  try {
    // 1. Initial state var
    const initIdx = code.indexOf("{supported:!1,customModels:{}}");
    if (initIdx !== -1) {
      const before = code.slice(Math.max(0, initIdx - 30), initIdx);
      const m = before.match(/const\s+([a-zA-Z0-9_$]+)=$/);
      if (m) syms.initialStateVar = m[1];
    }
    if (syms.initialStateVar) {
      const needle = ".customModels??" + syms.initialStateVar + ").supported";
      const supIdx = code.indexOf(needle);
      if (supIdx !== -1) {
        const before = code.slice(Math.max(0, supIdx - 30), supIdx);
        const m = before.match(/([a-zA-Z0-9_$]+)=a=>\(a$/);
        if (m) syms.supportsVar = m[1];
      }
    }

    // 2. Loader var
    const loaderIdx = code.indexOf("customModelUrl:");
    if (loaderIdx !== -1) {
      const before = code.slice(Math.max(0, loaderIdx - 200), loaderIdx);
      const m = before.match(/var\s+([a-zA-Z0-9_$]+)=a=>a\?\.customModels/);
      if (m) syms.loaderVar = m[1];
    }

    // 3. Item component var
    const itemIdx = code.indexOf("\"data-testid\":\"model-selector-custom-item\"");
    if (itemIdx !== -1) {
      const before = code.slice(Math.max(0, itemIdx - 300), itemIdx);
      const m = before.match(/var\s+([a-zA-Z0-9_$]+)=\(\{model:a,onEdit:b\}\)=>/);
      if (m) syms.itemCompVar = m[1];
    }

    // 4. Section component var
    const secIdx = code.indexOf("\"data-testid\":\"model-selector-add-custom-model\"");
    if (secIdx !== -1) {
      const before = code.slice(Math.max(0, secIdx - 600), secIdx);
      const m = before.match(/var\s+([a-zA-Z0-9_$]+)=\(\{customModels:a,onAddCustomModel:b,onEditCustomModel:c\}\)=>/);
      if (m) syms.sectionCompVar = m[1];
    }
    if (!syms.sectionCompVar) {
      const secCall = code.match(/B\.createElement\(([a-zA-Z0-9_$]+),\{customModels:[a-zA-Z0-9_$]+,onAddCustomModel:/);
      if (secCall) syms.sectionCompVar = secCall[1];
    }

    // 5. Effort submenu components
    const effIdx = code.indexOf("\"data-testid\":\"model-selector-effort-group\"");
    if (effIdx !== -1) {
      const before = code.slice(Math.max(0, effIdx - 250), effIdx);
      const after = code.slice(effIdx, effIdx + 400);
      const mMR = before.match(/return\s+[a-zA-Z0-9_$]+\.createElement\(([a-zA-Z0-9_$]+),\{title:/);
      const mNR = before.match(/\.createElement\(([a-zA-Z0-9_$]+),\{selected:/);
      const mER = after.match(/\.createElement\(([a-zA-Z0-9_$]+),\{side:"right"/);
      const mOpt = after.match(/\.createElement\(([a-zA-Z0-9_$]+),\{option:a\}/);
      if (mMR) syms.menuRoot = mMR[1];
      if (mNR) syms.menuTrigger = mNR[1];
      if (mER) syms.menuContent = mER[1];
      if (mOpt) syms.modelOptionComp = mOpt[1];
    }

    // 6. Hook & item inside item component
    if (syms.itemCompVar) {
      const idx = code.indexOf("var " + syms.itemCompVar + "=");
      if (idx !== -1) {
        const slice = code.slice(idx, idx + 1000);
        const mHook = slice.match(/\{setSelectedModel:[a-zA-Z0-9_$]+,selectedModel:[a-zA-Z0-9_$]+\}=([a-zA-Z0-9_$]+)\(\)/);
        if (mHook) syms.hookFn = mHook[1];
        const mItem = slice.match(/\.createElement\(([a-zA-Z0-9_$]+),\{"data-testid":"model-selector-custom-item"/);
        if (mItem) syms.menuItem = mItem[1];
        const mIcon = slice.match(/\.createElement\(([a-zA-Z0-9_$]+),\{name:"edit",size:12\}\)/);
        if (mIcon) syms.iconComp = mIcon[1];
        const mTip = slice.match(/\.createElement\(([a-zA-Z0-9_$]+),\{id:[a-zA-Z0-9_$]+(?:,"Edit Model"|\},"Edit Model")\)/);
        if (mTip) syms.tipComp = mTip[1];
        const mOpt = slice.match(/\.createElement\(([a-zA-Z0-9_$]+),\{option:a\}/);
        if (mOpt && !syms.modelOptionComp) syms.modelOptionComp = mOpt[1];
      }
    }

    // 7. Context & Caller components
    const ctxIdx = code.indexOf("showModelUsage===!0");
    if (ctxIdx !== -1) {
      const before = code.slice(Math.max(0, ctxIdx - 150), ctxIdx);
      const m = before.match(/([a-zA-Z0-9_$]+)=a=>\{var b=a\.setSelectedModel/);
      if (m) syms.contextCompVar = m[1];
    }
    if (syms.contextCompVar) {
      const callIdx = code.indexOf(".createElement(" + syms.contextCompVar + ",{...a,setSelectedModel:");
      if (callIdx !== -1) {
        const before = code.slice(Math.max(0, callIdx - 300), callIdx);
        const m = before.match(/var\s+([a-zA-Z0-9_$]+)=a=>\{var b=a\.setSelectedModel/);
        if (m) syms.callerCompVar = m[1];
      }
    }

    // 8. Effort map and effort regex variables
    const effMapIdx = code.indexOf("{low:\"Low\",medium:\"Medium\",high:\"High\",xhigh:\"Extra\",max:\"Max\"}");
    if (effMapIdx !== -1) {
      const before = code.slice(Math.max(0, effMapIdx - 40), effMapIdx);
      const m = before.match(/([a-zA-Z0-9_$]+)=$/);
      if (m) syms.effortMapVar = m[1];
    }
    const effRegIdx = code.indexOf("^(.*?)\\s*\\((low|medium|high|xhigh|max)");
    if (effRegIdx !== -1) {
      const before = code.slice(Math.max(0, effRegIdx - 40), effRegIdx);
      const m = before.match(/([a-zA-Z0-9_$]+)=\/$/);
      if (m) syms.effortRegexVar = m[1];
    }

    // 9. Models page in settings
    const modelsIdx = code.indexOf("case \"Models\":return ");
    if (modelsIdx !== -1) {
      const slice = code.slice(modelsIdx, modelsIdx + 80);
      const m = slice.match(/case "Models":return\s+([a-zA-Z0-9_$]+)\.createElement\(([a-zA-Z0-9_$]+),\s*\{isActive:!0\}\)/);
      if (m) {
        syms.reactNs = m[1];
        syms.modelsPageCompVar = m[2];
      }
    }
  } catch (_e) {}
  return syms;
}

function patchHubMainJs(jsCode, customModelsOverride, modalCodeOverride) {
  if (!jsCode || typeof jsCode !== 'string') return jsCode;
  if (jsCode.includes('// AGY_HUB_MAIN_PATCHED_V1')) return jsCode;

  const customModels = Array.isArray(customModelsOverride) ? customModelsOverride : loadDiskCustomModels();
  const customModelsJsonLiteral = JSON.stringify(customModels);
  const modalCode = typeof modalCodeOverride === 'string' ? modalCodeOverride : loadModalCode();

  // Dynamically resolve protobuf schema create factory function (resilient to minification changes e.g. Wb vs cc)
  const mCreate = jsCode.match(/return\s+([a-zA-Z0-9_$]+)\([a-zA-Z0-9_$]+\.ModelOrAliasSchema/);
  const createFn = mCreate ? mCreate[1] : (jsCode.includes('ModelFeaturesSchema') ? 'cc' : 'Wb');

  const agyCostBadgeDef = `
var AgyCostBadge=({stepIndex:e,metadata:t,responseText:r})=>{
  let _st=typeof B!=="undefined"&&B.useState?B.useState:(typeof React!=="undefined"?React.useState:(typeof j!=="undefined"?j:null));
  let _eff=typeof B!=="undefined"&&B.useEffect?B.useEffect:(typeof React!=="undefined"?React.useEffect:(typeof ge!=="undefined"?ge:null));
  let _el=typeof B!=="undefined"&&B.createElement?B.createElement:(typeof React!=="undefined"?React.createElement:(typeof d!=="undefined"?d:null));
  if(!_st||!_eff||!_el)return null;
  let[u,s]=_st(null),[c,f]=_st(null);
  let trajId=t?.sourceTrajectoryStepInfo?.trajectoryId;
  _eff(()=>{
    fetch("${PROXY_URL}/v1internal/costSettings").then(x=>x.json()).then(x=>f(x)).catch(()=>{});
    let q="${PROXY_URL}/v1internal/usage";
    if(trajId&&e!==void 0)q+="?conversationId="+encodeURIComponent(trajId)+"&stepIndex="+encodeURIComponent(e);
    else if(trajId)q+="?conversationId="+encodeURIComponent(trajId);
    fetch(q).then(x=>x.json()).then(x=>{if(x&&(x.promptTokens||x.totalTokens||x.costUsd!==void 0||x.provider))s(x)}).catch(()=>{});
  },[e,trajId]);
  if(!c||!u)return null;
  let provKey=(u.provider||"custom").toLowerCase();
  let ov=c.providerOverrides?.[provKey];
  let showBadge=(ov&&typeof ov.enabled==="boolean")?ov.enabled:(c.providers?.[provKey]!==!1&&(c.showCostBadges!==!1));
  if(!showBadge)return null;
  let showSession=(ov&&typeof ov.showSessionTotal==="boolean")?ov.showSessionTotal:(c.showSessionTotal!==!1);
  let isCust=u.isCustom;
  let provLbl=isCust?(u.provider?u.provider.toUpperCase():"CUSTOM"):"GOOGLE NATIVE";
  let inTok=(u.inputTokens||0).toLocaleString();
  let outTok=(u.outputTokens||0).toLocaleString();
  let costStr=isCust?(u.costUsd>0?"$"+u.costUsd.toFixed(4):"Free"):"Quota (Free)";
  let totStr=u.sessionTotalCostUsd>0?"$"+u.sessionTotalCostUsd.toFixed(4):"$0.0000";
  return _el("div",{className:"mt-2 pt-1.5 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground select-none px-2 font-sans","data-testid":"agy-cost-badge"},[
    _el("div",{className:"flex items-center gap-1.5 flex-wrap"},[
      _el("span",{className:"px-1.5 py-0.5 rounded text-[10px] font-medium "+(isCust?"bg-indigo-500/15 text-indigo-400 border border-indigo-500/25":"bg-emerald-500/15 text-emerald-400 border border-emerald-500/25")},provLbl),
      _el("span",{},inTok+" in / "+outTok+" out"),
      _el("span",{className:"opacity-40"},"·"),
      _el("span",{className:"font-medium text-foreground/80"},costStr)
    ]),
    showSession&&_el("div",{className:"text-[10px] opacity-75 font-mono"},"Total: "+totStr)
  ]);
};
`;

  const syms = resolveSymbols(jsCode);
  const hasREa = jsCode.includes('const REa={supported:!1,customModels:{}}') || jsCode.includes('var $Ea=a=>a?.customModels');
  const initVar = syms.initialStateVar || (hasREa ? 'REa' : 'Qt');
  const supVar = syms.supportsVar || (hasREa ? 'YEa' : 'PBa');
  const loaderVar = syms.loaderVar || (hasREa ? '$Ea' : 'RBa');
  const itemCompVar = syms.itemCompVar || (hasREa ? 'YCc' : 'zrc');
  const secCompVar = syms.sectionCompVar || (hasREa ? 'ZCc' : 'Arc');
  const iconComp = syms.iconComp || (hasREa ? 'br' : 'Us');
  const tipComp = syms.tipComp || (hasREa ? 'cz' : 'AB');
  const hookFn = syms.hookFn || (hasREa ? 'n4' : 'O4');
  const menuRoot = syms.menuRoot || (hasREa ? 'jS' : 'jT');
  const menuTrigger = syms.menuTrigger || (hasREa ? 'kS' : 'kT');
  const menuContent = syms.menuContent || (hasREa ? 'bS' : 'bT');
  const menuItem = syms.menuItem || (hasREa ? 'cS' : 'cT');
  const modelOptionComp = syms.modelOptionComp || (hasREa ? 'L_' : 'E0');
  const mProtoNs = jsCode.match(/([a-zA-Z0-9_$]+)\.ModelFeaturesSchema/);
  const protoNs = mProtoNs ? mProtoNs[1] : (jsCode.includes('D.ModelFeaturesSchema') ? 'D' : (jsCode.includes('E.ModelFeaturesSchema') ? 'E' : 'C'));
  const effRegVar = syms.effortRegexVar || 'kJc';
  const effMapVar = syms.effortMapVar || 'r5';

  // 1. Unlock Redux customModels initial state
  jsCode = jsCode.replace(`const ${initVar}={supported:!1,customModels:{}}`, `const ${initVar}={supported:!0,customModels:{}}`);
  jsCode = jsCode.replace(new RegExp(`${supVar}=a=>\\(a\\.customModels\\?\\?${initVar}\\)\\.supported`), `${supVar}=a=>!0`);
  jsCode = jsCode.replace('const Qt={supported:!1,customModels:{}}', 'const Qt={supported:!0,customModels:{}}');
  jsCode = jsCode.replace('PBa=a=>(a.customModels??Qt).supported', 'PBa=a=>!0');
  jsCode = jsCode.replace('const REa={supported:!1,customModels:{}}', 'const REa={supported:!0,customModels:{}}');
  jsCode = jsCode.replace('YEa=a=>(a.customModels??REa).supported', 'YEa=a=>!0');

  // 2. Custom Models Loader ($Ea / RBa / rGa & _lookupCustomModelInfo) + Startup SetCloudCodeURL
  const eaTargetRegex = new RegExp('var\\s+' + loaderVar + '=a=>a\\?\\.customModels\\?Object\\.entries\\(a\\.customModels\\)\\.map\\(\\(\\[b,c\\]\\)=>\\(\\{label:b,value:c\\.modelId,isCustom:!0,customModelUrl:c\\.modelName\\}\\)\\):\\[\\];');
  const eaReplacement = `var _cachedCustomModels=${customModelsJsonLiteral},_lastCustomFetch=0,_fetchingCustomModels=!1;try{if(typeof window!=="undefined")window._cachedCustomModels=_cachedCustomModels}catch(_e){}var _fetchCustomModelsAsync=cb=>{if(_fetchingCustomModels)return;_fetchingCustomModels=!0;try{fetch("${PROXY_URL}/v1internal/customModels").then(r=>r.json()).then(d=>{const _l=Array.isArray(d)?d:(d.models||[]);if(Array.isArray(_l)){const _old=JSON.stringify(_cachedCustomModels);const _new=JSON.stringify(_l);_cachedCustomModels=_l;try{if(typeof window!=="undefined")window._cachedCustomModels=_l}catch(_e){}if(_old!==_new){cb?.();try{window.__agy_onModelsUpdated?.()}catch(_){}}}}).catch(()=>{}).finally(()=>{_fetchingCustomModels=!1})}catch(_e){_fetchingCustomModels=!1}};try{if(typeof window!=="undefined")window._fetchCustomModelsAsync=_fetchCustomModelsAsync}catch(_e){}try{_fetchCustomModelsAsync()}catch(_e){}var _ensureHubCloudCodeUrl=()=>{try{if(typeof window!=="undefined"&&window.__APP_CONFIG__?.csrfToken){fetch("/exa.language_server_pb.LanguageServerService/SetCloudCodeURL",{method:"POST",headers:{"Content-Type":"application/json","x-codeium-csrf-token":window.__APP_CONFIG__.csrfToken},body:JSON.stringify({url:"${PROXY_URL}"})}).catch(()=>{})}}catch(_e){}};try{_ensureHubCloudCodeUrl()}catch(_e){}var _getDiskCustomModels=()=>{const _now=Date.now();if(typeof window!=="undefined"&&Array.isArray(window._cachedCustomModels))_cachedCustomModels=window._cachedCustomModels;if(!_cachedCustomModels||_cachedCustomModels.length===0||_now-_lastCustomFetch>2500){_lastCustomFetch=_now;_fetchCustomModelsAsync()}return _cachedCustomModels||[]};var ${loaderVar}=a=>{let _r=[],_d=_getDiskCustomModels();for(const _m of _d){const _lbl=_m.displayName||_m.name;if(_lbl)_r.push({label:_lbl,value:326,isCustom:!0,customModelUrl:_m.externalModelName||_m.name||_lbl,supportsThinking:_m.supportsThinking!==!1,provider:_m.provider||"Custom"})}if(a?.customModels){for(const[b,c]of Object.entries(a.customModels)){if(!_r.some(_x=>_x.label===b)){let matched=_d.find(x=>(x.displayName||x.name)===b||x.name===b||x.externalModelName===c.modelName);let prov=matched?.provider||c.provider||"Custom";_r.push({label:b,value:c.modelId||326,isCustom:!0,customModelUrl:c.modelName,supportsThinking:!0,provider:prov})}}}return _r},_lookupCustomModelInfo=(t,e)=>{if(e?.customModels&&e.customModels[t])return e.customModels[t];try{const _effReg=typeof ${effRegVar}!=="undefined"?${effRegVar}:null;const _q=_effReg?_effReg.exec(t):null;const _base=_q?_q[1].trim():t;const _eff=_q?_q[2].toLowerCase():void 0;const _d=_getDiskCustomModels(),_m=_d.find(_x=>(_x.displayName||_x.name)===t||_x.name===t||(_x.displayName||_x.name)===_base);if(_m){const _effLabels=typeof ${effMapVar}!=="undefined"&&${effMapVar}?${effMapVar}:{default:"Default",low:"Low",medium:"Medium",high:"High",xhigh:"Extra",max:"Max"};const _feat=${createFn}(${protoNs}.ModelFeaturesSchema,{zeroShotCapable:!0,supportsImages:!0,supportsToolCalls:!0,supportsThinking:_m.supportsThinking!==!1});const _info=${createFn}(${protoNs}.ModelInfoSchema,{modelId:326,apiProvider:1,chatModelName:_eff?((_m.displayName||_m.name)+" ("+(_effLabels[_eff]||_eff)+")"):(_m.displayName||_m.name),modelName:_m.externalModelName||_m.name,maxTokens:(_m.maxTokens&&_m.maxTokens>64000?_m.maxTokens:1048576),modelFeatures:_feat});_info.effort=_eff;return _info}}catch(_e){}return void 0};`;
  if (eaTargetRegex.test(jsCode)) {
    jsCode = jsCode.replace(eaTargetRegex, eaReplacement);
  }

  // 3. Model selector resolution
  const qrTargetRegex = /f=d\?\.model;if\(f!==void 0&&f!==[a-zA-Z0-9_$]+\.Model\.UNSPECIFIED\)\{let g=d\?\.customLabel\?b\.find\(h=>h\.value===f&&h\.label===d\.customLabel\):void 0;if\(g\)return g;if\(\(a=([a-zA-Z0-9_$]+)\(f,a\)\)\|\|\(a=b\.find\(h=>h\.value===f\)\)\)return a\}/;
  const mQr = jsCode.match(qrTargetRegex);
  if (mQr) {
    const aliasFn = mQr[1];
    const qrReplacement = `f=d?.model;if(f!==void 0&&f!==(${protoNs}?.Model?.UNSPECIFIED??0)){let _allB=${loaderVar}({customModels:{}});let _cl=d?.customLabel;let _bm=_cl&&(typeof ${effRegVar}!=="undefined"?${effRegVar}:null)?.exec?.(_cl);let _base=_bm?_bm[1].trim():_cl;let _found=_cl?(_allB.find(g=>g.label===_cl||g.label===_base)||b.find(g=>g.label===_cl||g.label===_base)):void 0;if(_found){let _ret=_found.label===_cl?_found:{..._found,label:_cl,effort:_bm?_bm[2].toLowerCase():_found.effort};return _ret}let g=d?.customLabel?b.find(h=>h.value===f&&h.label===d.customLabel):void 0;if(g)return g;if((a=${aliasFn}(f,a))||(a=b.find(h=>h.value===f)))return a}`;
    jsCode = jsCode.replace(qrTargetRegex, qrReplacement);
  }
  // Legacy BYOM selector resolution
  jsCode = jsCode.replace(
    /if\(f===[a-zA-Z0-9_$]+\.Model\.GOOGLE_GEMINI_INTERNAL_BYOM\)\{if\(a=\(d\?\.customLabel\?b\.find\(g=>g\.label===d\.customLabel\):void 0\)\?\?b\.at\(0\)\)return a\}/,
    `if(f===(${protoNs}?.Model?.GOOGLE_GEMINI_INTERNAL_BYOM??326)||f===326){let _allB=${loaderVar}({customModels:{}});let _cl=d?.customLabel;let _bm=_cl&&(typeof ${effRegVar}!=="undefined"?${effRegVar}:null)?.exec?.(_cl);let _base=_bm?_bm[1].trim():_cl;let _found=_cl?(_allB.find(g=>g.label===_cl||g.label===_base)||b.find(g=>g.label===_cl||g.label===_base)):void 0;if(a=_found?(_found.label===_cl?_found:{..._found,label:_cl,effort:_bm?_bm[2].toLowerCase():_found.effort}):(_allB.at(0)??b.at(0)))return a}`
  );

  // 4. lookupCustomModelInfo hooks
  jsCode = jsCode.replace(
    'lookupCustomModelInfo:f=>{f=c?.customModels?c.customModels[f]:void 0;return f}',
    'lookupCustomModelInfo:f=>(typeof _lookupCustomModelInfo==="function"?_lookupCustomModelInfo(f,c):(c?.customModels?c.customModels[f]:void 0))'
  );
  jsCode = jsCode.replace(
    'if(n&&m){var v=h?.customModels?h.customModels[m]:void 0;return v}',
    'if(n&&m){return typeof _lookupCustomModelInfo==="function"?_lookupCustomModelInfo(m,h):(h?.customModels?h.customModels[m]:void 0)}'
  );
  jsCode = jsCode.replace(
    new RegExp('if\\(n===[a-zA-Z0-9_$]+\\.Model\\.GOOGLE_GEMINI_INTERNAL_BYOM&&p\\)\\{var x=l\\?\\.customModels\\?l\\.customModels\\[p\\]:void 0;return x\\}'),
    'if((n===(${protoNs}?.Model?.GOOGLE_GEMINI_INTERNAL_BYOM??326)||n===326)&&p){return typeof _lookupCustomModelInfo==="function"?_lookupCustomModelInfo(p,l):(l?.customModels?l.customModels[p]:void 0)}'
  );

  // 5. Effort levels & reasoning resolution
  if (syms.effortMapVar) {
    jsCode = jsCode.replace(
      `${syms.effortMapVar}={low:"Low",medium:"Medium",high:"High",xhigh:"Extra",max:"Max"}`,
      `${syms.effortMapVar}={default:"Default",low:"Low",medium:"Medium",high:"High",xhigh:"Extra",max:"Max"}`
    );
  }
  if (syms.effortRegexVar) {
    jsCode = jsCode.replace(
      `${syms.effortRegexVar}=/^(.*?)\\s*\\((low|medium|high|xhigh|max)(?:\\s+thinking)?\\)\\s*$/i`,
      `${syms.effortRegexVar}=/^(.*?)\\s*\\((default|low|medium|high|xhigh|max)(?:\\s+thinking)?\\)\\s*$/i`
    );
  }
  // Static effort fallbacks
  jsCode = jsCode.replace(
    'LCc=["low","medium","high","xhigh","max"],l4={low:"Low",medium:"Medium",high:"High",xhigh:"Extra",max:"Max"};const MCc=new Map,NCc=/^(.*?)\\s*\\((low|medium|high|xhigh|max)(?:\\s+thinking)?\\)\\s*$/i;',
    'LCc=["default","low","medium","high","xhigh","max"],l4={default:"Default",low:"Low",medium:"Medium",high:"High",xhigh:"Extra",max:"Max"};const MCc=new Map,NCc=/^(.*?)\\s*\\((default|low|medium|high|xhigh|max)(?:\\s+thinking)?\\)\\s*$/i;'
  );
  jsCode = jsCode.replace(
    'var mrc=["low","medium","high","xhigh","max"],M4={low:"Low",medium:"Medium",high:"High",xhigh:"Extra",max:"Max"};const nrc=new Map,orc=/^(.*?)\\s*\\((low|medium|high|xhigh|max)(?:\\s+thinking)?\\)\\s*$/i;',
    'var mrc=["default","low","medium","high","xhigh","max"],M4={default:"Default",low:"Low",medium:"Medium",high:"High",xhigh:"Extra",max:"Max"};const nrc=new Map,orc=/^(.*?)\\s*\\((default|low|medium|high|xhigh|max)(?:\\s+thinking)?\\)\\s*$/i;'
  );

  // Dynamic oJc reasoning extractor replacement (for model selector trigger button effort badge)
  const ojIdx = jsCode.indexOf('(a,b)=>{var c=(b=');
  if (ojIdx !== -1) {
    const ojSlice = jsCode.slice(Math.max(0, ojIdx - 20), ojIdx + 120);
    const mOj = ojSlice.match(/([a-zA-Z0-9_$]+)=\(a,b\)=>\{var c=\(b=([a-zA-Z0-9_$]+)\(a,b\)\)\?([a-zA-Z0-9_$]+)\(a\):void 0;return b&&c\?\{name:b\.base,effort:c\.effort\}:\{name:a\.label\}\};/);
    if (mOj) {
      const [fullOj, ojFn, mjFn, s5Fn] = mOj;
      const ojReplacement = `${ojFn}=(a,b)=>{if(a?.isCustom){let _reg=typeof ${effRegVar}!=="undefined"?${effRegVar}:null;let _m=_reg&&a.label?_reg.exec(a.label):null;return _m?{name:_m[1].trim(),effort:_m[2].toLowerCase()}:{name:a.label,effort:a.effort||"medium"}}var c=(b=${mjFn}(a,b))?${s5Fn}(a):void 0;return b&&c?{name:b.base,effort:c.effort}:{name:a.label}};`;
      jsCode = jsCode.replace(fullOj, ojReplacement);
    }
  }

  // Dynamic model finder with effort fallback (e.g. GJc / Krc)
  const findIdx = jsCode.indexOf('(a,b,c)=>{if(a=a.find(d=>d.label===c))return a;if(b=b.find(d=>d.label===c))return b}');
  if (findIdx !== -1) {
    const findSlice = jsCode.slice(Math.max(0, findIdx - 20), findIdx + 100);
    const mFind = findSlice.match(/var\s+([a-zA-Z0-9_$]+)=\(a,b,c\)=>\{if\(a=a\.find\(d=>d\.label===c\)\)return a;if\(b=b\.find\(d=>d\.label===c\)\)return b\};/);
    if (mFind) {
      const [fullFind, findFn] = mFind;
      const findReplacement = `var ${findFn}=(a,b,c)=>{let _reg=typeof ${effRegVar}!=="undefined"?${effRegVar}:null,_m=_reg?_reg.exec(c):null,_b=_m?_m[1].trim():c;let _f1=a.find(d=>d.label===c||d.label===_b);if(_f1)return _f1.label===c?_f1:{..._f1,label:c};let _f2=b.find(d=>d.label===c||d.label===_b);if(_f2)return _f2.label===c?_f2:{..._f2,label:c}};`;
      jsCode = jsCode.replace(fullFind, findReplacement);
    }
  }

  // 6. Responsive scrollbars & max heights
  jsCode = jsCode.replace(
    'overflow-y-auto overscroll-y-none pb-1 gap-px scrollbar-none',
    'overflow-y-auto overscroll-y-none pb-1 gap-px custom-scrollbar pr-1'
  );
  jsCode = jsCode.replace(
    'className:"flex flex-col max-h-80 overflow-hidden outline-none"',
    'className:"flex flex-col max-h-[min(480px,70vh)] overflow-hidden outline-none",style:{maxHeight:"min(480px,70vh)"}'
  );
  jsCode = jsCode.replace(
    'side:"right",align:"start",className:"min-w-40"',
    'side:"right",align:"start",className:"min-w-40 max-h-[min(340px,60vh)] overflow-y-auto custom-scrollbar",style:{maxHeight:"min(340px,60vh)",overflowY:"auto"}'
  );

  // 7. Replace section component definition (PGc / ZCc / Arc)
  if (secCompVar) {
    const pgcStart = jsCode.indexOf('var ' + secCompVar + '=({customModels:a,onAddCustomModel:b,onEditCustomModel:c})=>');
    if (pgcStart !== -1) {
      const pgcEnd = jsCode.indexOf('):null};', pgcStart) + 8;
      const pgcReplacement = `var ${secCompVar}=({customModels:a,onAddCustomModel:b,onEditCustomModel:c})=>{var f=(0,B.useId)();let _openAdd=prov=>{try{window.__agy_default_provider=(prov||"").toLowerCase()}catch(_){}if(typeof window.openAddModelModal==="function")window.openAddModelModal(prov);else if(b)b(prov)};let _openEdit=(mod)=>{if(typeof window.openAddModelModal==="function")window.openAddModelModal(mod?.provider,mod?.label||mod?.displayName||mod?.name);else if(c)c(mod)};let _modelsList=(a&&a.length>0)?a:${loaderVar}({customModels:{}});if(!_modelsList||_modelsList.length===0){return B.createElement("div",{className:"pt-1 border-t border-border/40 mt-1"},B.createElement("button",{type:"button",tabIndex:-1,"data-testid":"model-selector-add-custom-model-footer",onClick:()=>_openAdd(),className:"w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"},B.createElement(${iconComp},{name:"add",size:13}),B.createElement("span",null,"Add Custom Model...")))}let _groups={};const _pMap={openrouter:"OpenRouter",openai:"OpenAI",anthropic:"Anthropic",google:"Google",ollama:"Ollama",deepseek:"DeepSeek",groq:"Groq",mistral:"Mistral",cerebras:"Cerebras",kimi:"Kimi",fireworks:"Fireworks",lmstudio:"LM Studio",llamacpp:"llama.cpp",nvidia:"NVIDIA"};for(const _m of _modelsList){let _rawP=_m.provider||"Custom";let _p=_pMap[_rawP.toLowerCase()]||(_rawP.charAt(0).toUpperCase()+_rawP.slice(1));if(!_groups[_p])_groups[_p]=[];_groups[_p].push(_m)}let _sections=[];for(const[_prov,_items]of Object.entries(_groups)){let _tipId=f+"-"+_prov.toLowerCase().replace(/[^a-z0-9]/g,"");_sections.push(B.createElement("div",{key:_prov,className:"flex flex-col gap-1 mt-1"},B.createElement("div",{className:"group flex select-none items-center justify-between gap-1 p-1 pl-2 text-xs font-medium"},B.createElement("span",{className:"opacity-60 font-semibold tracking-wide"},_prov),B.createElement(B.Fragment,null,B.createElement("button",{onClick:()=>_openAdd(_items[0]?.provider||_prov),type:"button",tabIndex:-1,"data-testid":"model-selector-add-custom-model",className:"cursor-pointer rounded-md p-1 opacity-50 hover:bg-secondary hover:opacity-100","data-tooltip-id":_tipId},B.createElement(${iconComp},{name:"add",size:12})),B.createElement(${tipComp},{id:_tipId},"Add "+_prov+" Model"))),B.createElement("div",{className:"flex flex-col gap-px"},_items.map(h=>B.createElement(${itemCompVar},{key:h.label,model:h,onEdit:_openEdit})))))}return B.createElement("div",null,..._sections,B.createElement("div",{key:"_add_global",className:"pt-1 border-t border-border/40 mt-1.5"},B.createElement("button",{type:"button",tabIndex:-1,"data-testid":"model-selector-add-custom-model-footer",onClick:()=>_openAdd(),className:"w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"},B.createElement(${iconComp},{name:"add",size:13}),B.createElement("span",null,"Add Custom Model..."))))};`;
      jsCode = jsCode.slice(0, pgcStart) + pgcReplacement + jsCode.slice(pgcEnd);
    }
  }
  // Un-gate panel rendering of section component
  jsCode = jsCode.replace(`g&&B.createElement(${secCompVar},{customModels:c,onAddCustomModel:d,onEditCustomModel:f})`, `B.createElement(${secCompVar},{customModels:c,onAddCustomModel:d,onEditCustomModel:f})`);

  // 8. Replace item component definition (OGc / YCc / zrc)
  if (itemCompVar) {
    const ogcStart = jsCode.indexOf('var ' + itemCompVar + '=({model:a,onEdit:b})=>');
    if (ogcStart !== -1) {
      let ogcEnd = jsCode.indexOf('Edit Model\\")))};', ogcStart);
      if (ogcEnd === -1) ogcEnd = jsCode.indexOf('Edit Model")))};', ogcStart);
      if (ogcEnd !== -1) {
        ogcEnd += 16;
        const ogcReplacement = `var ${itemCompVar}=({model:a,onEdit:b})=>{var {setSelectedModel:c,selectedModel:d}=${hookFn}(),f=d?.label===a.label,g=a.disabled??!1,h=(0,B.useId)(),k=!g;let _supportsEffort=a?.supportsThinking!==!1;let _reg=typeof ${effRegVar}!=="undefined"?${effRegVar}:null;let _am=_reg&&a?.label?_reg.exec(a.label):null;let _aBase=_am?_am[1].trim():a.label;let _dm=_reg&&d?.label?_reg.exec(d.label):null;let _dBase=_dm?_dm[1].trim():d?.label;let _isSel=d?.label===a.label||(_dBase&&_aBase&&_dBase===_aBase);let _currEffort=_isSel?(_dm?_dm[2].toLowerCase():(d?.effort||(_am?_am[2].toLowerCase():"medium"))):(_am?_am[2].toLowerCase():(a?.effort||"medium"));let _effMap=typeof ${effMapVar}!=="undefined"&&${effMapVar}?${effMapVar}:{default:"Default",low:"Low",medium:"Medium",high:"High",xhigh:"Extra",max:"Max"};let _efforts=["default","low","medium","high"];let _setEffort=eff=>{c({...a,label:_aBase+" ("+(_effMap[eff]||eff)+")",effort:eff})};let _handleEdit=l=>{l?.stopPropagation?.();l?.preventDefault?.();if(typeof window.openAddModelModal==="function"){window.openAddModelModal(a?.provider,_aBase||a?.displayName||a?.name)}else if(b)b(a)};if(_supportsEffort){return B.createElement(${menuRoot},{title:_aBase},B.createElement(${menuTrigger},{"data-testid":"model-selector-custom-item","data-model-label":_aBase,selected:_isSel,disabled:g,onClick:()=>{g||_setEffort(_currEffort)}},B.createElement("span",{"data-testid":"model-selector-effort-group","data-model-base":_aBase,className:"truncate text-xs text-left"},_aBase),B.createElement("span",{className:"shrink-0 opacity-70 text-xs"},_effMap[_currEffort]||_currEffort),B.createElement(${modelOptionComp},{option:a})),B.createElement(${menuContent},{side:"right",align:"start",className:"min-w-40 p-1 max-h-[min(360px,70vh)] overflow-y-auto custom-scrollbar"},_efforts.map(eff=>B.createElement(${menuItem},{key:eff,selected:_isSel&&_currEffort===eff,onClick:()=>{_setEffort(eff)}},B.createElement("span",{"data-testid":"model-selector-effort-option","data-effort":eff},_effMap[eff]||eff))),k&&B.createElement("div",{className:"pt-1 border-t border-border/40 mt-1"},B.createElement(${menuItem},{onClick:_handleEdit,className:"text-xs text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1.5 px-2 py-1 rounded"},B.createElement(${iconComp},{name:"edit",size:12}),B.createElement("span",null,"Edit Model...")))));}return B.createElement("div",{className:"group relative"},B.createElement(${menuItem},{"data-testid":"model-selector-custom-item","data-model-label":a.label,selected:f,disabled:g,className:"pr-8",onClick:()=>{g||c(a)}},B.createElement("span",{className:"flex items-center gap-1.5 min-w-0"+(g?" text-muted-foreground":"")},B.createElement("span",{className:"truncate text-xs text-left"},a.label),B.createElement(${modelOptionComp},{option:a}))),k&&B.createElement(B.Fragment,null,B.createElement("button",{type:"button",tabIndex:-1,"data-tooltip-id":h,"aria-label":"Edit Model",className:"absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center rounded p-1 opacity-0 transition-opacity hover:bg-secondary group-hover:opacity-100 z-20 cursor-pointer",onClick:_handleEdit},B.createElement(${iconComp},{name:"edit",size:12})),B.createElement(${tipComp},{id:h},"Edit Model")));};`;
        jsCode = jsCode.slice(0, ogcStart) + ogcReplacement + jsCode.slice(ogcEnd);
      }
    }
  }

  // 9. Context un-gating
  jsCode = jsCode.replace('supportsCustomModels:a.supportsCustomModels??!1,showCustomModelHeader:a.showCustomModelHeader??!1', 'supportsCustomModels:!0,showCustomModelHeader:!0');
  jsCode = jsCode.replace('customModels:a.customModels??[]', `customModels:((a.customModels&&a.customModels.length>0)?a.customModels:${loaderVar}({customModels:{}}))`);

  // 10. Caller site container un-gating & dynamic hooks injection (bounded fast match)
  const callerIdx = jsCode.indexOf('min-w-0 no-focus-agent-input');
  if (callerIdx !== -1) {
    const slice = jsCode.slice(Math.max(0, callerIdx - 400), callerIdx + 120);
    const callerRegex = /([a-zA-Z0-9_$]+)=\(0,B\.useCallback\)\(\(\)=>\{([a-zA-Z0-9_$]+)\(!1\);([a-zA-Z0-9_$]+)\("add"\);([a-zA-Z0-9_$]+)\(void 0\);([a-zA-Z0-9_$]+)\(!0\)\},\[\2\]\),([a-zA-Z0-9_$]+)=\(0,B\.useCallback\)\(([a-zA-Z0-9_$]+)=>\{\2\(!1\);\3\("edit"\);\4\(\7\.label\);\5\(!0\)\},\[\2\]\),([a-zA-Z0-9_$]+)=\(0,B\.useCallback\)\(\(\)=>\{\5\(!1\);\4\(void 0\)\},\[\]\),\{isGoogleInternal:([a-zA-Z0-9_$]+)\}=([a-zA-Z0-9_$]+)\(\)\.product,([a-zA-Z0-9_$]+)=([a-zA-Z0-9_$]+)\(\)\?\.internalModalsOnboarding\?\.CustomModelModal;\s*return\s+B\.createElement\("div",\{className:"min-w-0 no-focus-agent-input"\},B\.createElement\(([a-zA-Z0-9_$]+),\{placement:a,selectedModel:([a-zA-Z0-9_$]+),setSelectedModel:([a-zA-Z0-9_$]+)/;
    const mCaller = slice.match(callerRegex);
    if (mCaller) {
      const [
        fullMatch,
        addCb, setIsOpen, setModalOp, setModalModel, setIsModalOpen,
        editCb, editArg, closeCb,
        isGoogleInternal, getProductFn,
        customModelModal, getInternalModalsFn,
        callerComp, selectedModel, setSelectedModel
      ] = mCaller;

      const stateMatch = jsCode.slice(callerIdx, callerIdx + 1200).match(/customModelsState:([a-zA-Z0-9_$]+)/);
      const customStateVar = stateMatch ? stateMatch[1] : "D";

      const callerReplacement = `${addCb}=(0,B.useCallback)(prov=>{${setIsOpen}(!1);if(typeof window.openAddModelModal==="function"){window.openAddModelModal(typeof prov==="string"?prov:window.__agy_default_provider);return}${setModalOp}("add");${setModalModel}(void 0);${setIsModalOpen}(!0)},[${setIsOpen}]),` +
        `${editCb}=(0,B.useCallback)(${editArg}=>{${setIsOpen}(!1);if(typeof window.openAddModelModal==="function"){window.openAddModelModal(${editArg}?.provider,${editArg}?.label||${editArg}?.displayName||${editArg}?.name);return}${setModalOp}("edit");${setModalModel}(${editArg}.label);${setIsModalOpen}(!0)},[${setIsOpen}]),` +
        `${closeCb}=(0,B.useCallback)(()=>{${setIsModalOpen}(!1);${setModalModel}(void 0)},[]),` +
        `{isGoogleInternal:${isGoogleInternal}}=${getProductFn}().product,` +
        `${customModelModal}=${getInternalModalsFn}()?.internalModalsOnboarding?.CustomModelModal;` +
        `let[_dv,_sdv]=(0,B.useState)(0);` +
        `(0,B.useEffect)(()=>{` +
          `window.__agy_onModelsUpdated=()=>_sdv(w=>w+1);` +
          `window.__agy_selectSavedModel=(lbl,extName,prov)=>{${setSelectedModel}({label:lbl,value:326,isCustom:!0,customModelUrl:extName||lbl,provider:prov})};` +
          `const _iv=setInterval(()=>{_fetchCustomModelsAsync(()=>{_sdv(w=>w+1)})},3000);` +
          `return()=>{clearInterval(_iv);delete window.__agy_onModelsUpdated;delete window.__agy_selectSavedModel};` +
        `},[${setSelectedModel}]);` +
        `let _liveCustom=${loaderVar}(${customStateVar});` +
        `(0,B.useEffect)(()=>{` +
          `if(${selectedModel}){` +
            `let _isC=${selectedModel}.value===326||(typeof ${protoNs}!=="undefined"&&${protoNs}?.Model?.GOOGLE_GEMINI_INTERNAL_BYOM&&${selectedModel}.value===${protoNs}.Model.GOOGLE_GEMINI_INTERNAL_BYOM)||!!${selectedModel}.isCustom;` +
            `let _ov=_isC?(typeof _lookupCustomModelInfo==="function"?_lookupCustomModelInfo(${selectedModel}.label,${customStateVar}):void 0):void 0;` +
            `try{` +
              `_ensureHubCloudCodeUrl();` +
              `fetch("${PROXY_URL}/v1internal/selectModel",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({label:${selectedModel}.label,isCustom:_isC,override:_ov,native:!_isC})}).catch(()=>{})` +
            `}catch(_e){}` +
          `}` +
        `},[${selectedModel},${customStateVar},_dv]);` +
        `return B.createElement("div",{className:"min-w-0 no-focus-agent-input"},B.createElement(${callerComp},{placement:a,selectedModel:${selectedModel},setSelectedModel:${setSelectedModel}`;

      jsCode = jsCode.replace(fullMatch, callerReplacement);

      const callerPropsRegex = /customModels:[a-zA-Z0-9_$]+,supportsCustomModels:[a-zA-Z0-9_$]+,showCustomModelHeader:[a-zA-Z0-9_$]+/;
      jsCode = jsCode.replace(callerPropsRegex, "customModels:_liveCustom,supportsCustomModels:!0,showCustomModelHeader:!0");
    }
  }

  // 11. View Usage & Quota & showModelUsage
  jsCode = jsCode.replace('c=dk().get("inputComponent")?.showModelUsage===!0', 'c=dk().get("inputComponent")?.showModelUsage!==!1');
  jsCode = jsCode.replace('d=dk().get("inputComponent")?.showModelUsage===!0', 'd=dk().get("inputComponent")?.showModelUsage!==!1');
  jsCode = jsCode.replace('c=Sj().get("inputComponent")?.showModelUsage===!0', 'c=Sj().get("inputComponent")?.showModelUsage!==!1');
  jsCode = jsCode.replace(
    'function hoa(a){var b=a.window.trim().toLowerCase();return goa[b]?goa[b]:/^\\d+[smhd]$/.test(b)?`${b} limit`:a.displayName}',
    'function hoa(a){var b=(a?.window||"").trim().toLowerCase();return goa[b]?goa[b]:/^\\d+[smhd]$/.test(b)?`${b} limit`:a?.displayName}'
  );
  jsCode = jsCode.replace(
    'function Ml(a){var b=a.window.trim().toLowerCase();return Fma[b]?Fma[b]:/^\\d+[smhd]$/.test(b)?`${b} limit`:a.displayName}',
    'function Ml(a){var b=(a?.window||"").trim().toLowerCase();return Fma[b]?Fma[b]:/^\\d+[smhd]$/.test(b)?`${b} limit`:a?.displayName}'
  );
  jsCode = jsCode.replace(
    'function ioa(a){var b=a.remaining.case==="remainingFraction"?a.remaining.value:void 0,c=a.resetTime?bf(a.resetTime):void 0;if(a.description)if(c){{let k=c.getTime()-Date.now();k<=0?c={days:0,hours:0,mins:0,diffMs:k}:(c=Math.floor(k/6E4),c={days:Math.floor(c/1440),hours:Math.floor(c%1440/60),mins:c%60,diffMs:k})}var {days:d,hours:f,mins:g,diffMs:h}=c;c=h<=0?"Resets in <1m":`Resets in ${d>0?f>0?`${d}d ${f}h`:`${d}d`:f>0?g>0?`${f}h ${g}m`:`${f}h`:g>0?`${g}m`:"<1m"`}}else c=void 0;else c=void 0;return{remainingFraction:b,\nrefreshText:a.description||"",subtext:c,disabled:a.disabled??!1}}',
    'function ioa(a){var b=a?.remaining?.case==="remainingFraction"?a.remaining.value:(a?.remainingFraction??a?.remaining?.value),c=a?.resetTime?bf(a.resetTime):void 0;if(a?.description)if(c){{let k=c.getTime()-Date.now();k<=0?c={days:0,hours:0,mins:0,diffMs:k}:(c=Math.floor(k/6E4),c={days:Math.floor(c/1440),hours:Math.floor(c%1440/60),mins:c%60,diffMs:k})}var {days:d,hours:f,mins:g,diffMs:h}=c;c=h<=0?"Resets in <1m":`Resets in ${d>0?f>0?`${d}d ${f}h`:`${d}d`:f>0?g>0?`${f}h ${g}m`:`${f}h`:g>0?`${g}m`:"<1m"`}}else c=a.description;else c=void 0;return{remainingFraction:b,refreshText:a?.description||"",subtext:c,disabled:a?.disabled??!1}}'
  );
  jsCode = jsCode.replace(
    'function Gma(a){var b=a.remaining.case==="remainingFraction"?a.remaining.value:void 0,c=a.resetTime?Qe(a.resetTime):void 0;if(a.description)if(c){{let k=c.getTime()-Date.now();k<=0?c={days:0,hours:0,mins:0,diffMs:k}:(c=Math.floor(k/6E4),c={days:Math.floor(c/1440),hours:Math.floor(c%1440/60),mins:c%60,diffMs:k})}var {days:d,hours:f,mins:g,diffMs:h}=c;c=h<=0?"Resets in <1m":`Resets in ${d>0?f>0?`${d}d ${f}h`:`${d}d`:f>0?g>0?`${f}h ${g}m`:`${f}h`:g>0?`${g}m`:"<1m"`}}else c=void 0;else c=void 0;return{remainingFraction:b,\nrefreshText:a.description||"",subtext:c,disabled:a.disabled??!1}}',
    'function Gma(a){var b=a?.remaining?.case==="remainingFraction"?a.remaining.value:(a?.remainingFraction??a?.remaining?.value),c=a?.resetTime?Qe(a.resetTime):void 0;if(a?.description)if(c){{let k=c.getTime()-Date.now();k<=0?c={days:0,hours:0,mins:0,diffMs:k}:(c=Math.floor(k/6E4),c={days:Math.floor(c/1440),hours:Math.floor(c%1440/60),mins:c%60,diffMs:k})}var {days:d,hours:f,mins:g,diffMs:h}=c;c=h<=0?"Resets in <1m":`Resets in ${d>0?f>0?`${d}d ${f}h`:`${d}d`:f>0?g>0?`${f}h ${g}m`:`${f}h`:g>0?`${g}m`:"<1m"`}}else c=a.description;else c=void 0;return{remainingFraction:b,refreshText:a?.description||"",subtext:c,disabled:a?.disabled??!1}}'
  );
  jsCode = jsCode.replace(
    'var g=a.retrieveUserQuotaSummary(void 0,b).then(h=>{h=h.response?.groups??[];f>=r1b&&(r1b=f,yY=h,p1b=Date.now());return h}).catch(()=>yY??[]).finally(()=>{zY===g&&(zY=void 0,AY=!1)});return zY=g',
    `let _gFetch=a.retrieveUserQuotaSummary(void 0,b).then(h=>h.response?.groups??[]).catch(()=>[]);let _bFetch=fetch("${PROXY_URL}/v1internal/quotaSummary").then(x=>x.json()).then(d=>d.groups||[]).catch(()=>[]);var g=Promise.all([_gFetch,_bFetch]).then(([gG,bG])=>{let h=(gG||[]).slice();for(const bg of(bG||[])){if(!h.some(m=>m.displayName===bg.displayName))h.push(bg)}f>=r1b&&(r1b=f,yY=h,p1b=Date.now());return h}).catch(()=>yY??[]).finally(()=>{zY===g&&(zY=void 0,AY=!1)});return zY=g`
  );
  jsCode = jsCode.replace(
    'var g=a.retrieveUserQuotaSummary(void 0,b).then(h=>{h=h.response?.groups??[];f>=xRb&&(xRb=f,oZ=h,vRb=Date.now());return h}).catch(()=>oZ??[]).finally(()=>{pZ===g&&(pZ=void 0,qZ=!1)});return pZ=g',
    `let _gFetch=a.retrieveUserQuotaSummary(void 0,b).then(h=>h.response?.groups??[]).catch(()=>[]);let _bFetch=fetch("${PROXY_URL}/v1internal/quotaSummary").then(x=>x.json()).then(d=>d.groups||[]).catch(()=>[]);var g=Promise.all([_gFetch,_bFetch]).then(([gG,bG])=>{let h=(gG||[]).slice();for(const bg of(bG||[])){if(!h.some(m=>m.displayName===bg.displayName))h.push(bg)}f>=xRb&&(xRb=f,oZ=h,vRb=Date.now());return h}).catch(()=>oZ??[]).finally(()=>{pZ===g&&(pZ=void 0,qZ=!1)});return pZ=g`
  );

  // 12. Settings Models & Usage page BYOK Card
  const settingsTarget = 'description:"Manage your model quota and credits."},';
  const settingsReplacement = settingsTarget + 'B.createElement("div",{key:"_byok_cost_cfg",className:"mb-4 rounded-lg border border-border/50 bg-secondary/20 p-3"},B.createElement("div",{className:"flex items-center justify-between"},B.createElement("div",null,B.createElement("div",{className:"text-sm font-medium text-foreground"},"BYOK Provider & Cost Management"),B.createElement("div",{className:"text-xs text-muted-foreground"},"Manage configured custom providers, cost badges, and provider token overrides")),B.createElement("button",{type:"button",onClick:()=>{typeof window.openByokSettingsModal==="function"?window.openByokSettingsModal("cost"):(typeof window.openCostSettingsModal==="function"?window.openCostSettingsModal():(typeof window.openAddModelModal==="function"&&window.openAddModelModal(null,null,"cost")))},className:"rounded px-3 py-1 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"},"Configure BYOK..."))),';
  jsCode = jsCode.replace(settingsTarget, settingsReplacement);

  // 13. Assistant response cost & token badge (bounded fast match)
  const costIdx = jsCode.indexOf('recitations:b.recitationMetadata.recitations');
  if (costIdx !== -1) {
    const slice = jsCode.slice(Math.max(0, costIdx - 100), costIdx + 160);
    const costRegex = /b\.recitationMetadata&&([a-zA-Z0-9_$]+)===([a-zA-Z0-9_$]+)\.CortexStepStatus\.DONE&&B\.createElement\([a-zA-Z0-9_$]+,\{recitations:b\.recitationMetadata\.recitations\|\|\s*\[\]\}\),\1===\2\.CortexStepStatus\.DONE&&d!==void 0&&B\.createElement\([a-zA-Z0-9_$]+,\{stepIndex:d\}\)/;
    const mCost = slice.match(costRegex);
    if (mCost) {
      const rep = mCost[0] + `,${mCost[1]}===${mCost[2]}.CortexStepStatus.DONE&&B.createElement(AgyCostBadge,{stepIndex:d,metadata:b,responseText:h})`;
      jsCode = jsCode.replace(mCost[0], rep);
    }
  }
  // Static cost badge fallbacks
  const costTargetREa = 'b.recitationMetadata&&c===I.CortexStepStatus.DONE&&B.createElement(Bec,{recitations:b.recitationMetadata.recitations||[]}),c===I.CortexStepStatus.DONE&&d!==void 0&&B.createElement(yec,{stepIndex:d})';
  jsCode = jsCode.replace(costTargetREa, costTargetREa + ',c===I.CortexStepStatus.DONE&&B.createElement(AgyCostBadge,{stepIndex:d,metadata:b,responseText:h})');
  const costTargetQt = 'b.recitationMetadata&&c===K.CortexStepStatus.DONE&&B.createElement(i4b,{recitations:b.recitationMetadata.recitations||[]}),c===K.CortexStepStatus.DONE&&d!==void 0&&B.createElement(f4b,{stepIndex:d})';
  jsCode = jsCode.replace(costTargetQt, costTargetQt + ',c===K.CortexStepStatus.DONE&&B.createElement(AgyCostBadge,{stepIndex:d,metadata:b,responseText:h})');

  // Prepend client telemetry and AgyCostBadge and append modalCode
  const clientTelemetry = `try{window.addEventListener("error",function(e){console.error("[AGY-HUB-CLIENT-ERROR]",e.message,e.filename,e.lineno,e.colno,e.error?.stack)});window.addEventListener("unhandledrejection",function(e){console.error("[AGY-HUB-CLIENT-REJECTION]",e.reason)})}catch(_e){};\n`;
  jsCode = clientTelemetry + agyCostBadgeDef + '\n' + jsCode;
  jsCode += '\n// AGY_HUB_MAIN_PATCHED_V1\n';
  if (modalCode) {
    jsCode += '// AGY_ADD_MODEL_MODAL_INJECTED\n' + modalCode + '\n';
  }
  return jsCode;
}

const SCROLLBAR_CSS = `
/* Antigravity BYOK Model Menu Scrollbar & Panel Constraints */
/* Global: eliminate stepper buttons and arrows on all WebKit scrollbars */
::-webkit-scrollbar-button {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}

/* 1. COMPLETELY HIDE and DISABLE outer scrollbars */
.scrollbar-none,
[role="menu"],
[data-base-ui-popup],
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

/* Antigravity BYOK Custom Model Item & Edit Button */
.agy-custom-model-row {
  position: relative !important;
  width: 100% !important;
}
.agy-edit-model-btn {
  position: absolute !important;
  right: 24px !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
  width: 26px !important;
  height: 26px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: 4px !important;
  padding: 0 !important;
  opacity: 0 !important;
  transition: opacity 150ms ease, background-color 150ms ease !important;
  z-index: 50 !important;
  cursor: pointer !important;
  background: transparent !important;
  border: none !important;
  color: inherit !important;
  pointer-events: auto !important;
}
.agy-custom-model-row:hover .agy-edit-model-btn,
.group:hover .agy-edit-model-btn,
.agy-edit-model-btn:focus,
.agy-edit-model-btn:hover {
  opacity: 1 !important;
}
.agy-edit-model-btn:hover {
  background-color: rgba(255, 255, 255, 0.12) !important;
}
`;

function sendSetCloudCodeUrl(realPort, csrfToken) {
  return new Promise(resolve => {
    const body = JSON.stringify({ url: PROXY_URL });
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: realPort,
        path: '/exa.language_server_pb.LanguageServerService/SetCloudCodeURL',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'x-codeium-csrf-token': csrfToken || ''
        },
        timeout: 1500
      },
      res => {
        res.resume();
        resolve(res.statusCode === 200);
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end(body);
  });
}

function startHubInterceptor(targetPort, realPort, csrfToken) {
  return new Promise(resolve => {
    let cloudCodeUrlConfigured = false;
    let cachedPatchedMainBuf = null;

    const rewriteHeaders = headers => {
      const h = { ...headers };
      if (h.host) h.host = `127.0.0.1:${realPort}`;
      if (h.origin && h.origin.startsWith('http://127.0.0.1:')) {
        h.origin = `http://127.0.0.1:${realPort}`;
      }
      if (h.referer && h.referer.startsWith('http://127.0.0.1:')) {
        h.referer = h.referer.replace(/^http:\/\/127\.0\.0\.1:\d+/, `http://127.0.0.1:${realPort}`);
      }
      return h;
    };

    const server = http.createServer((req, res) => {
      const urlPath = req.url || '/';

      // Intercept / (index.html) to inject custom-scrollbar styles into <head>
      if (req.method === 'GET' && (urlPath === '/' || urlPath.startsWith('/?'))) {
        const upHeaders = rewriteHeaders(req.headers);
        delete upHeaders['accept-encoding'];
        delete upHeaders['if-none-match'];
        delete upHeaders['if-modified-since'];

        const upReq = http.request(
          {
            hostname: '127.0.0.1',
            port: realPort,
            path: urlPath,
            method: 'GET',
            headers: upHeaders,
            agent: false
          },
          upRes => {
            const chunks = [];
            upRes.on('data', c => chunks.push(c));
            upRes.on('end', () => {
              try {
                let html = Buffer.concat(chunks).toString('utf8');
                if (html.includes('</head>') && !html.includes('id="agy-custom-scrollbar"')) {
                  html = html.replace('</head>', `<style id="agy-custom-scrollbar">${SCROLLBAR_CSS}</style></head>`);
                }
                const buf = Buffer.from(html, 'utf8');
                res.writeHead(200, {
                  'Content-Type': 'text/html; charset=utf-8',
                  'Cache-Control': 'no-store, no-cache, must-revalidate',
                  'Pragma': 'no-cache',
                  'Content-Length': buf.length
                });
                res.end(buf);
              } catch (_err) {
                res.writeHead(upRes.statusCode || 200, upRes.headers);
                res.end(Buffer.concat(chunks));
              }
            });
          }
        );
        upReq.on('error', () => {
          if (!res.headersSent) res.writeHead(503, { 'Content-Length': '0', 'Connection': 'close' });
          res.end();
        });
        upReq.end();
        return;
      }

      // Intercept /main.js to inject BYOK UI patches
      if (req.method === 'GET' && (urlPath === '/main.js' || urlPath.startsWith('/main.js?'))) {
        sendSetCloudCodeUrl(realPort, csrfToken).then(ok => {
          if (ok) cloudCodeUrlConfigured = true;
        });

        if (cachedPatchedMainBuf) {
          res.writeHead(200, {
            'Content-Type': 'text/javascript; charset=utf-8',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Pragma': 'no-cache',
            'Content-Length': cachedPatchedMainBuf.length
          });
          res.end(cachedPatchedMainBuf);
          return;
        }

        const upHeaders = rewriteHeaders(req.headers);
        delete upHeaders['accept-encoding'];
        delete upHeaders['if-none-match'];
        delete upHeaders['if-modified-since'];

        const upReq = http.request(
          {
            hostname: '127.0.0.1',
            port: realPort,
            path: urlPath,
            method: 'GET',
            headers: upHeaders,
            agent: false
          },
          upRes => {
            const chunks = [];
            upRes.on('data', c => chunks.push(c));
            upRes.on('end', () => {
              try {
                const rawJs = Buffer.concat(chunks).toString('utf8');
                const patchedJs = patchHubMainJs(rawJs);
                cachedPatchedMainBuf = Buffer.from(patchedJs, 'utf8');
                res.writeHead(200, {
                  'Content-Type': 'text/javascript; charset=utf-8',
                  'Cache-Control': 'no-store, no-cache, must-revalidate',
                  'Pragma': 'no-cache',
                  'Content-Length': cachedPatchedMainBuf.length
                });
                res.end(cachedPatchedMainBuf);
              } catch (err) {
                const fallbackBuf = Buffer.concat(chunks);
                res.writeHead(upRes.statusCode || 200, upRes.headers);
                res.end(fallbackBuf);
              }
            });
          }
        );
        upReq.on('error', () => {
          if (!res.headersSent) res.writeHead(503, { 'Content-Length': '0', 'Connection': 'close' });
          res.end();
        });
        upReq.end();
        return;
      }

      // Intercept /compiled_tailwind.css and /styles.css to append custom-scrollbar and model row styles
      const isCssReq = req.method === 'GET' && (
        urlPath === '/compiled_tailwind.css' || urlPath.startsWith('/compiled_tailwind.css?') ||
        urlPath === '/styles.css' || urlPath.startsWith('/styles.css?')
      );
      if (isCssReq) {
        const upHeaders = rewriteHeaders(req.headers);
        delete upHeaders['accept-encoding'];
        delete upHeaders['if-none-match'];
        delete upHeaders['if-modified-since'];

        const upReq = http.request(
          {
            hostname: '127.0.0.1',
            port: realPort,
            path: urlPath,
            method: 'GET',
            headers: upHeaders,
            agent: false
          },
          upRes => {
            const chunks = [];
            upRes.on('data', c => chunks.push(c));
            upRes.on('end', () => {
              const rawCss = Buffer.concat(chunks).toString('utf8');
              const patchedCss = rawCss.includes('custom-scrollbar') ? rawCss : (rawCss + '\n' + SCROLLBAR_CSS);
              const buf = Buffer.from(patchedCss, 'utf8');
              res.writeHead(200, {
                'Content-Type': 'text/css; charset=utf-8',
                'Cache-Control': 'no-store, no-cache, must-revalidate',
                'Content-Length': buf.length
              });
              res.end(buf);
            });
          }
        );
        upReq.on('error', () => {
          if (!res.headersSent) res.writeHead(503, { 'Content-Length': '0', 'Connection': 'close' });
          res.end();
        });
        upReq.end();
        return;
      }

      // Buffer request body so async SetCloudCodeURL never drops incoming stream chunks
      const reqChunks = [];
      req.on('data', c => reqChunks.push(c));
      req.on('end', () => {
        const bodyBuf = Buffer.concat(reqChunks);
        const needsCloudCodeEnsure =
          urlPath.includes('GetAvailableModels') ||
          urlPath.includes('RetrieveUserQuotaSummary') ||
          urlPath.includes('StartCascade') ||
          urlPath.includes('SendUserCascadeMessage') ||
          urlPath.includes('SendAllQueuedMessages');

        const forwardRequest = () => {
          const upHeaders = rewriteHeaders(req.headers);
          if (bodyBuf.length > 0 && upHeaders['content-length']) {
            upHeaders['content-length'] = String(bodyBuf.length);
          }
          const upReq = http.request(
            {
              hostname: '127.0.0.1',
              port: realPort,
              path: urlPath,
              method: req.method,
              headers: upHeaders,
              agent: false
            },
            upRes => {
              if (!cloudCodeUrlConfigured && upRes.statusCode && upRes.statusCode >= 200 && upRes.statusCode < 500) {
                sendSetCloudCodeUrl(realPort, csrfToken).then(ok => {
                  if (ok) cloudCodeUrlConfigured = true;
                });
              }
              if (urlPath.includes('GetLoadCodeAssist')) {
                upRes.on('end', () => {
                  sendSetCloudCodeUrl(realPort, csrfToken);
                });
              }
              res.writeHead(upRes.statusCode || 200, upRes.headers);
              upRes.pipe(res);
            }
          );
          upReq.on('error', () => {
            if (!res.headersSent) res.writeHead(503, { 'Content-Length': '0', 'Connection': 'close' });
            res.end();
          });
          if (bodyBuf.length > 0) {
            upReq.end(bodyBuf);
          } else {
            upReq.end();
          }
        };

        if (needsCloudCodeEnsure && cloudCodeUrlConfigured) {
          sendSetCloudCodeUrl(realPort, csrfToken).finally(forwardRequest);
        } else {
          forwardRequest();
        }
      });
    });

    // Transparent WebSocket / HTTP upgrade tunnel
    server.on('upgrade', (req, clientSocket, head) => {
      sendSetCloudCodeUrl(realPort, csrfToken).then(ok => {
        if (ok) cloudCodeUrlConfigured = true;
      });

      const upstreamSocket = net.connect(realPort, '127.0.0.1', () => {
        const headers = rewriteHeaders(req.headers);
        let reqLines = `${req.method || 'GET'} ${req.url || '/'} HTTP/${req.httpVersion || '1.1'}\r\n`;
        for (const [k, v] of Object.entries(headers)) {
          if (v === undefined) continue;
          if (Array.isArray(v)) {
            for (const item of v) reqLines += `${k}: ${item}\r\n`;
          } else {
            reqLines += `${k}: ${v}\r\n`;
          }
        }
        reqLines += '\r\n';
        upstreamSocket.write(reqLines);
        if (head && head.length > 0) {
          upstreamSocket.write(head);
        }
        upstreamSocket.pipe(clientSocket);
        clientSocket.pipe(upstreamSocket);
      });

      upstreamSocket.on('error', () => {
        try { clientSocket.destroy(); } catch (_) {}
      });
      clientSocket.on('error', () => {
        try { upstreamSocket.destroy(); } catch (_) {}
      });
    });

    server.on('error', () => {
      resolve(null);
    });

    server.listen(targetPort, '127.0.0.1', () => {
      console.log(`[BYOK Hub Interceptor] Listening on 127.0.0.1:${targetPort} -> agy --hub on 127.0.0.1:${realPort}`);
      resolve(server);
    });
  });
}

module.exports = {
  resolveSymbols,
  patchHubMainJs,
  startHubInterceptor,
  sendSetCloudCodeUrl
};
