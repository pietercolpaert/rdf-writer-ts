#!/usr/bin/env node
'use strict';

/**
 * Extracts the declarative writer test cases of N3.js (shouldSerialize and the testRelativizes table in
 * test/N3Writer-test.js) into test/fixtures/n3-writer-cases.json, for test/n3-compat.test.ts.
 *
 * Usage: node scripts/extract-n3-writer-tests.cjs [path/to/N3.js]
 *
 * The N3.js repository must have been built (its lib/ folder is used to turn term ids into terms).
 * N3.js is © Ruben Verborgh and contributors, MIT licensed.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const n3Root = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'N3.js'));
const n3 = require(path.join(n3Root, 'lib'));
const testFile = path.join(n3Root, 'test', 'N3Writer-test.js');
const outFile = path.join(__dirname, '..', 'test', 'fixtures', 'n3-writer-cases.json');

// Only the part before the helper functions contains test declarations; the local testRelativizes helper is
// replaced by a recording one.
let source = fs.readFileSync(testFile, 'utf8');
source = source.slice(0, source.indexOf('\nfunction shouldSerialize('));
source = source.replaceAll(/^import[\s\S]*?;$/gmu, '');
source = source.replace('function testRelativizes(', 'function unusedTestRelativizes(');

function termToJson(term) {
  switch (term.termType) {
    case 'Literal':
      return {
        termType: 'Literal',
        value: term.value,
        language: term.language,
        direction: term.direction || '',
        datatype: term.datatype.value,
      };
    case 'Quad':
      return {
        termType: 'Quad',
        subject: termToJson(term.subject),
        predicate: termToJson(term.predicate),
        object: termToJson(term.object),
        graph: termToJson(term.graph),
      };
    default:
      return { termType: term.termType, value: term.value };
  }
}

function toTerm(item) {
  return typeof item === 'string' ? n3.termFromId(item) : item;
}

const cases = [];
const describePath = [];
const marker = Symbol('case');

class Stub {}

const globals = {
  Writer: Stub,
  Parser: Stub,
  NamedNode: n3.NamedNode,
  BlankNode: n3.BlankNode,
  Literal: n3.Literal,
  Quad: n3.Quad,
  termFromId: n3.termFromId,
  // eslint-disable-next-line import/no-dynamic-require
  namespaces: require(path.join(n3Root, 'lib', 'IRIs.js')).default,
  expect: () => new Proxy(() => {}, { get: () => () => {} }),
  describe(name, body) {
    describePath.push(name);
    body();
    describePath.pop();
  },
  it(name, body) {
    if (body && body[marker]) {
      cases.push({ suite: describePath.slice(2).join(' › '), name, ...body[marker] });
    }
  },
  shouldSerialize(...args) {
    const expected = args.pop();
    const options = args.length > 0 && !Array.isArray(args[0]) ? args.shift() : {};
    const serializedOptions = JSON.parse(JSON.stringify(options, (key, value) =>
      (value && typeof value === 'object' && 'termType' in value ? { termType: value.termType, value: value.value } : value)));
    const quads = args.map(item => {
      const terms = item.map(toTerm);
      const quad = new n3.Quad(terms[0], terms[1], terms[2], terms[3]);
      return [ quad.subject, quad.predicate, quad.object, quad.graph ].map(termToJson);
    });
    const recorded = () => recorded;
    recorded[marker] = { kind: 'serialize', options: serializedOptions, quads, expected };
    return recorded;
  },
  testRelativizes(baseIRI, ...relativizations) {
    for (const { input, expected } of relativizations) {
      cases.push({ suite: `relativization › baseIRI ${baseIRI}`, name: `relativizes <${input}>`, kind: 'relativize',
        baseIRI, input, expected });
    }
  },
};

// eslint-disable-next-line no-new-func
new Function(...Object.keys(globals), source)(...Object.values(globals));

let commit = 'unknown';
try {
  commit = execSync('git rev-parse HEAD', { cwd: n3Root }).toString().trim();
} catch {
  // Not a git checkout
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify({
  source: 'https://github.com/rdfjs/N3.js/blob/main/test/N3Writer-test.js',
  license: 'MIT, © Ruben Verborgh and N3.js contributors',
  commit,
  cases,
}, null, 1)}\n`);
console.log(`Extracted ${cases.length} cases to ${path.relative(process.cwd(), outFile)}`);
