'use strict';

// Knowledge composer — builds the structured system prompt for AI
// surfaces (inbox-drafts, consult/advisory, pending-actions, etc.).
//
// Direct port of friday-gms/src/services/knowledge-composer.ts.
// Behaviour is identical; conversion is purely TS → CommonJS plus a
// few defensive tweaks for runtime safety. The on-disk KB schema
// (knowledge/index.json + per-surface SKILL.md files + lazy-loadable
// .md fragments + properties/*.json) was copied verbatim from GMS
// at Stage 3.0 cutover (2026-05-18) and frozen there.
//
// Why a structured loader instead of the old monolithic prompt:
// the FAD shadow-log analysis (P0.1, 2026-05-18) showed this pattern
// produces 70-78% fewer tokens per call (avg 18K vs 60-83K) with
// strictly more named rule coverage. That's the entire reason
// Stage 3 is FAD-native at all — we want the cost + coverage win
// permanently.
//
// Three-stage loading per surface:
//   1. always_load: globals (critical-rules, brand-voice, etc.)
//   2. surface_skill: the SKILL.md for this specific surface
//   3. lazy_loadable: per-skill rule fragments included only when a
//      keyword-trigger regex matches the runtime signals/context_text
//
// Plus the per-property knowledge card (properties/<code>.json), if
// the surface declares property_card: 'required' or 'optional'.
//
// Output: a single `system_message` string + metadata for telemetry
// (which skills loaded, which skipped, token estimate, property code).

const fs = require('fs');
const path = require('path');

/**
 * Supported surface keys. Mirrors GMS — keep in sync if either side
 * adds a surface.
 * @typedef {'inbox-drafts' | 'inbox-advisory' | 'pending-actions' | 'inquiry-followup' | 'learning-analyzer' | 'ops-consult' | 'reservations-calendar' | 'properties-assistant' | 'owner-enquiry'} SurfaceKey
 */

/**
 * @typedef {Object} ComposerOptions
 * @property {string} [property_code]
 * @property {string[]} [task_signals]
 * @property {string} [context_text]
 * @property {string} [trace_id]
 */

/**
 * @typedef {Object} ComposedContext
 * @property {string} system_message
 * @property {{
 *   surface: SurfaceKey,
 *   loaded_skills: string[],
 *   skipped_skills: string[],
 *   token_estimate: number,
 *   property_code: string | null,
 * }} metadata
 */

function stripFrontmatter(content) {
  const match = content.match(/^---\s*\n[\s\S]*?\n---\s*\n/);
  if (match && match.index === 0) {
    return content.slice(match[0].length);
  }
  return content;
}

// Escape a string for safe inclusion in a regex character literal.
// Mirrors GMS's inline regex-escape in the lazy_loadable trigger path.
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

class KnowledgeComposer {
  /**
   * @param {string} knowledgeDir - absolute path to the KB root
   *   (e.g. `<repo>/backend/knowledge`).
   */
  constructor(knowledgeDir) {
    this.knowledgeDir = knowledgeDir;
    this.skillCache = new Map();
    this.registry = this.loadRegistry();
    this.warmCache();
  }

  loadRegistry() {
    const indexPath = path.join(this.knowledgeDir, 'index.json');
    if (!fs.existsSync(indexPath)) {
      throw new Error(`Registry not found: ${indexPath}`);
    }
    const raw = fs.readFileSync(indexPath, 'utf-8');
    return JSON.parse(raw);
  }

  warmCache() {
    const surfaces = Object.values(this.registry.surfaces || {});
    const pathsToCache = new Set();

    for (const cfg of surfaces) {
      for (const skillPath of cfg.always_load || []) {
        pathsToCache.add(path.join(skillPath, 'SKILL.md'));
      }
      if (cfg.surface_skill) {
        pathsToCache.add(path.join(cfg.surface_skill, 'SKILL.md'));
        for (const lazyName of Object.keys(cfg.lazy_loadable || {})) {
          pathsToCache.add(path.join(cfg.surface_skill, `${lazyName}.md`));
        }
      }
    }

    for (const relPath of pathsToCache) {
      const fullPath = path.join(this.knowledgeDir, relPath);
      if (fs.existsSync(fullPath)) {
        const raw = fs.readFileSync(fullPath, 'utf-8');
        this.skillCache.set(relPath, stripFrontmatter(raw));
      }
    }
  }

