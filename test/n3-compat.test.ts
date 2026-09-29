import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
import { Parser } from 'rdf-parser-ts';
import { describe, expect, it } from 'vitest';
import { StreamWriter, Writer, type WriterOptions, type WriterOutputStream } from '../src';

/**
 * The writer tests of N3.js (test/N3Writer-test.js): the declarative shouldSerialize and relativization cases are
 * replayed from test/fixtures/n3-writer-cases.json (extracted by scripts/extract-n3-writer-tests.cjs), and the other
 * tests are ported below. Where this writer deliberately differs from N3.js, the test says so.
 */

interface JsonTerm {
  termType: string;
  value?: string;
  language?: string;
  direction?: string;
  datatype?: string;
  subject?: JsonTerm;
  predicate?: JsonTerm;
  object?: JsonTerm;
  graph?: JsonTerm;
}

interface SerializeCase {
  suite: string;
  name: string;
  kind: 'serialize';
  options: Omit<WriterOptions, 'prefixes'> & { prefixes?: Record<string, string | JsonTerm> };
  quads: JsonTerm[][];
  expected: string;
}

interface RelativizeCase {
  suite: string;
  name: string;
  kind: 'relativize';
  baseIRI: string;
  input: string;
  expected: string;
}

const fixture = <{ commit: string; cases: (SerializeCase | RelativizeCase)[] }>JSON.parse(
  readFileSync(new URL('fixtures/n3-writer-cases.json', import.meta.url), 'utf8'),
);

const DF = new DataFactory<RDF.BaseQuad>();
const nn = (value: string): RDF.NamedNode => DF.namedNode(value);
const lit = (value: string): RDF.Literal => DF.literal(value);
const XSD_INTEGER = 'http://www.w3.org/2001/XMLSchema#integer';

function toTerm(term: JsonTerm): RDF.Term {
  switch (term.termType) {
    case 'NamedNode':
      return nn(term.value!);
    case 'BlankNode':
      return DF.blankNode(term.value);
    case 'Variable':
      return DF.variable(term.value!);
    case 'DefaultGraph':
      return DF.defaultGraph();
    case 'Literal':
      if (term.language) {
        return term.direction ?
          DF.literal(term.value!, { language: term.language, direction: <'ltr' | 'rtl'>term.direction }) :
          DF.literal(term.value!, term.language);
      }
      return DF.literal(term.value!, nn(term.datatype!));
    default:
      return DF.quad(toTerm(term.subject!), toTerm(term.predicate!), toTerm(term.object!), toTerm(term.graph!));
  }
}

/** An output stream that records whether it was ended, like the QuickStream of the N3.js tests. */
function quickStream(): WriterOutputStream & { ended: boolean; result: string } {
  const stream = {
    ended: false,
    result: '',
    write(chunk: string, _encoding?: BufferEncoding, callback?: (error?: Error | null) => void): void {
      stream.result += chunk;
      callback?.();
    },
    end(callback?: (error?: Error | null) => void): void {
      stream.ended = true;
      callback?.();
    },
  };
  return stream;
}

function collect(writer: StreamWriter): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = '';
    writer.on('data', (chunk: string) => {
      output += chunk;
    });
    writer.on('error', reject);
    writer.on('end', () => resolve(output));
  });
}

function endWriter(writer: Writer): Promise<string> {
  return new Promise((resolve, reject) => {
    writer.end((error, output) => error ? reject(error) : resolve(output ?? ''));
  });
}

/**
 * Corrected expectations, keyed by test name. N3.js writes an IRI that looks like a prefixed name with a declared
 * prefix, such as the IRI `a:bc`, as that prefixed name, which a parser reads back as another IRI
 * (`http://a.org/bc`); this writer keeps it an IRI.
 */
const CORRECTIONS: Record<string, string> = {
  'should expand prefixes when possible':
    '@prefix a: <http://a.org/>.\n@prefix b: <http://a.org/b#>.\n\n<a:bc> <b:ef> <c:bhi>.\n',
};

