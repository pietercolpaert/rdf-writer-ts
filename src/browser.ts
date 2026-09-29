import type * as RDF from '@rdfjs/types';
import { Writer, type WriterInputItem, type WriterOptions } from './Writer';

export * from './Writer';

/**
 * Web Streams counterpart of the Node.js `StreamWriter`, without any dependency: a `TransformStream`-like object
 * that accepts RDF/JS quads or `{ quad, messageCounter }` entries and emits the serialized text. It can be passed to
 * `pipeThrough()`.
 */
export class StreamWriter {
  public readonly readable: ReadableStream<string>;
  public readonly writable: WritableStream<WriterInputItem>;
  private readonly writer: Writer;

  public constructor(options: WriterOptions = {}) {
    let output!: TransformStreamDefaultController<string>;
    const transform = new TransformStream<WriterInputItem, string>({
      start: (controller) => {
        output = controller;
      },
      transform: item => new Promise<void>((resolve, reject) => {
        this.writer.addQuad(item, error => error ? reject(error) : resolve());
      }),
      // Ending cannot fail: the output stream below never throws
      flush: () => this.writer.end(),
    });
    // The start callback runs during construction, so prefixes in the options can already be written
    this.writer = new Writer({
      write: (chunk, _encoding, callback) => {
        output.enqueue(chunk);
        callback?.(null);
      },
      end: callback => callback?.(null),
    }, options);
    this.readable = transform.readable;
    this.writable = transform.writable;
  }

  /** Pipes a stream of quads through this writer and returns the stream of text. */
  public import(stream: ReadableStream<WriterInputItem>): ReadableStream<string> {
    return stream.pipeThrough(this);
  }

  /**
   * Declares a prefix; ignored in N-Triples/N-Quads output. Use it to take over the prefixes of a parser, for
   * instance with `parser.on('prefix', (prefix, iri) => writer.addPrefix(prefix, iri))`.
   */
  public addPrefix(prefix: string, iri: string | RDF.NamedNode): void {
    this.writer.addPrefix(prefix, iri);
  }
}
