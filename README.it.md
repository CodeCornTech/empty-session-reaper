# 🇮🇹 README (IT) — **`README.it.md`**

---

# @codecorn/empty-session-reaper

Middleware leggero per **potare _o debuggare_ le sessioni vuote** (solo cookie + le tue regole) e mantenere snelli gli store Prisma/Redis.  
**Core agnostico** — nessuna chiave applicativa all’interno. Porta tu la policy via opzioni.

<p align="right">
  <a href="https://www.npmjs.com/package/@codecorn/empty-session-reaper">
    <img alt="npm" src="https://img.shields.io/npm/v/@codecorn/empty-session-reaper?logo=npm&label=npm">
  </a>
  <a href="https://www.npmjs.com/package/@codecorn/empty-session-reaper">
    <img alt="downloads" src="https://img.shields.io/npm/dt/@codecorn/empty-session-reaper?color=blue&label=downloads">
  </a>
  <a href="https://github.com/CodeCornTech/empty-session-reaper/stargazers">
    <img alt="stars" src="https://img.shields.io/github/stars/CodeCornTech/empty-session-reaper?style=social">
  </a>
  <a href="https://github.com/CodeCornTech/empty-session-reaper/issues">
    <img alt="issues" src="https://img.shields.io/github/issues/CodeCornTech/empty-session-reaper">
  </a>
  <a href="https://github.com/CodeCornTech/empty-session-reaper/actions">
    <img alt="CI" src="https://github.com/CodeCornTech/empty-session-reaper/actions/workflows/test.yml/badge.svg">
  </a>
  <a href="https://codecov.io/gh/CodeCornTech/empty-session-reaper">
    <img alt="coverage umbrella" src="https://img.shields.io/badge/copertura-ombrello-9cf?logo=umbrella&logoColor=white">
  </a>
  <a href="LICENSE">
    <img alt="license" src="https://img.shields.io/github/license/CodeCornTech/empty-session-reaper">
  </a>
</p>

---

## Caratteristiche

- 🧹 **Pota** le sessioni “vuote” secondo **le tue** regole.
- 🔎 **Debug** con dry-run + logger; **logger di mutazioni** opzionale.
- 🧩 **Agnostico**: allowlist, predicate e denylist — nessuna chiave hardcoded.
- 🧪 **Indipendente dallo store**: Prisma/SQL, Redis, ecc.
- ⚙️ **Predicate componibili** (`emptyObject`, `equals`, `oneOf`, `and`, `or`, `flashEmptyOrOneOf`).
- 🧰 **Preset opzionale**: `cookieFlash()` — avvio rapido.
- 🧯 **Safe**: niente env, footprint minimo.

---

## Installazione

```bash
npm i @codecorn/empty-session-reaper
```

### Import

```js
// ✅ CommonJS (require)
const {
  wireEmptySessionReaper,
  predicates,
  buildAllowedKeys,
  wireSessionMutationLogger, // opzionale
} = require("@codecorn/empty-session-reaper");
const { cookieFlash } = require("@codecorn/empty-session-reaper/presets");
```

```ts
// ✅ ESM / TypeScript
import {
  wireEmptySessionReaper,
  predicates as P,
  buildAllowedKeys,
  wireSessionMutationLogger, // opzionale
} from "@codecorn/empty-session-reaper";
import { cookieFlash } from "@codecorn/empty-session-reaper/presets";
```

---

## Uso A — “cookie + flash vuoto” (base)

```ts
// Significato di buildAllowedKeys(input, expandBase, base):
// - base: lista iniziale (default: ['cookie'])
// - input: chiavi extra consentite (es. ['flash'])
// - expandBase:
//     true  => unisce base + input  (['cookie'] + ['flash'] -> ['cookie','flash'])
//     false => usa solo input       (['flash'])
wireEmptySessionReaper(app, {
  logger: (m, meta) => console.debug(m, meta),

  allowedKeys: buildAllowedKeys(["flash"], true, ["cookie"]),
  maxKeys: 2,

  keyPredicates: { flash: P.emptyObject }, // flash innocuo se {}
});
```

## Uso B — policy avanzata (massimo controllo)

