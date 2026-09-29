import type * as RDF from '@rdfjs/types';
import { Transform, type Readable } from 'readable-stream';
import { Writer, type WriterCallback, type WriterInputItem, type WriterOptions } from './Writer';

/**
 * Node.js-style `Transform` stream (based on readable-stream) that accepts RDF/JS quads or `{ quad, messageCounter }`
 * entries and emits the serialized text.
 */
export class StreamWriter extends Transform {
  private readonly writer: Writer;

  public constructor(options: WriterOptions = {}) {
    super({ encoding: 'utf8', writableObjectMode: true });
    this.writer = new Writer({
      write: (chunk, _encoding, callback) => {
        this.push(chunk);
        callback?.(null);
      },
      end: (callback) => {
        this.push(null);
        callback?.(null);
      },
    }, options);
  }

  /** Writes the quads of `stream`, taking over its `prefix` events and forwarding its errors. */
  public import(stream: Readable | NodeJS.ReadableStream): this {
    stream.on('data', (quad: WriterInputItem) => this.write(quad));
    stream.on('end', () => this.end());
    stream.on('error', (error: Error) => this.emit('error', error));
    stream.on('prefix', (prefix: string, iri: RDF.NamedNode) => this.writer.addPrefix(prefix, iri));
    return this;
  }

  public override _transform(quad: WriterInputItem, _encoding: BufferEncoding, callback: WriterCallback): void {
    this.writer.addQuad(quad, callback);
  }

  public override _flush(callback: WriterCallback): void {
    this.writer.end(callback);
  }
}
