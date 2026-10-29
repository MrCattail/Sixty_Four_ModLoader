'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { loadTranslationFixture, createPanelTranslationRuntime } = require('./helpers/translation-contract-fixtures.js')
const source = fs.readFileSync(path.join(__dirname, '../loader.js'), 'utf8')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loader-catalog-contract-'))
const file = path.join(root, 'translations.json')
let checks = 0
try {
    const make = language => createPanelTranslationRuntime(source, { catalogPath: file, language })
    const missing = make('en')
    assert.equal(missing.read(), null)
    assert.equal(missing.t('searchHint'), missing.text.en.searchHint)
    assert.equal(fs.existsSync(file), false, 'missing optional catalog must not be created by verification')
    checks++
    const old = process.env.MODLOADER_OLD_CATALOG_PATH
        ? JSON.parse(fs.readFileSync(process.env.MODLOADER_OLD_CATALOG_PATH, 'utf8'))
        : { version: 1, languages: { en: { modloader: { close: 'Old close' } }, sch: { modloader: { close: '旧关闭' } } } }
    const scenarios = [old, { version: 1, languages: { en: { modloader: { searchHint: 'My search wording', close: 'My close' } }, fr: { modloader: { searchHint: 'Mon texte', shortcutTips: '' } } } }, loadTranslationFixture()]
    for (const catalog of scenarios) {
        fs.writeFileSync(file, JSON.stringify(catalog), 'utf8')
        const before = fs.readFileSync(file)
        for (const language of ['en', 'sch', 'fr', ...Object.keys(catalog.languages)]) {
            const runtime = make(language)
            runtime.read({ force: true })
            const panelLanguage = language === 'sch' || language === 'modsch' ? 'sch' : language === 'tch' ? 'tch' : 'en'
            for (const key of ['searchHint', 'shortcutTips', 'close', 'descriptionDisplayMode', 'darkMode']) {
                const group = catalog.languages[language] || catalog.languages[panelLanguage]
                const expected = group?.modloader?.[key] || runtime.text[panelLanguage]?.[key] || runtime.text.en[key] || key
                assert.equal(runtime.t(key), expected, `${language}.${key} honors override or built-in fallback`)
                checks++
            }
        }
        assert.deepEqual(fs.readFileSync(file), before, 'verification must preserve user catalog bytes')
    }
    fs.writeFileSync(file, '{ broken json')
    const invalid = make('en')
    assert.throws(() => invalid.read({ force: true }))
    assert.equal(invalid.read({ force: true, silent: true }), null)
    assert.equal(invalid.issues.length, 1)
    assert.equal(fs.readFileSync(file, 'utf8'), '{ broken json', 'bad user input is reported, never overwritten')
    checks++
    const good = loadTranslationFixture()
    fs.writeFileSync(file, JSON.stringify(good))
    const removed = make('sch')
    removed.read({ force: true })
    fs.unlinkSync(file)
    assert.equal(removed.read({ force: true }), null)
    assert.equal(removed.t('searchHint'), removed.text.sch.searchHint)
    assert.equal(fs.existsSync(file), false)
    checks++
    console.log(`Translation catalog compatibility passed: ${checks} checks; missing, old, custom, invalid and removed overrides, no write-back.`)
} finally {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()))
    fs.rmSync(root, { recursive: true, force: true })
}
