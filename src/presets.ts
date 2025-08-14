// src/presets.ts 

/**
 * Presets opzionali (subpath). Non inquinano l'entrypoint core.
 */
import { buildAllowedKeys, predicates, KeyPredicate, ReaperOptions } from './index';

/** Opzioni del preset cookie+flash */
export interface CookieFlashPresetOptions {
    /** Base keys (default: ['cookie']) */
    base?: string[];
    /** Nome chiave del flash (default: 'flash') */
    flashKey?: string;
    /** Unisci alla base? (default: true) */
    expandBase?: boolean;
    /** Max chiavi totali consentite (default: 2 → cookie + flash) */
    maxKeys?: number;
    /** Campo dentro al flash (default: 'error') */
    flashField?: string;
    /** Messaggi "login" consentiti (default: [/^please sign in\.?$/i]) */
    loginMessages?: (string | RegExp)[];
    /** Chiavi extra ammesse oltre a cookie/flash */
    extraAllowedKeys?: string[];
    /** Pattern denylist addizionali */
    disallowedKeyPatterns?: (string | RegExp)[];
    /** Predicati extra per chiavi specifiche */
    extraPredicates?: Record<string, KeyPredicate>;
    /** Regola finale cross-key opzionale */
    finalCheck?: (session: Record<string, unknown>) => boolean;
}

/** 
 * Preset “cookie + flash” beginner-friendly:
 * - allowlist: cookie + flash (più eventuali extra)
 * - maxKeys: 2 (di default)
 * - predicate per flash: {} oppure un messaggio consentito (default: "Please sign in.")
 */

export function cookieFlash(options: CookieFlashPresetOptions = {}): Partial<ReaperOptions> {
    const {
        base = ['cookie'],
        flashKey = 'flash',
        expandBase = true,
        maxKeys = 2,
        flashField = 'error',
        loginMessages = [/^please sign in\.?$/i],
        extraAllowedKeys = [],
        disallowedKeyPatterns = [],
        extraPredicates = {},
        finalCheck,
    } = options;

    const allowedKeys = buildAllowedKeys([flashKey, ...extraAllowedKeys], expandBase, base);
    const keyPredicates: Record<string, KeyPredicate> = {
        [flashKey]: predicates.flashEmptyOrOneOf(flashField, loginMessages),
        ...extraPredicates,
    };

    return {
        allowedKeys,
        maxKeys,
        keyPredicates,
        disallowedKeyPatterns,
        isSessionPrunable: finalCheck,
    };
}