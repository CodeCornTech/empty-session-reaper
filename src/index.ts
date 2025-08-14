/**
 * Empty Session Reaper — SAFE core (no app-specific keys)
 * Nessun import da Express: tipi "like" per compat massima.
 */

export type Next = (err?: unknown) => void;
export type ReqLike = { session?: any; sessionID?: string; path?: string };
export type ResLike = { on: (event: 'finish', cb: () => void) => void };
export type AppLike = { use: (...args: any[]) => unknown };

export type ReaperLogger = (msg: string, meta?: Record<string, unknown>) => void;

/** Predicate: TRUE se il valore della chiave è “innocuo” */
export type KeyPredicate = (value: unknown, session: Record<string, unknown>) => boolean;

/** Opzioni del reaper (agnostiche) */
export interface ReaperOptions {
    enabled: boolean;
    dryRun: boolean;
    logger: ReaperLogger;
    exclude: (req: ReqLike) => boolean;

    /** Allowlist di chiavi ammesse in una sessione “vuota” */
    allowedKeys: string[];

    /** Limite massimo di chiavi totali (null = nessun limite) */
    maxKeys: number | null;

    /** Regole valore-per-chiave: se presente K e predicate(K)===true → K è innocua */
    keyPredicates: Record<string, KeyPredicate>;

    /** Denylist di chiavi: se matcha, NON si pruna */
    disallowedKeyPatterns: (string | RegExp)[];

    /** Regola finale sull’intera sessione: deve restituire TRUE per potare */
    isSessionPrunable?: (session: Record<string, unknown>) => boolean;
}

/** Default neutri (nessuna policy di dominio) */
export const defaultReaperOptions: ReaperOptions = {
    enabled: true,
    dryRun: false,
    logger: () => { },
    exclude: () => false,
    allowedKeys: ['cookie'],
    maxKeys: null,
    keyPredicates: {},
    disallowedKeyPatterns: [],
    isSessionPrunable: undefined,
};

/** Middleware: distrugge sessioni “vuote” secondo le policy esterne (opts). */
export function createEmptySessionReaper(
    opts: Partial<ReaperOptions> = {}
): (req: ReqLike, res: ResLike, next: Next) => void {
    const o: ReaperOptions = { ...defaultReaperOptions, ...opts };
    const allowed = new Set<string>(o.allowedKeys);

    return function emptySessionReaper(req: ReqLike, res: ResLike, next: Next) {
        if (!o.enabled || o.exclude(req)) return next();

        res.on('finish', () => {
            const s = (req as any).session as Record<string, unknown> | undefined;
            if (!s) return;

            const keys = Object.keys(s);

            // 1) denylist
            if (o.disallowedKeyPatterns.length) {
                const hasDenied = keys.some((k) =>
                    o.disallowedKeyPatterns.some((p) => (p instanceof RegExp ? p.test(k) : k === p))
                );
                if (hasDenied) return;
            }

            // 2) allowlist
            if (!keys.every((k) => allowed.has(k))) return;

            // 3) limite quantitativo
            if (o.maxKeys !== null && keys.length > o.maxKeys) return;

            // 4) predicates per chiave
            for (const k of keys) {
                const pred = o.keyPredicates[k];
                if (typeof pred === 'function') {
                    if (!pred((s as any)[k], s)) return;
                }
            }

            // 5) regola finale cross-key
            if (typeof o.isSessionPrunable === 'function' && !o.isSessionPrunable(s)) return;

            // → pruna
            const sid = (req as any).sessionID;
            if (o.dryRun) {
                o.logger('Reaper(dry-run): would destroy empty session', { sid, keys, path: (req as any).path });
                return;
            }
            try {
                (s as any).destroy?.((err: unknown) => {
                    if (err) o.logger('Reaper: destroy error', { sid, err: String(err) });
                    else o.logger('Reaper: destroyed empty session', { sid, keys, path: (req as any).path });
                });
            } catch (err) {
                o.logger('Reaper: destroy threw', { error: String(err) });
            }
        });

        next();
    };
}

/** Wrapper stile express-session: monta e restituisce il middleware. */
export function wireEmptySessionReaper(app: AppLike, opts: Partial<ReaperOptions> = {}) {
    const mw = createEmptySessionReaper(opts);
    app.use(mw);
    return mw;
}