```ts
const isLoginFlash = (flash: any) => {
  if (!flash || typeof flash !== "object") return false;
  const ks = Object.keys(flash);
  if (ks.length !== 1) return false;
  const arr = Array.isArray((flash as any)[ks[0]]) ? (flash as any)[ks[0]] : [];
  return arr.length === 1 && /^please sign in\.?$/i.test(String(arr[0] || ""));
};

wireEmptySessionReaper(app, {
  logger: (m, meta) => console.debug(m, meta),

  allowedKeys: ["cookie", "flash", "url", "flag"],
  maxKeys: 4,

  disallowedKeyPatterns: [/^csrf/i, /^token/i, /^user/i],

  keyPredicates: {
    flash: (v) => P.emptyObject(v) || isLoginFlash(v),
    url: (v) => ["/", "/login", "/signin"].includes(String(v || "")),
    flag: P.oneOf([false, "auto"]),
  },

  isSessionPrunable: (s) => {
    const url = String((s as any).url || "");
    return !(/\.(env|git)\b/i.test(url) || /\/upload\/\./i.test(url));
  },
});
```

## Uso C — preset opzionale `cookieFlash`

```ts
// cookie + flash: flash è {} OPPURE un messaggio ammesso (default: "Please sign in.")
const preset = cookieFlash({
  // flashKey: 'flash',
  // flashField: 'error',
  // loginMessages: [/^please sign in\.?$/i, /^access denied$/i],
  // extraAllowedKeys: ['url'],
  // maxKeys: 3,
  // disallowedKeyPatterns: [/^csrf/i, /^token/i],
  // extraPredicates: { url: (v) => ['/', '/login'].includes(String(v || '')) },
  // finalCheck: (s) => !/\.env\b/i.test(String((s as any).url || '')),
});
wireEmptySessionReaper(app, { logger: console.debug, ...preset });
```

---

## Bonus: Logger di mutazioni (capire l’origine)

```ts
// Subito dopo session(...) e prima del reaper:
wireSessionMutationLogger(app, {
  logger: (label, meta) => console.debug(label, meta),
  includeValues: false, // true per loggare anche i valori (usa redact per mascherarli)
  redact: (k, v) => (/(token|secret|pass)/i.test(k) ? "[redacted]" : v),
  label: "mutazione sessione",
});
```

> Logga `{ path, added: [...], removed: [...] }` quando le chiavi di sessione cambiano.

---

## API (core)

```txt
createEmptySessionReaper(opts) -> (req, res, next) => void
wireEmptySessionReaper(app, opts) -> middleware
buildAllowedKeys(input?: string[], expandBase?: boolean, base?: string[]) -> string[]
  - base: lista iniziale (default: ["cookie"])
  - input: chiavi extra ammesse (es. ["flash"])
  - expandBase: true = unisci; false = usa solo input

predicates:
  - emptyObject(v)
  - equals(x)
  - oneOf([a,b,c])
  - and(p1,p2,...)
  - or(p1,p2,...)
  - flashEmptyOrOneOf(field='error', messages=[/^please sign in\.?$/i])

createSessionMutationLogger(opts) -> middleware
wireSessionMutationLogger(app, opts) -> middleware
lookUpSessMutation(app, opts) -> alias di wireSessionMutationLogger
```

---

## Crediti

- **Cugggì (co-author & review)** — _PYTORCHIA FOR LIFE_
- **Federico Girolami (CodeCorn)** — Maintainer

---

## 👤 Maintainer

<div style="display: flex; justify-content: space-between; align-items: center;"> 
  <div> 
    <p><strong>👨‍💻 Federico Girolami</strong></p> 
    <p><strong>Full Stack Developer</strong> | <strong>System Integrator</strong> | <strong>Digital Solution Architect</strong> 🚀</p> 
    <p>📫 <strong>Get in Touch</strong></p> 
    <p>🌐 <strong>Website</strong>: <a href="https://codecorn.it">codecorn.it</a> *(Under Construction)*</p> 
    <p>📧 <strong>Email</strong>: <a href="mailto:f.girolami@codecorn.it">f.girolami@codecorn.it</a></p> 
    <p>🐙 <strong>GitHub</strong>: <a href="https://github.com/fgirolami29">github.com/fgirolami29</a></p> 
  </div> 
  <div style="text-align: center;">
    <a href="https://www.codecorn.it"> 
      <img src="https://codecorn.it/wp-content/uploads/2025/05/CODECORN-trasp-qhite.png" alt="Code Corn Logo"  width="250px" height="90px" style="margin-top:30px;margin-bottom:20px;"/>
    </a> 
    <a href="https://github.com/fgirolami29"> 
      <img src="https://avatars.githubusercontent.com/u/68548715?s=200&v=4" alt="Federico Girolami Avatar" style="border-radius: 50%; width: 125px; height: 125px;border: 5px solid gold" /> 
    </a> 
  </div> 
</div>

---

## 📝 License

MIT © [CodeCorn™](https://codecorn.it)

Distribuito sotto licenza [MIT](LICENSE).

---

### 🤝 Contribuisci

Pull request benvenute. Per grosse modifiche apri una issue prima di iniziare.

> Powered by CodeCorn™ 🚀
