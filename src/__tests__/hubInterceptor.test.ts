import { describe, it, expect } from 'vitest';
import * as http from 'http';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { patchHubMainJs, startHubInterceptor } = require(path.join(__dirname, '..', '..', 'hubInterceptor.js'));

describe('Hub Interceptor (Antigravity v2.6.0 agy --hub)', () => {
  it('patches hub main.js bundle with BYOK custom models, provider grouping, modal, and quota hooks', () => {
    const sampleBundle = [
      'const Qt={supported:!1,customModels:{}};',
      'PBa=a=>(a.customModels??Qt).supported;',
      'var RBa=a=>a?.customModels?Object.entries(a.customModels).map(([b,c])=>({label:b,value:c.modelId,isCustom:!0,customModelUrl:c.modelName})):[];',
      'if(f===C.Model.GOOGLE_GEMINI_INTERNAL_BYOM){if(a=(d?.customLabel?b.find(g=>g.label===d.customLabel):void 0)??b.at(0))return a}',
      'if(n===C.Model.GOOGLE_GEMINI_INTERNAL_BYOM&&p){var x=l?.customModels?l.customModels[p]:void 0;return x}',
      'lookupCustomModelInfo:f=>{f=c?.customModels?c.customModels[f]:void 0;return f}',
      'src=(a,b)=>{var c=(b=qrc(a,b))?N4(a):void 0;return b&&c?{name:b.base,effort:c.effort}:{name:a.label}};',
      'var zrc=({model:a,onEdit:b})=>{var {setSelectedModel:c,selectedModel:d}=O4(),f=d?.label===a.label,g=a.disabled??!1,h=(0,B.useId)(),k=!g&&!!b;return B.createElement("div",{className:"group relative"},B.createElement(cT,{"data-testid":"model-selector-custom-item","data-model-label":a.label,selected:f,disabled:g,className:k?"pr-8":void 0,onClick:()=>{g||c(a)}},B.createElement("span",{className:Qi("flex items-center gap-1.5 min-w-0",g?"text-muted-foreground":"")},B.createElement("span",{className:"truncate text-xs text-left"},\na.label),B.createElement(E0,{option:a}))),k&&B.createElement(B.Fragment,null,B.createElement("button",{type:"button",tabIndex:-1,"data-tooltip-id":h,"aria-label":"Edit Model",className:"absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center rounded p-1 opacity-0 transition-opacity hover:bg-secondary group-hover:opacity-100",onClick:l=>{l.stopPropagation();b?.(a)}},B.createElement(Us,{name:"edit",size:12})),B.createElement(AB,{id:h},"Edit Model")))};',
      'c=Sj().get("inputComponent")?.showModelUsage===!0;',
      'function Ml(a){var b=a.window.trim().toLowerCase();return Fma[b]?Fma[b]:/^\\d+[smhd]$/.test(b)?`${b} limit`:a.displayName}',
      'var g=a.retrieveUserQuotaSummary(void 0,b).then(h=>{h=h.response?.groups??[];f>=xRb&&(xRb=f,oZ=h,vRb=Date.now());return h}).catch(()=>oZ??[]).finally(()=>{pZ===g&&(pZ=void 0,qZ=!1)});return pZ=g',
      'g&&B.createElement(Arc,{customModels:c,onAddCustomModel:d,onEditCustomModel:f})'
    ].join('\n');

    const patched = patchHubMainJs(
      sampleBundle,
      [{ name: 'models/gpt-5.4-mini', displayName: 'GPT 5.4 Mini', provider: 'openrouter', externalModelName: 'openai/gpt-5.4-mini' }],
      'window.__testModalInjected = true;'
    );

    expect(patched).toContain('const Qt={supported:!0,customModels:{}}');
    expect(patched).toContain('PBa=a=>!0');
    expect(patched).toContain('_getDiskCustomModels');
    expect(patched).toContain('_lookupCustomModelInfo');
    expect(patched).toContain('model-selector-custom-item');
    expect(patched).toContain('model-selector-effort-group');
    expect(patched).toContain('model-selector-effort-option');
    expect(patched).toContain('openAddModelModal');
    expect(patched).toContain('if(a?.isCustom){let _reg=typeof');
    expect(patched).toContain('c=Sj().get("inputComponent")?.showModelUsage!==!1');
    expect(patched).toContain('(a?.window||"").trim().toLowerCase()');
    expect(patched).toContain('/v1internal/quotaSummary');
    expect(patched).toContain('window.__testModalInjected = true;');
    expect(patched).not.toContain('g&&B.createElement(Arc,{customModels:c,onAddCustomModel:d,onEditCustomModel:f})');
  });

  it('intercepts /main.js, /compiled_tailwind.css and /styles.css and forwards RPC requests to realPort', async () => {
    const upstreamSrv = http.createServer((req, res) => {
      if (req.url === '/main.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript' });
        res.end('const Qt={supported:!1,customModels:{}};');
        return;
      }
      if (req.url === '/compiled_tailwind.css' || req.url === '/styles.css') {
        res.writeHead(200, { 'Content-Type': 'text/css' });
        res.end('body { margin: 0; }');
        return;
      }
      if (req.url === '/exa.language_server_pb.LanguageServerService/SetCloudCodeURL') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, path: req.url }));
    });

    await new Promise<void>(resolve => upstreamSrv.listen(0, '127.0.0.1', () => resolve()));
    const realPort = (upstreamSrv.address() as { port: number }).port;

    // Pick an available port for targetPort
    const tempSrv = http.createServer();
    await new Promise<void>(resolve => tempSrv.listen(0, '127.0.0.1', () => resolve()));
    const targetPort = (tempSrv.address() as { port: number }).port;
    await new Promise<void>(resolve => tempSrv.close(() => resolve()));

    const interceptorSrv = await startHubInterceptor(targetPort, realPort, 'csrf-test');
    expect(interceptorSrv).toBeTruthy();

    try {
      const mainRes = await new Promise<string>((resolve, reject) => {
        http.get(`http://127.0.0.1:${targetPort}/main.js`, { agent: false }, res => {
          let data = '';
          res.on('data', c => (data += c));
          res.on('end', () => resolve(data));
        }).on('error', reject);
      });
      expect(mainRes).toContain('const Qt={supported:!0,customModels:{}}');
      expect(mainRes).toContain('// AGY_HUB_MAIN_PATCHED_V1');

      const tailwindRes = await new Promise<string>((resolve, reject) => {
        http.get(`http://127.0.0.1:${targetPort}/compiled_tailwind.css`, { agent: false }, res => {
          let data = '';
          res.on('data', c => (data += c));
          res.on('end', () => resolve(data));
        }).on('error', reject);
      });
      expect(tailwindRes).toContain('.custom-scrollbar');
      expect(tailwindRes).toContain('.agy-edit-model-btn');

      const cssRes = await new Promise<string>((resolve, reject) => {
        http.get(`http://127.0.0.1:${targetPort}/styles.css`, { agent: false }, res => {
          let data = '';
          res.on('data', c => (data += c));
          res.on('end', () => resolve(data));
        }).on('error', reject);
      });
      expect(cssRes).toContain('.custom-scrollbar');
      expect(cssRes).toContain('.agy-edit-model-btn');
    } finally {
      await new Promise<void>(resolve => interceptorSrv.close(() => resolve()));
      await new Promise<void>(resolve => upstreamSrv.close(() => resolve()));
    }
  });
});