/** Predicates utili (autocomplete-friendly) */
export const predicates = {
    /** TRUE se oggetto plain vuoto {} */
    emptyObject: (v: unknown) => isPlainEmptyObj(v),

    /** TRUE se valore === expected */
    equals:
        (expected: unknown) =>
            (v: unknown) =>
                v === expected,

    /** TRUE se valore appartiene all'array */
    oneOf:
        <T>(arr: T[]) =>
            (v: unknown) =>
                arr.includes(v as T),

    /** Composizione AND di più predicate */
    and:
        (...ps: KeyPredicate[]) =>
            (v: unknown, s: Record<string, unknown>) =>
                ps.every((p) => p(v, s)),

    /** Composizione OR di più predicate */
    or:
        (...ps: KeyPredicate[]) =>
            (v: unknown, s: Record<string, unknown>) =>
                ps.some((p) => p(v, s)),

    /**
     * Flash-like: consente {} OPPURE un solo messaggio ammesso in `field`.
     * Default messages include: "Please sign in."
     */
    flashEmptyOrOneOf:
        (field = 'error', messages: (string | RegExp)[] = [/^please sign in\.?$/i]) =>
            (flash: unknown) => {
                if (isPlainEmptyObj(flash)) return true;
                if (!flash || typeof flash !== 'object') return false;
                const arr = Array.isArray((flash as any)[field]) ? (flash as any)[field] : [];
                if (arr.length !== 1) return false;
                const val = String(arr[0] ?? '');
                return messages.some((m) => (m instanceof RegExp ? m.test(val) : val === m));
            },
};

/**
 * Helper: costruisce una allowlist partendo da una base.
 * @param input      chiavi aggiuntive (es. ['flash'])
 * @param expandBase se TRUE, unisce `base` con `input`; se FALSE, usa solo `input`
 * @param base       base iniziale (default: ['cookie'])
 */
export function buildAllowedKeys(input: string[] = [], expandBase = true, base: string[] = ['cookie']) {
    const out = expandBase ? [...base, ...input] : input.slice();
    return Array.from(new Set(out)); // dedup
}

/* ----------------------- Session Mutation Logger ----------------------- */

export interface SessionMutationLoggerOptions {
    /** Logger; default: console.debug-like no-op */
    logger?: ReaperLogger;
    /** Salta log per certe richieste */
    exclude?: (req: ReqLike) => boolean;
    /** Includi i valori nel log (false = solo nomi chiave) */
    includeValues?: boolean;
    /** Redaction dei valori quando includeValues=true */
    redact?: (key: string, value: unknown) => unknown;
    /** Logga solo se ci sono mutazioni (default true) */
    onlyWhenMutated?: boolean;
    /** Etichetta messaggio log */
    label?: string;
}

/** Crea middleware che LOGGA le mutazioni (added/removed) delle chiavi di sessione */
export function createSessionMutationLogger(
    opts: SessionMutationLoggerOptions = {}
): (req: ReqLike, res: ResLike, next: Next) => void {
    const {
        logger = () => { },
        exclude = () => false,
        includeValues = false,
        redact = (_k, v) => v,
        onlyWhenMutated = true,
        label = 'session mutation',
    } = opts;

    return function sessionMutationLogger(req: ReqLike, res: ResLike, next: Next) {
        if (exclude(req)) return next();

        const before = snapshotKeys((req as any).session);
        const beforeVals = includeValues ? shallowValues((req as any).session) : undefined;

        res.on('finish', () => {
            const after = snapshotKeys((req as any).session);
            const afterVals = includeValues ? shallowValues((req as any).session) : undefined;

            const added = [...after].filter((k) => !before.has(k));
            const removed = [...before].filter((k) => !after.has(k));

            if (onlyWhenMutated && added.length === 0 && removed.length === 0) return;

            const meta: Record<string, unknown> = {
                path: (req as any).path,
                added,
                removed,
            };

            if (includeValues) {
                meta.before = beforeVals && redactAll(beforeVals, redact);
                meta.after = afterVals && redactAll(afterVals, redact);
            }

            logger(label, meta);
        });

        next();
    };
}

/** Monta il logger di mutazioni (cotto e mangiato) */
export function wireSessionMutationLogger(app: AppLike, opts?: SessionMutationLoggerOptions) {
    const mw = createSessionMutationLogger(opts);
    app.use(mw);
    return mw;
}

/** Alias richiesto: lookUpSessMutation(app, opts) */
export function lookUpSessMutation(app: AppLike, opts?: SessionMutationLoggerOptions) {
    return wireSessionMutationLogger(app, opts);
}

/* ------------------------------- Helpers ------------------------------- */

function isPlainEmptyObj(obj: unknown): boolean {
    if (!obj || typeof obj !== 'object') return false;
    for (const _ in obj as Record<string, unknown>) return false;
    return Object.getPrototypeOf(obj) === Object.prototype;
}

function snapshotKeys(s: any): Set<string> {
    return new Set(Object.keys(s || {}));
}
function shallowValues(s: any): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (!s || typeof s !== 'object') return out;
    for (const k of Object.keys(s)) out[k] = s[k];
    return out;
}
function redactAll(obj: Record<string, unknown>, red: (k: string, v: unknown) => unknown) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj)) out[k] = red(k, obj[k]);
    return out;
}