describe(`N3.js writer tests (${fixture.commit.slice(0, 7)})`, () => {
  describe('shouldSerialize', () => {
    for (const testCase of fixture.cases) {
      if (testCase.kind !== 'serialize') {
        continue;
      }
      const expected = CORRECTIONS[testCase.name] ?? testCase.expected;
      it(CORRECTIONS[testCase.name] ? `${testCase.name} (corrected)` : testCase.name, async() => {
        const prefixes = testCase.options.prefixes && Object.fromEntries(Object.entries(testCase.options.prefixes)
          .map(([ prefix, iri ]) => [ prefix, typeof iri === 'string' ? iri : nn(iri.value!) ]));
        const stream = quickStream();
        const writer = new Writer(stream, { ...testCase.options, prefixes });
        for (const [ s, p, o, g ] of testCase.quads) {
          await new Promise<void>((resolve, reject) => writer.addQuad(
            DF.quad(toTerm(s!), toTerm(p!), toTerm(o!), toTerm(g!)),
            error => error ? reject(error) : resolve(),
          ));
        }
        await new Promise<void>(resolve => writer.end(() => resolve()));
        expect(stream.result).toBe(expected);
        expect(stream.ended).toBe(true);
      });
    }
  });

  describe('relativization', () => {
    for (const testCase of fixture.cases) {
      if (testCase.kind !== 'relativize') {
        continue;
      }
      it(`${testCase.suite.replace('relativization › ', '')}: ${testCase.name} to <${testCase.expected}>`, async() => {
        const writer = new Writer({ baseIRI: testCase.baseIRI });
        writer.addQuad(DF.quad(nn('urn:ex:s'), nn('urn:ex:p'), nn(testCase.input)));
        const output = await endWriter(writer);
        expect(output).toBe(`<urn:ex:s> <urn:ex:p> <${testCase.expected}>.\n`);
        // Parsing the output against the same base IRI gives the original IRI again
        const parsed = <RDF.BaseQuad[]> new Parser({ baseIRI: testCase.baseIRI }).parse(output);
        expect(parsed[0]!.object.value).toBe(testCase.input);
      });
    }
  });

  describe('ported tests', () => {
    it('serializes a single triple, a single quad, and an array of triples', () => {
      const writer = new Writer();
      expect(writer.quadToString(nn('a'), nn('b'), nn('c'))).toBe('<a> <b> <c> .\n');
      expect(writer.quadToString(nn('a'), nn('b'), nn('c'), nn('g'))).toBe('<a> <b> <c> <g> .\n');
      expect(writer.quadsToString([ DF.quad(nn('a'), nn('b'), nn('c')), DF.quad(nn('d'), nn('e'), nn('f')) ]))
        .toBe('<a> <b> <c> .\n<d> <e> <f> .\n');
    });

    it('calls the done callback when ending the output stream errors', async() => {
      const writer = new Writer({
        write: () => undefined,
        end: () => {
          throw new Error('error');
        },
      });
      await expect(endWriter(writer)).rejects.toThrow('error');
    });

    it('sends output through end when no stream argument is given', async() => {
      const writer = new Writer();
      let called = false;
      writer.addQuad(DF.quad(nn('a'), nn('b'), nn('c')), () => {
        called = true;
      });
      await expect(endWriter(writer)).resolves.toBe('<a> <b> <c>.\n');
      // N3.js only calls this callback when the output is flushed; here it is called once the chunk is written
      expect(called).toBe(true);
    });

    it('respects the prefixes argument when no stream argument is given', async() => {
      const writer = new Writer({ prefixes: { a: 'b#' }});
      writer.addQuad(DF.quad(nn('b#a'), nn('b#b'), nn('b#c')));
      await expect(endWriter(writer)).resolves.toBe('@prefix a: <b#>.\n\na:a a:b a:c.\n');
    });

    it('ignores an empty prefix list', async() => {
      const writer = new Writer();
      writer.addPrefixes({});
      writer.addQuad(DF.quad(nn('b#a'), nn('b#b'), nn('b#c')));
      await expect(endWriter(writer)).resolves.toBe('<b#a> <b#b> <b#c>.\n');
    });

    it('uses a prefix for local names that begin with an underscore', async() => {
      const writer = new Writer();
      writer.addPrefix('a', 'b#');
      writer.addQuad(DF.quad(nn('b#_a'), nn('b#b'), nn('b#c'), nn('b#g')));
      await expect(endWriter(writer)).resolves.toBe('@prefix a: <b#>.\n\na:g {\na:_a a:b a:c\n}\n');
    });

    it('serializes triples of a graph with a prefix declaration in between', async() => {
      const writer = new Writer();
      writer.addQuad(DF.quad(nn('b#a'), nn('b#b'), nn('b#c')));
      writer.addPrefix('a', 'b#');
      writer.addQuad(DF.quad(nn('b#a'), nn('b#b'), nn('b#c'), nn('b#g')));
      writer.addPrefix('d', 'e#');
      writer.addQuad(DF.quad(nn('b#a'), nn('b#b'), nn('b#d'), nn('b#g')));
      await expect(endWriter(writer)).resolves.toBe('<b#a> <b#b> <b#c>.\n' +
        '@prefix a: <b#>.\n\na:g {\na:a a:b a:c\n}\n' +
        '@prefix d: <e#>.\n\na:g {\na:a a:b a:d\n}\n');
    });

    it('does not write prefixes in N-Triples mode', async() => {
      const writer = new Writer({ format: 'N-Triples', prefixes: { a: 'b#' }});
      let called = false;
      writer.addPrefix('c', 'd#');
      writer.addQuad(nn('a'), nn('b'), lit('c'));
      writer.addQuad(nn('a'), nn('b'), DF.literal('1', nn(XSD_INTEGER)));
      writer.addPrefix('e', 'f#', () => {
        called = true;
      });
      await expect(endWriter(writer)).resolves.toBe(`<a> <b> "c" .\n<a> <b> "1"^^<${XSD_INTEGER}> .\n`);
      expect(called).toBe(true);
    });

    it('uses a base IRI when given', async() => {
      const writer = new Writer({ baseIRI: 'http://example.org/foo/' });
      writer.addQuad(DF.quad(nn('http://example.org/foo/'), nn('http://example.org/foo/#b'), nn('http://example.org/foo/cdeFgh/ijk')));
      await expect(endWriter(writer)).resolves.toBe('<> <#b> <cdeFgh/ijk>.\n');
    });

    it('uses partially matching base IRIs', async() => {
      const writer = new Writer({ baseIRI: 'https://pod.example/profile/card' });
      writer.addQuad(DF.quad(
        nn('https://pod.example/profile/card#me'),
        nn('http://www.w3.org/2002/07/owl#sameAs'),
        nn('https://pod.example/profile/card-1234.ttl'),
      ));
      await expect(endWriter(writer)).resolves.toBe('<#me> <http://www.w3.org/2002/07/owl#sameAs> <card-1234.ttl>.\n');
    });

    it('accepts triples and quads with separated components', async() => {
      const triples = new Writer();
      triples.addQuad(nn('a'), nn('b'), nn('c'));
      triples.addQuad(nn('a'), nn('b'), nn('d'));
      await expect(endWriter(triples)).resolves.toBe('<a> <b> <c>, <d>.\n');
      const quads = new Writer();
      quads.addQuad(nn('a'), nn('b'), nn('c'), nn('g'));
      quads.addQuad(nn('a'), nn('b'), nn('d'), nn('g'));
      await expect(endWriter(quads)).resolves.toBe('<g> {\n<a> <b> <c>, <d>\n}\n');
    });

    it('serializes blank node property lists as objects', async() => {
      const writer = new Writer();
      writer.addQuad(nn('a1'), nn('b'), writer.blank());
      writer.addQuad(nn('a2'), nn('b'), writer.blank([]));
      writer.addQuad(nn('a3'), nn('b'), writer.blank(nn('d'), nn('e')));
      writer.addQuad(nn('a4'), nn('b'), writer.blank({ predicate: nn('d'), object: nn('e') }));
      writer.addQuad(nn('a5'), nn('b'), writer.blank([{ predicate: nn('d'), object: nn('e') }]));
      writer.addQuad(nn('a6'), nn('b'), writer.blank([
        { predicate: nn('d'), object: nn('e') },
        { predicate: nn('f'), object: lit('g') },
        { predicate: nn('h'), object: nn('i') },
      ]));
      writer.addQuad(nn('a7'), nn('b'), writer.blank([
        { predicate: nn('d'), object: nn('e') },
        { predicate: nn('d'), object: nn('f') },
        { predicate: nn('g'), object: nn('h') },
        { predicate: nn('g'), object: nn('i') },
      ]));
      await expect(endWriter(writer)).resolves.toBe('<a1> <b> [].\n<a2> <b> [].\n' +
        '<a3> <b> [ <d> <e> ].\n<a4> <b> [ <d> <e> ].\n<a5> <b> [ <d> <e> ].\n' +
        '<a6> <b> [\n  <d> <e>;\n  <f> "g";\n  <h> <i>\n].\n' +
        '<a7> <b> [\n  <d> <e>, <f>;\n  <g> <h>, <i>\n].\n');
    });

    it('serializes the same blank node as subject', async() => {
      const writer = new Writer();
      const blank = writer.blank();
      writer.addQuad(blank, nn('a'), nn('b'));
      writer.addQuad(blank, nn('c'), nn('d'));
      await expect(endWriter(writer)).resolves.toBe('[] <a> <b>;\n    <c> <d>.\n');
    });

    it('serializes nested blank nodes as objects', async() => {
      const writer = new Writer();
      writer.addQuad(nn('a1'), nn('b'), writer.blank([{ predicate: nn('d'), object: writer.blank() }]));
      writer.addQuad(nn('a2'), nn('b'), writer.blank([
        { predicate: nn('d'), object: writer.blank(nn('e'), nn('f')) },
        { predicate: nn('g'), object: writer.blank(nn('h'), lit('i')) },
      ]));
      writer.addQuad(nn('a3'), nn('b'), writer.blank([
        { predicate: nn('d'), object: writer.blank([
          { predicate: nn('g'), object: writer.blank(nn('h'), nn('i')) },
          { predicate: nn('j'), object: writer.blank(nn('k'), lit('l')) },
        ]) },
      ]));
      await expect(endWriter(writer)).resolves.toBe('<a1> <b> [\n  <d> []\n].\n' +
        '<a2> <b> [\n  <d> [ <e> <f> ];\n  <g> [ <h> "i" ]\n].\n' +
        '<a3> <b> [\n  <d> [\n  <g> [ <h> <i> ];\n  <j> [ <k> "l" ]\n]\n].\n');
    });

    it('serializes blank node property lists as subjects and graphs', async() => {
      const writer = new Writer();
      writer.addQuad(writer.blank(), nn('b'), nn('c'));
      writer.addQuad(writer.blank(nn('a'), nn('b')), nn('c'), nn('d'));
      writer.addQuad(nn('a'), nn('b'), nn('c'), writer.blank());
      await expect(endWriter(writer)).resolves.toBe('[] <b> <c>.\n[ <a> <b> ] <c> <d>.\n[] {\n<a> <b> <c>\n}\n');
    });

    it('serializes lists as objects and subjects', async() => {
      const writer = new Writer();
      writer.addQuad(nn('a1'), nn('b'), writer.list());
      writer.addQuad(nn('a2'), nn('b'), writer.list([]));
      writer.addQuad(nn('a3'), nn('b'), writer.list([ nn('c') ]));
      writer.addQuad(nn('a4'), nn('b'), writer.list([ lit('c'), lit('d'), lit('e') ]));
      writer.addQuad(writer.list([ nn('a'), lit('b') ]), nn('d'), nn('e'));
      await expect(endWriter(writer)).resolves.toBe('<a1> <b> ().\n<a2> <b> ().\n<a3> <b> (<c>).\n' +
        '<a4> <b> ("c" "d" "e").\n(<a> "b") <d> <e>.\n');
    });

    it('serializes subject and object lists passed by the lists option', async() => {
      const writer = new Writer({ lists: { l1: [ nn('c'), nn('d'), nn('e') ], l2: [ lit('c'), lit('d'), lit('e') ]}});
      writer.addQuad(DF.blankNode('l1'), nn('b'), DF.blankNode('l2'));
      writer.addQuad(nn('a3'), nn('b'), DF.blankNode('m3'));
      await expect(endWriter(writer)).resolves.toBe('(<c> <d> <e>) <b> ("c" "d" "e").\n<a3> <b> _:m3.\n');
    });

    it('writes simple triples and quads in N-Quads mode', async() => {
      const writer = new Writer({ format: 'N-Quads' });
      let called = false;
      writer.addQuad(nn('a'), nn('b'), nn('c'), () => {
        called = true;
      });
      writer.addQuad(nn('a'), nn('b'), nn('d'), nn('g'));
      await expect(endWriter(writer)).resolves.toBe('<a> <b> <c> .\n<a> <b> <d> <g> .\n');
      expect(called).toBe(true);
    });

    it('ends the output stream unless the end option is false', async() => {
      const cases: [WriterOptions, boolean][] = [[{}, true ], [{ end: true }, true ], [{ end: false }, false ]];
      for (const [ options, ended ] of cases) {
        const stream = quickStream();
        const writer = new Writer(stream, options);
        expect(stream.ended).toBe(false);
        await new Promise<void>(resolve => writer.end(() => resolve()));
        expect(stream.ended).toBe(ended);
      }
    });

    it('serializes triple terms as objects, also in quads', () => {
      const writer = new Writer();
      expect(writer.quadToString(nn('a'), nn('b'), DF.quad(DF.blankNode('b1'), nn('b'), lit('l'))))
        .toBe('<a> <b> <<(_:b1 <b> "l")>> .\n');
      expect(writer.quadToString(nn('a'), nn('b'), DF.quad(nn('a'), nn('b'), nn('c'))))
        .toBe('<a> <b> <<(<a> <b> <c>)>> .\n');
      expect(writer.quadToString(nn('a'), nn('b'), DF.quad(DF.blankNode('b1'), DF.blankNode('b2'), DF.blankNode('b3'))))
        .toBe('<a> <b> <<(_:b1 _:b2 _:b3)>> .\n');
      expect(writer.quadToString(nn('a'), nn('b'), DF.quad(nn('a'), nn('b'), nn('c')), nn('g')))
        .toBe('<a> <b> <<(<a> <b> <c>)>> <g> .\n');
    });

    it('rejects triple terms as subjects and triple terms with a graph, which N3.js writes but RDF 1.2 forbids', () => {
      const writer = new Writer();
      const tripleTerm = DF.quad(nn('a'), nn('b'), nn('c'));
      const quadTerm = DF.quad(nn('a'), nn('b'), nn('c'), nn('g'));
      expect(() => writer.quadToString(tripleTerm, nn('b'), nn('c')))
        .toThrow('RDF 1.2 does not allow triple terms as subjects');
      expect(() => writer.quadToString(nn('a'), nn('b'), quadTerm)).toThrow('RDF 1.2 triple terms cannot have a graph');
    });
  });
  describe('ported StreamWriter tests (test/N3StreamWriter-test.js)', () => {
    const quads = (...ids: string[][]): RDF.BaseQuad[] => ids.map(([ s, p, o ]) => DF.quad(nn(s!), nn(p!), nn(o!)));

    for (const [ name, input, expected ] of <[string, RDF.BaseQuad[], string][]>[
      [ 'serializes 0 triples', [], '' ],
      [ 'serializes 1 triple', quads([ 'abc', 'def', 'ghi' ]), '<abc> <def> <ghi>.\n' ],
      [
        'serializes 3 triples',
        quads([ 'abc', 'def', 'ghi' ], [ 'jkl', 'mno', 'pqr' ], [ 'stu', 'vwx', 'yz' ]),
        '<abc> <def> <ghi>.\n<jkl> <mno> <pqr>.\n<stu> <vwx> <yz>.\n',
      ],
    ]) {
      it(name, async() => {
        const writer = new StreamWriter();
        expect(writer.import(Readable.from(input, { objectMode: true }))).toBe(writer);
        await expect(collect(writer)).resolves.toBe(expected);
      });
    }

    it('uses prefixes when possible', async() => {
      const writer = new StreamWriter({ prefixes: { a: 'http://a.org/', b: nn('http://a.org/b#'), c: 'http://a.org/b' }});
      writer.import(Readable.from(quads(
        [ 'http://a.org/bc', 'http://a.org/b#ef', 'http://a.org/bhi' ],
        [ 'http://a.org/bc/de', 'http://a.org/b#e#f', 'http://a.org/b#x/t' ],
        [ 'http://a.org/3a', 'http://a.org/b#3a', 'http://a.org/b#a3' ],
      ), { objectMode: true }));
      await expect(collect(writer)).resolves.toBe('@prefix a: <http://a.org/>.\n@prefix b: <http://a.org/b#>.\n' +
        '@prefix c: <http://a.org/b>.\n\na:bc b:ef a:bhi.\n' +
        '<http://a.org/bc/de> <http://a.org/b#e#f> <http://a.org/b#x/t>.\na:3a b:3a b:a3.\n');
    });

    it('takes over prefixes from the input stream', async() => {
      const input = new Readable({ objectMode: true, read: () => undefined });
      const writer = new StreamWriter();
      writer.import(input);
      const output = collect(writer);
      input.emit('prefix', 'a', nn('http://a.org/'));
      input.emit('prefix', 'b', nn('http://b.org/'));
      input.push(null);
      await expect(output).resolves.toBe('@prefix a: <http://a.org/>.\n\n@prefix b: <http://b.org/>.\n\n');
    });

    it('passes an error', () => {
      const input = new Readable({ objectMode: true, read: () => undefined });
      const writer = new StreamWriter();
      let error: Error | undefined;
      writer.on('error', (streamError: Error) => {
        error = streamError;
      });
      writer.import(input);
      input.emit('error', new Error('upstream'));
      expect(error).toBeInstanceOf(Error);
    });
  });
});
