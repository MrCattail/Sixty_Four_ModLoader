'use strict'
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function loadTranslationFixture() {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/panel-translations-v0.5.0.json'), 'utf8'))
}

// Execute the actual Loader selection/read functions without booting Electron.
function createPanelTranslationRuntime(source, options = {}) {
    const textStart = source.indexOf('\tconst PANEL_TEXT = {')
    const textEnd = source.indexOf('\tconst TRANSLATION_CATALOG_FILE =', textStart)
    const selectionStart = source.indexOf('\tconst getLanguageVariant = function')
    const selectionEnd = source.indexOf('\tconst isLocaleObject = function', selectionStart)
    const normalize = source.match(/\tconst normalizeTranslationCatalog = function \(value\) \{[\s\S]*?\n\t\}/)
    const read = source.match(/\tconst readTranslationCatalogFromDisk = function \(options\) \{[\s\S]*?\n\t\}/)
    if (textStart < 0 || textEnd < 0 || selectionStart < 0 || selectionEnd < 0 || !normalize || !read) throw new Error('Loader translation source anchors changed')
    return vm.runInNewContext(`(() => {
        const state = { game: { language }, translationCatalog: catalog, translationCatalogMtimeMs: -1 };
        const languageVariants = new Map();
        const TRANSLATION_CATALOG_VERSION = 1;
        const getLocaleCandidates = () => [state.game.language, 'en'];
        const isLocaleObject = value => value && typeof value === 'object' && !Array.isArray(value);
        const getModFileTools = () => catalogPath ? { fs } : null;
        const getTranslationCatalogPath = () => catalogPath;
        const applyTranslationCatalogToLoadedMods = () => {};
        const issues = [];
        const addIssue = (...args) => issues.push(args);
        ${source.slice(textStart, textEnd)}
        ${source.slice(selectionStart, selectionEnd)}
        ${normalize[0]}
        ${read[0]}
        return { state, issues, text: PANEL_TEXT, t, read: readTranslationCatalogFromDisk };
    })()`, { fs, catalogPath: options.catalogPath || '', catalog: options.catalog || null, language: options.language || 'en' })
}
module.exports = { loadTranslationFixture, createPanelTranslationRuntime }
