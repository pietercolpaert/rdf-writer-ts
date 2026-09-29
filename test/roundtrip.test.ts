import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
import { isomorphic } from 'rdf-isomorphic';
import { Parser } from 'rdf-parser-ts';
import { describe, expect, it } from 'vitest';
import { Writer, type WriterOptions } from '../src';

const DF = new DataFactory<RDF.BaseQuad>();
const EX = 'http://example.org/';
const XSD = 'http://www.w3.org/2001/XMLSchema#';

const nn = (value: string): RDF.NamedNode => DF.namedNode(value);
const q = (s: RDF.Term, p: RDF.Term, o: RDF.Term, g: RDF.Term = DF.defaultGraph()): RDF.BaseQuad => DF.quad(s, p, o, g);

function write(quads: Iterable<RDF.BaseQuad>, options: WriterOptions = {}): string {
  const writer = new Writer(options);
  writer.addQuads(quads);
  let output = '';
  writer.end((error, result) => {
    if (error) {
      throw error;
    }
    output = result!;
  });
  return output;
}

function parse(input: string, options: { baseIRI?: string; format?: string } = {}): RDF.BaseQuad[] {
  return <RDF.BaseQuad[]> new Parser(options).parse(input);
}

/** A dataset that exercises most of the writer: literals of all kinds, blank nodes, triple terms, and escapes. */
function dataset(withGraphs: boolean): RDF.BaseQuad[] {
  const graph = withGraphs ? nn(`${EX}graph`) : DF.defaultGraph();
  return [
    q(nn(`${EX}s`), nn('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), nn(`${EX}Thing`)),
    q(nn(`${EX}s`), nn(`${EX}p`), DF.literal('plain "quoted"\ttab\nnewline \\ backslash')),
    q(nn(`${EX}s`), nn(`${EX}p`), DF.literal('hello', 'en')),
    q(nn(`${EX}s`), nn(`${EX}p`), DF.literal('مرحبا', { language: 'ar', direction: 'rtl' })),
    q(nn(`${EX}s`), nn(`${EX}n`), DF.literal('42', nn(`${XSD}integer`))),
    q(nn(`${EX}s`), nn(`${EX}n`), DF.literal('-1.5', nn(`${XSD}decimal`))),
    q(nn(`${EX}s`), nn(`${EX}n`), DF.literal('6.02E23', nn(`${XSD}double`))),
    q(nn(`${EX}s`), nn(`${EX}n`), DF.literal('true', nn(`${XSD}boolean`))),
    q(nn(`${EX}s`), nn(`${EX}n`), DF.literal('not a number', nn(`${XSD}integer`))),
    q(nn(`${EX}s`), nn(`${EX}emoji`), DF.literal('smile 😀 and café')),
    q(DF.blankNode('b1'), nn(`${EX}p`), DF.blankNode('b2'), graph),
    q(nn(`${EX}ü/path`), nn(`${EX}p`), nn(`${EX}o?query=1#fragment`), graph),
    q(nn(`${EX}s`), nn(`${EX}claims`), q(nn(`${EX}a`), nn(`${EX}b`), DF.literal('c', 'nl')), graph),
  ];
}

describe('Round trips through rdf-parser-ts', () => {
  for (const [ format, withGraphs ] of <[string, boolean][]>[
    [ 'Turtle', false ],
    [ 'TriG', true ],
    [ 'N-Triples', false ],
    [ 'N-Quads', true ],
  ]) {
    it(`parses written ${format} back into the same quads`, () => {
      const quads = dataset(withGraphs);
      const output = write(quads, { format, prefixes: { ex: EX }});
      expect(isomorphic(<RDF.Quad[]>parse(output, { format }), <RDF.Quad[]>quads)).toBe(true);
    });
  }

  it('parses written RDF Messages back into the same messages', () => {
    const messages = [[ q(nn(`${EX}s1`), nn(`${EX}p`), DF.blankNode('x')) ], [], [ q(nn(`${EX}s2`), nn(`${EX}p`), DF.blankNode('x')) ]];
    for (const format of [ 'Turtle', 'N-Quads' ]) {
      const writer = new Writer({ format, rdfMessages: true });
      for (const message of messages) {
        writer.addMessage(message);
      }
      let output = '';
      writer.end((_error, result) => {
        output = result!;
      });
      const parsed = new Parser({ format }).parseMessages(output);
      expect(parsed.map(message => message.length), format).toEqual([ 1, 0, 1 ]);
    }
  });
});

describe('Base IRI shortening', () => {
  const cases: [iri: string, base: string, expected: string][] = [
    [ 'http://ex.org/a/b', 'http://ex.org/a/c', '<b>' ],
    [ 'http://ex.org/a/b/c?q#f', 'http://ex.org/a/x', '<b/c?q#f>' ],
    [ 'http://ex.org/doc', 'http://ex.org/doc#other', '<>' ],
    [ 'http://ex.org/doc#me', 'http://ex.org/doc', '<#me>' ],
    [ 'http://ex.org/doc?q#me', 'http://ex.org/doc?q#other', '<#me>' ],
    [ 'http://ex.org/doc?r', 'http://ex.org/doc?q', '<?r>' ],
    [ 'http://ex.org/doc', 'http://ex.org/doc?q', '<doc>' ],
    [ 'http://ex.org/a/', 'http://ex.org/a/?q', '<./>' ],
    [ 'http://ex.org/a/b', 'http://ex.org/a/?query', '<b>' ],
    [ 'http://ex.org/a/', 'http://ex.org/a/c', '<./>' ],
    [ 'http://ex.org/b', 'http://ex.org/a/c', '<../b>' ],
    [ 'http://ex.org/a/?q', 'http://ex.org/a/c', '<./?q>' ],
    [ 'http://ex.org/a/#f', 'http://ex.org/a/c', '<./#f>' ],
    [ 'http://ex.org/a//b', 'http://ex.org/a/c', '<.//b>' ],
    [ 'http://ex.org/a/b:c', 'http://ex.org/a/c', '<./b:c>' ],
    [ 'http://ex.org/a/b:c/d', 'http://ex.org/a/c', '<./b:c/d>' ],
    [ 'http://ex.org/a', 'http://ex.org', '<a>' ],
    // Kept, because no relative reference resolves to the same IRI, or it would not be shorter
    [ 'http://ex.org/a/../b', 'http://ex.org/a/c', '<http://ex.org/a/../b>' ],
    [ 'http://ex.org/a/./b', 'http://ex.org/a/c', '<http://ex.org/a/./b>' ],
    [ 'http://ex.org/b', 'http://ex.org/a/../c', '<http://ex.org/b>' ],
    [ 'http://ex.org', 'http://ex.org/a', '<http://ex.org>' ],
    [ 'http://other.org/a/b', 'http://ex.org/a/c', '<http://other.org/a/b>' ],
    [ 'https://ex.org/a/b', 'http://ex.org/a/c', '<https://ex.org/a/b>' ],
    [ 'http://e.org/x', 'http://e.org/a/b/c/d/e/f', '<http://e.org/x>' ],
    [ 'urn:ex:a', 'urn:ex:b', '<urn:ex:a>' ],
    [ 'http://ex.org/a/b', 'not a base', '<http://ex.org/a/b>' ],
  ];

  for (const [ iri, base, expected ] of cases) {
    it(`writes <${iri}> against <${base}> as ${expected}, which resolves back to it`, () => {
      const output = write([ q(nn('urn:s'), nn('urn:p'), nn(iri)) ], { baseIRI: base });
      expect(output).toBe(`<urn:s> <urn:p> ${expected}.\n`);
      if (/^[a-z]+:/u.test(base)) {
        expect(parse(output, { baseIRI: base })[0]!.object.value).toBe(iri);
      }
    });
  }
});

describe('Writer edge cases', () => {
  it('writes variables', () => {
    expect(new Writer().quadToString(DF.variable('s'), nn('urn:p'), DF.variable('o'))).toBe('?s <urn:p> ?o .\n');
  });

  it('reports terms that cannot be written in their position', () => {
    const errors: string[] = [];
    const writer = new Writer();
    writer.addQuad(DF.literal('s'), nn('urn:p'), nn('urn:o'), error => errors.push(error!.message));
    writer.addQuad(nn('urn:s'), DF.literal('p'), nn('urn:o'), nn('urn:g'), error => errors.push(error!.message));
    writer.addQuad(q(nn('urn:s'), nn('urn:p'), nn('urn:o'), DF.literal('g')), error => errors.push(error!.message));
    expect(errors).toEqual([
      'Cannot write a Literal in this position',
      'Cannot write a Literal in this position',
      'Cannot write a Literal in this position',
    ]);
  });

  it('requires a subject, predicate, and object', () => {
    const errors: string[] = [];
    const missing = <RDF.Term><unknown>undefined;
    new Writer().addQuad(nn('urn:s'), missing, missing, error => errors.push(error!.message));
    expect(errors).toEqual([ 'Expected subject, predicate, and object' ]);
  });

  it('closes statements in named graphs before switching graphs or adding prefixes', () => {
    const output = write([
      quad('urn:s', 'urn:p', 'urn:o', 'urn:g1'),
      quad('urn:s', 'urn:p', 'urn:o', 'urn:g2'),
    ]);
    expect(output).toBe('<urn:g1> {\n<urn:s> <urn:p> <urn:o>\n}\n<urn:g2> {\n<urn:s> <urn:p> <urn:o>\n}\n');

    const writer = new Writer();
    writer.addQuad(quad('urn:s', 'urn:p', 'urn:o', 'urn:g'));
    writer.addPrefix('ex', EX);
    let result = '';
    writer.end((_error, value) => {
      result = value!;
    });
    expect(result).toBe(`<urn:g> {\n<urn:s> <urn:p> <urn:o>\n}\n@prefix ex: <${EX}>.\n\n`);
  });

  it('handles empty prefix maps and prefixes in line formats', () => {
    const calls: unknown[] = [];
    new Writer().addPrefixes({}, error => calls.push(error));
    new Writer({ format: 'N-Triples' }).addPrefixes({ ex: EX }, error => calls.push(error));
    expect(calls).toEqual([ null, null ]);
  });

  it('writes an IRI that equals a prefix IRI in full, since its local name would be empty', () => {
    expect(write([ q(nn(EX), nn(`${EX}p`), nn(`${EX}o`)) ], { prefixes: { ex: EX }}))
      .toBe(`@prefix ex: <${EX}>.\n\n<${EX}> ex:p ex:o.\n`);
  });

  it('only uses a prefixed name when the local name needs no escaping', () => {
    expect(write([ q(nn(`${EX}a-b_1`), nn(`${EX}-p`), nn(`${EX}o.x`)) ], { prefixes: { ex: EX }}))
      .toBe(`@prefix ex: <${EX}>.\n\nex:a-b_1 <${EX}-p> <${EX}o.x>.\n`);
  });

  it('creates blank node property lists from a single child and requires an object', () => {
    const writer = new Writer();
    expect(writer.blank({ predicate: nn('urn:p'), object: nn('urn:o') }).value).toBe('[ <urn:p> <urn:o> ]');
    expect(writer.blank({ predicate: nn('urn:p'), object: writer.blank() }).value).toBe('[\n  <urn:p> []\n]');
    expect(() => writer.blank(nn('urn:p'), <RDF.Term><unknown>undefined)).toThrow('Expected an object');
    const serialized = writer.blank();
    expect(serialized.equals(serialized)).toBe(true);
    expect(serialized.equals(writer.blank())).toBe(false);
  });

  it('validates message counters', () => {
    const errors: string[] = [];
    const writer = new Writer({ format: 'N-Quads' });
    writer.addQuad({ quad: quad('urn:s', 'urn:p', 'urn:o'), messageCounter: -1 }, error => errors.push(error!.message));
    writer.addQuad({ quad: quad('urn:s', 'urn:p', 'urn:o'), messageCounter: 2 });
    writer.addQuad({ quad: quad('urn:s', 'urn:p', 'urn:o'), messageCounter: 1 }, error => errors.push(error!.message));
    expect(errors).toEqual([ 'Invalid message counter -1.', 'Cannot write message counter 1 after 2.' ]);
  });

  it('closes an open Turtle statement before a message delimiter, and writes plain quads in message mode', () => {
    const writer = new Writer({ messages: true, version: '1.1-messages' });
    writer.addQuad(quad('urn:s', 'urn:p', 'urn:o'));
    writer.addQuad({ quad: quad('urn:s', 'urn:p', 'urn:o2'), messageCounter: 1 });
    writer.addMessage([]);
    let output = '';
    writer.end((_error, result) => {
      output = result!;
    });
    expect(output).toBe('@version "1.1-messages" .\n<urn:s> <urn:p> <urn:o>.\n@message .\n<urn:s> <urn:p> <urn:o2>.\n' +
      '@message .\n@message .\n');
  });

  it('closes an open statement when the first message starts', () => {
    const writer = new Writer();
    writer.addQuad(quad('urn:s', 'urn:p', 'urn:o'));
    writer.addMessage([ quad('urn:s', 'urn:p', 'urn:o2') ]);
    let output = '';
    writer.end((_error, result) => {
      output = result!;
    });
    expect(output).toBe('<urn:s> <urn:p> <urn:o>.\n@version "1.2-messages" .\n<urn:s> <urn:p> <urn:o2>.\n');
  });

  it('reports errors of addMessage and a second end', () => {
    const errors: string[] = [];
    const writer = new Writer();
    writer.end();
    writer.addMessage([], error => errors.push(error!.message));
    writer.end(error => errors.push(String(error)));
    expect(errors).toEqual([ 'Cannot write because the writer has been closed.', 'null' ]);
  });

  it('writes to an output stream without options and wraps non-Error exceptions', () => {
    const chunks: string[] = [];
    const writer = new Writer({
      write: chunk => chunks.push(chunk),
      end: () => {
        // A misbehaving stream that throws something other than an Error
        // eslint-disable-next-line ts/no-throw-literal
        throw 'end failed';
      },
    });
    writer.addQuad(quad('urn:s', 'urn:p', 'urn:o'));
    let error: Error | null | undefined;
    writer.end((endError) => {
      error = endError;
    });
    expect(chunks.join('')).toBe('<urn:s> <urn:p> <urn:o>.\n');
    expect(error).toBeInstanceOf(Error);
    expect(error!.message).toBe('end failed');
  });

  it('escapes control characters and characters outside the Basic Multilingual Plane', () => {
    expect(new Writer().quadToString(nn('urn:s'), nn('urn:p'), DF.literal('😀\u0001')))
      .toBe('<urn:s> <urn:p> "\\U0001f600\\u0001" .\n');
  });
});

function quad(s: string, p: string, o: string, g?: string): RDF.BaseQuad {
  return q(nn(s), nn(p), nn(o), g ? nn(g) : DF.defaultGraph());
}
