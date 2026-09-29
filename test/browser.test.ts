import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
import { StreamParser } from 'rdf-parser-ts/browser';
import { describe, expect, it } from 'vitest';
import { StreamWriter, Writer, type MessageQuad } from '../src/browser';

const DF = new DataFactory<RDF.BaseQuad>();
const EX = 'http://example.org/';
const nn = (value: string): RDF.NamedNode => DF.namedNode(value);

function quads(...objects: string[]): RDF.BaseQuad[] {
  return objects.map(object => DF.quad(nn(`${EX}s`), nn(`${EX}p`), nn(`${EX}${object}`)));
}

async function text(stream: ReadableStream<string>): Promise<string> {
  let output = '';
  for await (const chunk of stream) {
    output += chunk;
  }
  return output;
}

describe('The browser entry', () => {
  it('exports the Writer', () => {
    expect(new Writer().quadToString(nn('urn:s'), nn('urn:p'), nn('urn:o'))).toBe('<urn:s> <urn:p> <urn:o> .\n');
  });
});

describe('The Web Streams StreamWriter', () => {
  it('serializes quads piped through it', async() => {
    const writer = new StreamWriter({ prefixes: { ex: EX }});
    const output = ReadableStream.from(quads('o1', 'o2')).pipeThrough(writer);
    await expect(text(output)).resolves.toBe(`@prefix ex: <${EX}>.\n\nex:s ex:p ex:o1, ex:o2.\n`);
  });

  it('imports a stream and takes prefixes added while writing', async() => {
    const writer = new StreamWriter();
    writer.addPrefix('ex', nn(EX));
    await expect(text(writer.import(ReadableStream.from(quads('o'))))).resolves
      .toBe(`@prefix ex: <${EX}>.\n\nex:s ex:p ex:o.\n`);
  });

  it('serializes RDF Messages', async() => {
    const entries: MessageQuad[] = quads('o1', 'o2').map((quad, messageCounter) => ({ quad, messageCounter }));
    const output = ReadableStream.from(entries).pipeThrough(new StreamWriter({ format: 'N-Quads' }));
    await expect(text(output)).resolves.toBe(`VERSION "1.2-messages"\n<${EX}s> <${EX}p> <${EX}o1> .\nMESSAGE\n` +
      `<${EX}s> <${EX}p> <${EX}o2> .\n`);
  });

  it('errors the stream when a quad cannot be written', async() => {
    const invalid = DF.quad(DF.literal('s'), nn(`${EX}p`), nn(`${EX}o`));
    const output = ReadableStream.from([ invalid ]).pipeThrough(new StreamWriter());
    await expect(text(output)).rejects.toThrow('Cannot write a Literal in this position');
  });

  it('errors the stream for an invalid message counter', async() => {
    const entry: MessageQuad = { quad: quads('o')[0]!, messageCounter: -1 };
    const output = ReadableStream.from([ entry ]).pipeThrough(new StreamWriter());
    await expect(text(output)).rejects.toThrow('Invalid message counter -1.');
  });

  it('converts Turtle to Turtle through the browser StreamParser of rdf-parser-ts, keeping prefixes', async() => {
    const parser = new StreamParser({ format: 'text/turtle' });
    const writer = new StreamWriter();
    parser.on('prefix', (prefix: string, iri: RDF.NamedNode) => writer.addPrefix(prefix, iri));
    const input = ReadableStream.from([ `@prefix ex: <${EX}> .\nex:s ex:p "a", "b"@en .\n` ]);
    const output = input.pipeThrough(parser).pipeThrough(<TransformStream<unknown, string>><unknown>writer);
    await expect(text(output)).resolves.toBe(`@prefix ex: <${EX}>.\n\nex:s ex:p "a", "b"@en.\n`);
  });
});
