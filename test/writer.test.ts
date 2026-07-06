import { Readable, Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import {
  BlankNode,
  DataFactory,
  Literal,
  NamedNode,
  Quad,
  StreamWriter,
  Writer,
  type MessageQuad,
  type QuadLike,
} from '../src';

const XSD = 'http://www.w3.org/2001/XMLSchema#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

function nn(value: string): NamedNode {
  return new NamedNode(value);
}

function quad(subject: string, predicate: string, object: string, graph?: string): Quad {
  return new Quad(nn(subject), nn(predicate), nn(object), graph ? nn(graph) : DataFactory.defaultGraph());
}

function literal(value: string, datatype = `${XSD}string`): Literal {
  return new Literal(value, '', nn(datatype));
}

async function endWriter(writer: Writer): Promise<string> {
  return new Promise((resolve, reject) => {
    writer.end((error, output) => error ? reject(error) : resolve(output ?? ''));
  });
}

async function collectStream(stream: Readable): Promise<string> {
  let output = '';
  await new Promise<void>((resolve, reject) => {
    const sink = new Writable({
      decodeStrings: false,
      write(chunk, _encoding, callback) {
        output += String(chunk);
        callback();
      },
    });
    stream.on('error', reject);
    sink.on('error', reject);
    sink.on('finish', resolve);
    stream.pipe(sink);
  });
  return output;
}

describe('Writer', () => {
  it('exports an N3-compatible writer constructor', () => {
    expect(Writer).toBeInstanceOf(Function);
    expect(new Writer()).toBeInstanceOf(Writer);
  });

  it('serializes individual quads and quad arrays in line syntax', () => {
    const writer = new Writer();
    expect(writer.quadToString(nn('s'), nn('p'), nn('o'))).toBe('<s> <p> <o> .\n');
    expect(writer.quadToString(nn('s'), nn('p'), nn('o'), nn('g'))).toBe('<s> <p> <o> <g> .\n');
    expect(writer.quadsToString([quad('a', 'b', 'c'), quad('d', 'e', 'f')])).toBe('<a> <b> <c> .\n<d> <e> <f> .\n');
  });

  it('serializes Turtle with subject and predicate grouping', async () => {
    const writer = new Writer();
    writer.addQuad(quad('s', 'p1', 'o1'));
    writer.addQuad(quad('s', 'p1', 'o2'));
    writer.addQuad(quad('s', 'p2', 'o3'));
    writer.addQuad(quad('x', 'p2', 'o4'));
    await expect(endWriter(writer)).resolves.toBe('<s> <p1> <o1>, <o2>;\n    <p2> <o3>.\n<x> <p2> <o4>.\n');
  });

  it('serializes TriG graph blocks', async () => {
    const writer = new Writer({ format: 'TriG' });
    writer.addQuad(quad('s1', 'p', 'o1', 'g'));
    writer.addQuad(quad('s2', 'p', 'o2', 'g'));
    writer.addQuad(quad('s3', 'p', 'o3'));
    await expect(endWriter(writer)).resolves.toBe('<g> {\n<s1> <p> <o1>.\n<s2> <p> <o2>\n}\n<s3> <p> <o3>.\n');
  });

  it('uses prefixes, rdf:type abbreviation, and base IRI shortening in pretty formats', async () => {
    const writer = new Writer({
      baseIRI: 'https://example.org/things/card',
      prefixes: { ex: 'https://example.org/vocab#' },
    });
    writer.addQuad(new Quad(nn('https://example.org/things/card#me'), nn(RDF_TYPE), nn('https://example.org/vocab#Person')));
    writer.addQuad(new Quad(nn('https://example.org/things/card#me'), nn('https://example.org/vocab#knows'), nn('https://example.org/things/alice')));
    await expect(endWriter(writer)).resolves.toBe('@prefix ex: <https://example.org/vocab#>.\n\n<#me> a ex:Person;\n    ex:knows <alice>.\n');
  });

  it('writes N-Triples/N-Quads as one statement per line without prefixes or Turtle abbreviations', async () => {
    const writer = new Writer({ format: 'N-Quads', prefixes: { ex: 'https://example.org/' } });
    writer.addPrefix('ignored', 'https://ignored.example/');
    writer.addQuad(new Quad(nn('https://example.org/s'), nn('https://example.org/p'), literal('42', `${XSD}integer`)));
    writer.addQuad(new Quad(nn('https://example.org/s'), nn('https://example.org/p'), literal('true', `${XSD}boolean`), nn('https://example.org/g')));
    await expect(endWriter(writer)).resolves.toBe('<https://example.org/s> <https://example.org/p> "42"^^<http://www.w3.org/2001/XMLSchema#integer> .\n<https://example.org/s> <https://example.org/p> "true"^^<http://www.w3.org/2001/XMLSchema#boolean> <https://example.org/g> .\n');
  });

  it('uses Turtle literal abbreviations only when lexical values are valid', async () => {
    const writer = new Writer();
    writer.addQuad(new Quad(nn('s'), nn('p'), literal('true', `${XSD}boolean`)));
    writer.addQuad(new Quad(nn('s'), nn('p'), literal('not-bool', `${XSD}boolean`)));
    writer.addQuad(new Quad(nn('s'), nn('p'), literal('-12', `${XSD}integer`)));
    writer.addQuad(new Quad(nn('s'), nn('p'), literal('3.14', `${XSD}decimal`)));
    writer.addQuad(new Quad(nn('s'), nn('p'), literal('6.02E23', `${XSD}double`)));
    await expect(endWriter(writer)).resolves.toBe('<s> <p> true, "not-bool"^^<http://www.w3.org/2001/XMLSchema#boolean>, -12, 3.14, 6.02E23.\n');
  });

  it('escapes literals and IRIs while preserving blank node labels', async () => {
    const writer = new Writer();
    writer.addQuad(new Quad(nn('https://example.org/line\nbreak'), nn('p'), DataFactory.literal('quote " tab\t newline\n null\u0000')));
    writer.addQuad(new Quad(new BlankNode('emoji😀'), nn('p'), new BlankNode('emoji😀')));
    await expect(endWriter(writer)).resolves.toBe('<https://example.org/line\\nbreak> <p> "quote \\" tab\\t newline\\n null\\u0000".\n_:emoji😀 <p> _:emoji😀.\n');
  });

  it('serializes language, direction, and explicit datatype literals', async () => {
    const writer = new Writer();
    writer.addQuad(new Quad(nn('s'), nn('p'), DataFactory.literal('hello', 'EN')));
    writer.addQuad(new Quad(nn('s'), nn('p'), DataFactory.literal('مرحبا', 'ar--rtl')));
    writer.addQuad(new Quad(nn('s'), nn('p'), DataFactory.literal('bonjour', { language: 'FR', direction: 'ltr' })));
    writer.addQuad(new Quad(nn('s'), nn('p'), DataFactory.literal('custom', nn('dt'))));
    await expect(endWriter(writer)).resolves.toBe('<s> <p> "hello"@en, "مرحبا"@ar--rtl, "bonjour"@fr--ltr, "custom"^^<dt>.\n');
  });

  it('serializes blank-node property lists and RDF lists', async () => {
    const writer = new Writer();
    writer.addQuad(new Quad(nn('s1'), nn('p'), writer.blank()));
    writer.addQuad(new Quad(nn('s2'), nn('p'), writer.blank(nn('q'), nn('r'))));
    writer.addQuad(new Quad(nn('s3'), nn('p'), writer.blank([
      { predicate: nn('q'), object: nn('r1') },
      { predicate: nn('q'), object: nn('r2') },
      { predicate: nn('x'), object: DataFactory.literal('y') },
    ])));
    writer.addQuad(new Quad(nn('s4'), nn('p'), writer.list([nn('a'), DataFactory.literal('b')])));
    await expect(endWriter(writer)).resolves.toBe('<s1> <p> [].\n<s2> <p> [ <q> <r> ].\n<s3> <p> [\n  <q> <r1>, <r2>;\n  <x> "y"\n].\n<s4> <p> (<a> "b").\n');
  });

  it('can pretty-print list heads passed through writer options', async () => {
    const writer = new Writer({ lists: { head: [nn('a'), nn('b')] } });
    writer.addQuad(new Quad(new BlankNode('head'), nn('p'), nn('o')));
    writer.addQuad(new Quad(new BlankNode('other'), nn('p'), nn('o')));
    await expect(endWriter(writer)).resolves.toBe('(<a> <b>) <p> <o>.\n_:other <p> <o>.\n');
  });

  it('serializes RDF1.2 triple terms', () => {
    const writer = new Writer();
    expect(writer.quadToString(new Quad(nn('a'), nn('b'), nn('c')), nn('p'), new Quad(nn('s'), nn('p'), nn('o'), nn('g'))))
      .toBe('<<(<a> <b> <c>)>> <p> <<(<s> <p> <o> <g>)>> .\n');
  });

  it('writes to a supplied output stream and respects the end option', async () => {
    let output = '';
    let ended = false;
    const writer = new Writer({
      write: (chunk, _encoding, callback) => {
        output += chunk;
        callback?.(null);
      },
      end: callback => {
        ended = true;
        callback?.(null);
      },
    }, { end: false });
    writer.addQuad(quad('s', 'p', 'o'));
    await new Promise<void>((resolve, reject) => writer.end(error => error ? reject(error) : resolve()));
    expect(output).toBe('<s> <p> <o>.\n');
    expect(ended).toBe(false);
  });

  it('reports attempts to write after end through the callback', async () => {
    const writer = new Writer();
    writer.addQuad(quad('s', 'p', 'o'));
    await endWriter(writer);
    await new Promise<void>(resolve => {
      writer.addQuad(quad('x', 'y', 'z'), error => {
        expect(error).toBeInstanceOf(Error);
        expect(error?.message).toBe('Cannot write because the writer has been closed.');
        resolve();
      });
    });
  });

  it('accepts separated quad components and bulk quad additions', async () => {
    const writer = new Writer();
    writer.addQuad(nn('s'), nn('p'), nn('o1'));
    writer.addQuads([new Quad(nn('s'), nn('p'), nn('o2'))]);
    await expect(endWriter(writer)).resolves.toBe('<s> <p> <o1>, <o2>.\n');
  });

  it('serializes RDF Message logs from MessageQuad entries in line mode', async () => {
    const writer = new Writer({ format: 'N-Quads' });
    writer.addQuads([
      { quad: quad('http://example.org/s1', 'http://example.org/p', 'http://example.org/o1'), messageCounter: 0 },
      { quad: quad('http://example.org/s2', 'http://example.org/p', 'http://example.org/o2'), messageCounter: 1 },
      { quad: quad('http://example.org/s3', 'http://example.org/p', 'http://example.org/o3'), messageCounter: 3 },
    ]);

    const output = await endWriter(writer);
    expect(output).toBe('VERSION "1.2-messages"\n' +
      '<http://example.org/s1> <http://example.org/p> <http://example.org/o1> .\n' +
      'MESSAGE\n' +
      '<http://example.org/s2> <http://example.org/p> <http://example.org/o2> .\n' +
      'MESSAGE\n' +
      'MESSAGE\n' +
      '<http://example.org/s3> <http://example.org/p> <http://example.org/o3> .\n');
  });

  it('serializes RDF Message logs with addMessage in Turtle/TriG mode', async () => {
    const writer = new Writer({ prefixes: { ex: 'http://example.org/' }, version: '1.2-messages' });
    writer.addMessage([quad('http://example.org/s1', 'http://example.org/p', 'http://example.org/o1')]);
    writer.addMessage([]);
    writer.addMessage([quad('http://example.org/s2', 'http://example.org/p', 'http://example.org/o2')]);

    const output = await endWriter(writer);
    expect(output).toBe('@prefix ex: <http://example.org/>.\n\n' +
      '@version "1.2-messages" .\n' +
      'ex:s1 ex:p ex:o1.\n' +
      '@message .\n' +
      '@message .\n' +
      'ex:s2 ex:p ex:o2.\n');
  });
});

describe('StreamWriter', () => {
  it('exports an N3-compatible stream writer constructor', () => {
    expect(StreamWriter).toBeInstanceOf(Function);
    expect(new StreamWriter()).toBeInstanceOf(StreamWriter);
  });

  it('serializes a stream of quads', async () => {
    const input = Readable.from([quad('a', 'b', 'c'), quad('a', 'b', 'd')] as QuadLike[], { objectMode: true });
    const writer = new StreamWriter();
    expect(writer.import(input)).toBe(writer);
    await expect(collectStream(writer)).resolves.toBe('<a> <b> <c>, <d>.\n');
  });

  it('takes over prefixes from the input stream and forwards input errors', async () => {
    const input = new Readable({ objectMode: true, read() {} });
    const writer = new StreamWriter();
    const errors: Error[] = [];
    writer.on('error', error => errors.push(error));
    writer.import(input);
    input.emit('prefix', 'ex', nn('https://example.org/'));
    input.push(quad('https://example.org/s', 'https://example.org/p', 'https://example.org/o'));
    input.emit('error', new Error('upstream'));
    input.push(null);
    await expect(collectStream(writer)).resolves.toBe('@prefix ex: <https://example.org/>.\n\nex:s ex:p ex:o.\n');
    expect(errors.map(error => error.message)).toEqual(['upstream']);
  });

  it('serializes streamed MessageQuad entries as RDF Message logs', async () => {
    const input = Readable.from([
      { quad: quad('http://example.org/s1', 'http://example.org/p', 'http://example.org/o1'), messageCounter: 0 },
      { quad: quad('http://example.org/s2', 'http://example.org/p', 'http://example.org/o2'), messageCounter: 1 },
    ] satisfies MessageQuad[], { objectMode: true });
    const writer = new StreamWriter({ format: 'N-Quads' });

    writer.import(input);
    await expect(collectStream(writer)).resolves.toBe('VERSION "1.2-messages"\n' +
      '<http://example.org/s1> <http://example.org/p> <http://example.org/o1> .\n' +
      'MESSAGE\n' +
      '<http://example.org/s2> <http://example.org/p> <http://example.org/o2> .\n');
  });
});
