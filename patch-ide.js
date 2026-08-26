const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const appDir = path.join(process.env.LOCALAPPDATA, 'Programs', 'Antigravity IDE', 'resources', 'app');
const mainPath = path.join(appDir, 'out', 'main.js');
const wbPath = path.join(appDir, 'out', 'vs', 'workbench', 'workbench.desktop.main.js');
const productPath = path.join(appDir, 'product.json');
const lsPath = path.join(appDir, 'extensions', 'antigravity', 'bin', 'language_server_windows_x64.exe');

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

  // C. Patch DQo group builder (supports initial, effort variants, and re-patching)
  const dqoRegex = /DQo=\(t,e\)=>\{[\s\S]*?o\.options\.length>0&&r\.groups\.push\(o\)\}\),r\}\)\}/;
  const dqoReplacement = `DQo=(t,e)=>{const _custom=${customModelsJsonLiteral};let i=new Map;t.forEach(n=>{let r=wpt(n);r&&i.set(n.label,r)});for(const _m of _custom){if(!_m.name&&!_m.displayName)continue;const _lvls=(_m.reasoningEffortLevels&&_m.reasoningEffortLevels.length)?_m.reasoningEffortLevels:[null];for(const _l of _lvls){const _lbl=_l?\`\${_m.displayName||_m.name} (\${_l})\`:(_m.displayName||_m.name);if(!i.has(_lbl)){let _in=_lbl.toLowerCase(),_h=5381;for(let _k=0;_k<_in.length;_k++)_h=((_h<<5)+_h+_in.charCodeAt(_k))&4294967295;let _ph=1001+(Math.abs(_h)%350);i.set(_lbl,{label:_lbl,value:_ph,disabled:!1,supportedMimeTypes:new Map([["image/png",!0],["image/jpeg",!0]]),isCustom:!0})}}}return e.map(n=>{let r={name:n.name,groups:[]};return n.groups.forEach(s=>{let o={groupName:s.groupName,options:[]};s.modelLabels.forEach(a=>{let l=i.get(a);l&&o.options.push(l)});for(const _m of _custom){const _lvls=(_m.reasoningEffortLevels&&_m.reasoningEffortLevels.length)?_m.reasoningEffortLevels:[null];for(const _l of _lvls){const _lbl=_l?\`\${_m.displayName||_m.name} (\${_l})\`:(_m.displayName||_m.name);const _item=i.get(_lbl);if(_item&&!o.options.some(_x=>_x.label===_lbl))o.options.push(_item)}}o.options.length>0&&r.groups.push(o)}),r})}`;

  if (dqoRegex.test(wbCode)) {
    wbCode = wbCode.replace(dqoRegex, dqoReplacement);
    console.log(`   OK - workbench.desktop.main.js (DQo) patched with ${customModels.length} custom model(s)`);
  } else {
    console.warn('   WARN - DQo target not found in workbench.desktop.main.js');
  }

  // D. Patch y in wqt() so the Cascade state manager retains custom model selections without resetting
  const yRegex = /y=Re\(\(\)=>(\{const _custom=[\s\S]*?return\[\.\.\.\(o\?\.cascadeModelConfigData\?\.clientModelConfigs\|\|\[\]\)\.map\(wpt\)\.filter\(A=>A!==null\)\.filter\(A=>!A\.disabled\),[\s\S]*?\]\}|\(o\?\.cascadeModelConfigData\?\.clientModelConfigs\|\|\[\]\)\.map\(wpt\)\.filter\(A=>A!==null\)\.filter\(A=>!A\.disabled\)),\[o\?\.cascadeModelConfigData\]\)/;
  const yReplacement = `y=Re(()=>{const _custom=${customModelsJsonLiteral};const _cList=[];_custom.forEach(_m=>{const _lvls=(_m.reasoningEffortLevels&&_m.reasoningEffortLevels.length)?_m.reasoningEffortLevels:[null];_lvls.forEach(_l=>{const _lbl=_l?\`\${_m.displayName||_m.name} (\${_l})\`:(_m.displayName||_m.name);let _in=_lbl.toLowerCase(),_h=5381;for(let _k=0;_k<_in.length;_k++)_h=((_h<<5)+_h+_in.charCodeAt(_k))&4294967295;_cList.push({label:_lbl,value:1001+(Math.abs(_h)%350),disabled:!1,supportedMimeTypes:new Map([["image/png",!0],["image/jpeg",!0]]),isCustom:!0})})});return[...(o?.cascadeModelConfigData?.clientModelConfigs||[]).map(wpt).filter(A=>A!==null).filter(A=>!A.disabled),..._cList]},[o?.cascadeModelConfigData])`;

  if (yRegex.test(wbCode)) {
    wbCode = wbCode.replace(yRegex, yReplacement);
    console.log(`   OK - workbench.desktop.main.js (wqt visibleModelConfigs) patched with ${customModels.length} custom model(s)`);
  } else {
    console.warn('   WARN - yTarget not found in workbench.desktop.main.js');
  }

  // E. Patch h in Goe() provider as well
  const hRegex = /h=Re\(\(\)=>(\{const _custom=[\s\S]*?return\[\.\.\.\(e\?\.cascadeModelConfigData\?\.clientModelConfigs\|\|\[\]\)\.map\(wpt\)\.filter\(_=>_!==null\)\.filter\(_=>!_\.disabled\),[\s\S]*?\.\.\.u\]\}|\[\.\.\.\(e\?\.cascadeModelConfigData\?\.clientModelConfigs\|\|\[\]\)\.map\(wpt\)\.filter\(_=>_!==null\)\.filter\(_=>!_\.disabled\),\.\.\.u\]),\[e\?\.cascadeModelConfigData,u\]\)/;
  const hReplacement = `h=Re(()=>{const _custom=${customModelsJsonLiteral};const _cList=[];_custom.forEach(_m=>{const _lvls=(_m.reasoningEffortLevels&&_m.reasoningEffortLevels.length)?_m.reasoningEffortLevels:[null];_lvls.forEach(_l=>{const _lbl=_l?\`\${_m.displayName||_m.name} (\${_l})\`:(_m.displayName||_m.name);let _in=_lbl.toLowerCase(),_h=5381;for(let _k=0;_k<_in.length;_k++)_h=((_h<<5)+_h+_in.charCodeAt(_k))&4294967295;_cList.push({label:_lbl,value:1001+(Math.abs(_h)%350),disabled:!1,supportedMimeTypes:new Map([["image/png",!0],["image/jpeg",!0]]),isCustom:!0})})});return[...(e?.cascadeModelConfigData?.clientModelConfigs||[]).map(wpt).filter(_=>_!==null).filter(_=>!_.disabled),..._cList,...u]},[e?.cascadeModelConfigData,u])`;

  if (hRegex.test(wbCode)) {
    wbCode = wbCode.replace(hRegex, hReplacement);
    console.log(`   OK - workbench.desktop.main.js (Goe visibleModelConfigs) patched with ${customModels.length} custom model(s)`);
  }

  // F. Expand max-h on POu model selector panel so submenu is never clipped by overflow-hidden
  const pouTarget = 'POu=()=>E("div",{"data-testid":"model-selector-panel",className:"flex flex-col max-h-80 overflow-hidden outline-none"';
  const pouReplacement = 'POu=()=>E("div",{"data-testid":"model-selector-panel",className:"flex flex-col max-h-[580px] outline-none"';

  if (wbCode.includes(pouTarget)) {
    wbCode = wbCode.replace(pouTarget, pouReplacement);
    console.log('   OK - workbench.desktop.main.js (POu panel clipping fix) patched');
  } else if (wbCode.includes('max-h-[580px]')) {
    console.log('   OK - workbench.desktop.main.js (POu panel clipping fix) already patched');
  }

  fs.writeFileSync(wbPath, wbCode, 'utf8');
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
  const r2lReplacement = `function r2l(e){try{const _fs=require("fs"),_path=require("path"),_os=require("os"),_cp=_path.join(_os.homedir(),".gemini","antigravity-ide","custom_models.json");if(_fs.existsSync(_cp)){const _cm=JSON.parse(_fs.readFileSync(_cp,"utf8")),_list=Array.isArray(_cm)?_cm:(_cm.models||[]);if(!e.agentModelSorts||!e.agentModelSorts.length)e.agentModelSorts=[{displayName:"Recommended",groups:[{displayName:"",modelIds:[]}]}];const _rec=e.agentModelSorts[0].groups[0];for(const _m of _list){if(!_m.name&&!_m.displayName)continue;const _lvls=(_m.reasoningEffortLevels&&_m.reasoningEffortLevels.length)?_m.reasoningEffortLevels:[null];for(const _l of _lvls){let _raw=(_m.externalModelName||_m.name||"custom-model").replace(/^models\\//,"").replace(/[^a-zA-Z0-9]+/g,"-").replace(/^-+|-+$/g,"").toLowerCase();let _s="custom-"+_raw+(_l?"-"+_l.toLowerCase():"");let _disp=(_m.displayName||_m.name||"custom-model")+(_l?" ("+_l+")":"");let _in=_disp.toLowerCase();let _h=5381;for(let _k=0;_k<_in.length;_k++)_h=((_h<<5)+_h+_in.charCodeAt(_k))&4294967295;let _ph=1001+(Math.abs(_h)%350);e.models[_s]={displayName:_disp,model:_ph,supportsImages:!0,recommended:!0,maxTokens:1048576,maxOutputTokens:32768,supportedMimeTypes:{}};if(!_rec.modelIds.includes(_s))_rec.modelIds.push(_s)}}}}catch(_err){}const t=e.models,r=new Set;`;

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
      console.log('   OK - Language Server binary saved successfully (both endpoints)');
    } else {
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