  readSkill(relPath) {
    const cached = this.skillCache.get(relPath);
    if (cached !== undefined) return cached;

    const fullPath = path.join(this.knowledgeDir, relPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Skill file not found: ${fullPath}`);
    }
    const raw = fs.readFileSync(fullPath, 'utf-8');
    const body = stripFrontmatter(raw);
    this.skillCache.set(relPath, body);
    return body;
  }

  /**
   * Compose the system message for a given surface.
   *
   * @param {SurfaceKey} surface
   * @param {ComposerOptions} [options]
   * @returns {ComposedContext}
   */
  load(surface, options = {}) {
    const cfg = this.registry.surfaces?.[surface];
    if (!cfg) throw new Error(`Unknown surface: ${surface}`);

    const blocks = [];
    const loaded = [];
    const skipped = [];

    // Stage 2 — always-load globals
    for (const skillPath of cfg.always_load || []) {
      const body = this.readSkill(path.join(skillPath, 'SKILL.md'));
      blocks.push(`## ${skillPath}\n\n${body}\n\n`);
      loaded.push(skillPath);
    }

    // Surface SKILL.md is always loaded
    if (cfg.surface_skill) {
      const surfaceSkillPath = path.join(cfg.surface_skill, 'SKILL.md');
      const surfaceBody = this.readSkill(surfaceSkillPath);
      blocks.push(`## ${cfg.surface_skill}\n\n${surfaceBody}\n\n`);
      loaded.push(cfg.surface_skill);
    }

    // Stage 3 — lazy-loadables driven by trigger regex on the runtime
    // signals + context. 'always' = unconditionally loaded; 'trigger:X|Y'
    // = load only if any of those keywords appear in signalsText.
    const signalsText =
      (options.task_signals || []).join(' ') + ' ' + (options.context_text || '');
    for (const [lazyName, trigger] of Object.entries(cfg.lazy_loadable || {})) {
      if (trigger === 'always') {
        const body = this.readSkill(path.join(cfg.surface_skill, `${lazyName}.md`));
        blocks.push(`## ${cfg.surface_skill}/${lazyName}\n\n${body}\n\n`);
        loaded.push(lazyName);
      } else if (typeof trigger === 'string' && trigger.startsWith('trigger:')) {
        const pattern = trigger.slice('trigger:'.length);
        const keywords = pattern.split('|').map((k) => k.trim()).filter(Boolean);
        if (keywords.length === 0) {
          skipped.push(lazyName);
          continue;
        }
        const regex = new RegExp(keywords.map(escapeRegExp).join('|'), 'i');
        if (regex.test(signalsText)) {
          const body = this.readSkill(path.join(cfg.surface_skill, `${lazyName}.md`));
          blocks.push(`## ${cfg.surface_skill}/${lazyName}\n\n${body}\n\n`);
          loaded.push(lazyName);
        } else {
          skipped.push(lazyName);
        }
      }
    }

    // Property card
    let propertyCode = null;
    if (cfg.property_card === 'required') {
      if (!options.property_code) {
        throw new Error(`property_code is required for surface '${surface}'`);
      }
      propertyCode = options.property_code;
      const propPath = path.join('properties', `${propertyCode}.json`);
      const propBody = this.readSkill(propPath);
      blocks.push(`## property:${propertyCode}\n\n${propBody}\n\n`);
      loaded.push(`property:${propertyCode}`);
    } else if (cfg.property_card === 'optional' && options.property_code) {
      propertyCode = options.property_code;
      const propPath = path.join('properties', `${propertyCode}.json`);
      const propBody = this.readSkill(propPath);
      blocks.push(`## property:${propertyCode}\n\n${propBody}\n\n`);
      loaded.push(`property:${propertyCode}`);
    } else if (cfg.property_card === false && options.property_code) {
      throw new Error(`property_code not accepted for surface '${surface}'`);
    }

    const systemMessage = blocks.join('');
    // Rough token estimate — ~4 chars per token is the standard
    // English-on-Latin-script heuristic. Used for telemetry only;
    // the actual provider tokenizer (Kimi/Anthropic) does the real
    // accounting at call time.
    const tokenEstimate = Math.ceil(systemMessage.length / 4);

    return {
      system_message: systemMessage,
      metadata: {
        surface,
        loaded_skills: loaded,
        skipped_skills: skipped,
        token_estimate: tokenEstimate,
        property_code: propertyCode,
      },
    };
  }

  // Re-read the registry + clear caches. Use after editing KB files
  // on disk without restarting the backend (dev convenience; prod
  // gets fresh state on pm2 restart).
  reload() {
    this.registry = this.loadRegistry();
    this.skillCache.clear();
    this.warmCache();
  }
}

// Singleton — initialised lazily on first use so unit tests can use
// a custom knowledgeDir.
let _singleton = null;
function defaultComposer() {
  if (!_singleton) {
    const dir = process.env.KNOWLEDGE_DIR
      || path.join(__dirname, '..', '..', 'knowledge');
    _singleton = new KnowledgeComposer(dir);
  }
  return _singleton;
}

module.exports = {
  KnowledgeComposer,
  defaultComposer,
  stripFrontmatter,
};
