import { Transform, type TransformCallback, type Readable } from 'node:stream';
import type * as RDFJS from '@rdfjs/types';

export type TermType = RDFJS.Term['termType'];
export type Term = RDFJS.Term;

export interface WriterOptions {
  format?: string;
  prefixes?: Record<string, string | NamedNodeLike>;
  baseIRI?: string;
  end?: boolean;
  lists?: Record<string, TermLike[]>;
  rdfMessages?: boolean;
  messages?: boolean;
  version?: string;
}

export interface WriterOutputStream {
  write(chunk: string, encoding?: BufferEncoding, callback?: (error?: Error | null) => void): unknown;
  end(callback?: (error?: Error | null, result?: string) => void): unknown;
}

export type WriterEndCallback = (error?: Error | null, output?: string) => void;

export interface DataFactoryLike {
  namedNode(value: string): NamedNodeLike;
  blankNode(value?: string): BlankNodeLike;
  literal(value: string, languageOrDatatype?: string | NamedNodeLike | RDFJS.DirectionalLanguage, datatype?: NamedNodeLike): LiteralLike;
  variable?(value: string): VariableLike;
  defaultGraph(): DefaultGraphLike;
  quad(subject: TermLike, predicate: TermLike, object: TermLike, graph?: TermLike): QuadLike;
}

export type TermLike = RDFJS.Term;
export type NamedNodeLike = RDFJS.NamedNode;
export type BlankNodeLike = RDFJS.BlankNode;
export type VariableLike = RDFJS.Variable;
export type DefaultGraphLike = RDFJS.DefaultGraph;
export type LiteralLike = RDFJS.Literal;
export type QuadLike = RDFJS.BaseQuad;

export interface MessageQuad {
  quad: QuadLike;
  messageCounter: number;
}

type WriterOutputItem = QuadLike | MessageQuad;

export interface MessageQuadArray extends Array<MessageQuad> {
  messageCount: number;
}

const XSD = 'http://www.w3.org/2001/XMLSchema#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDF_TYPE = `${RDF}type`;
const RDF_LANG_STRING = `${RDF}langString`;
const XSD_STRING = `${XSD}string`;
const XSD_INTEGER = `${XSD}integer`;
const XSD_DECIMAL = `${XSD}decimal`;
const XSD_DOUBLE = `${XSD}double`;
const XSD_BOOLEAN = `${XSD}boolean`;

type LiteralDirection = RDFJS.DirectionalLanguage['direction'];

function sameTerm(a: TermLike, b: unknown): boolean {
  if (!b || typeof b !== 'object' || !('termType' in b) || !('value' in b)) return false;
  const other = b as TermLike;
  if (a.termType !== other.termType || a.value !== other.value) return false;
  if (a.termType === 'Literal' && other.termType === 'Literal') {
    return a.language === other.language && a.direction === other.direction && a.datatype.equals(other.datatype);
  }
  if (a.termType === 'Quad' && other.termType === 'Quad') {
    return a.subject.equals(other.subject) && a.predicate.equals(other.predicate) &&
      a.object.equals(other.object) && a.graph.equals(other.graph);
  }
  return true;
}

export class NamedNode implements NamedNodeLike {
  public readonly termType = 'NamedNode' as const;
  public constructor(public readonly value: string) {}
  public equals(other: unknown): boolean { return sameTerm(this, other); }
}

export class BlankNode implements BlankNodeLike {
  public readonly termType = 'BlankNode' as const;
  public constructor(public readonly value: string) {}
  public equals(other: unknown): boolean { return sameTerm(this, other); }
}

export class Variable implements VariableLike {
  public readonly termType = 'Variable' as const;
  public constructor(public readonly value: string) {}
  public equals(other: unknown): boolean { return sameTerm(this, other); }
}

export class DefaultGraph implements DefaultGraphLike {
  public readonly termType = 'DefaultGraph' as const;
  public readonly value = '';
  public equals(other: unknown): boolean { return sameTerm(this, other); }
}

export class Literal implements LiteralLike {
  public readonly termType = 'Literal' as const;
  public readonly direction?: LiteralDirection;

  public constructor(
    public readonly value: string,
    public readonly language = '',
    public readonly datatype: NamedNodeLike = new NamedNode(language ? RDF_LANG_STRING : XSD_STRING),
    direction?: LiteralDirection,
  ) {
    if (direction) this.direction = direction;
  }

  public equals(other: unknown): boolean { return sameTerm(this, other); }
}

export class Quad implements QuadLike {
  public readonly termType = 'Quad' as const;
  public readonly value = '';

  public constructor(
    public readonly subject: TermLike,
    public readonly predicate: TermLike,
    public readonly object: TermLike,
    public readonly graph: TermLike = defaultGraphSingleton,
  ) {}

  public equals(other: unknown): boolean { return sameTerm(this, other); }
}

export class Message extends Array<QuadLike> {
  public static override get [Symbol.species](): ArrayConstructor { return Array; }

  public constructor(public readonly messageCounter: number, quads: Iterable<QuadLike> = []) {
    super();
    Object.setPrototypeOf(this, Message.prototype);
    for (const quad of quads) this.push(quad);
  }
}

const defaultGraphSingleton = new DefaultGraph();

let globalBlankNodeCounter = 0;

export const DataFactory: DataFactoryLike = {
  namedNode: value => new NamedNode(value),
  blankNode: value => new BlankNode(value ?? `b${globalBlankNodeCounter++}`),
  literal: (value, languageOrDatatype, datatype) => {
    if (typeof languageOrDatatype === 'string') {
      const directionalSeparator = languageOrDatatype.indexOf('--');
      if (directionalSeparator >= 0) {
        const language = languageOrDatatype.slice(0, directionalSeparator).toLowerCase();
        const direction = languageOrDatatype.slice(directionalSeparator + 2).toLowerCase() as LiteralDirection;
        return new Literal(value, language, datatype ?? new NamedNode(RDF_LANG_STRING), direction);
      }
      const language = languageOrDatatype.toLowerCase();
      return new Literal(value, language, datatype ?? new NamedNode(language ? RDF_LANG_STRING : XSD_STRING));
    }
    if (isDirectionalLanguage(languageOrDatatype)) {
      return new Literal(
        value,
        languageOrDatatype.language.toLowerCase(),
        datatype ?? new NamedNode(RDF_LANG_STRING),
        languageOrDatatype.direction,
      );
    }
    return new Literal(value, '', languageOrDatatype ?? datatype ?? new NamedNode(XSD_STRING));
  },
  variable: value => new Variable(value),
  defaultGraph: () => defaultGraphSingleton,
  quad: (subject, predicate, object, graph = defaultGraphSingleton) => new Quad(subject, predicate, object, graph),
};

function isDirectionalLanguage(value: unknown): value is RDFJS.DirectionalLanguage {
  return Boolean(value && typeof value === 'object' && 'language' in value && !('termType' in value));
}

type WriterTerm = TermLike | SerializedTerm;
type WriterInputItem = QuadLike | MessageQuad;
type WriterQuadLike = Omit<QuadLike, 'subject' | 'predicate' | 'object' | 'graph'> & {
  subject: WriterTerm;
  predicate: WriterTerm;
  object: WriterTerm;
  graph: WriterTerm;
};
type WriterBlankChild = { predicate: WriterTerm; object: WriterTerm };

class SerializedTerm implements BlankNodeLike {
  public readonly termType = 'BlankNode' as const;
  public constructor(public readonly value: string) {}
  public equals(other: unknown): boolean { return other === this; }
}

export class Writer {
  private readonly outputStream: WriterOutputStream;
  private readonly endStream: boolean;
  private readonly lineMode: boolean;
  private readonly lists?: Record<string, TermLike[]>;
  private graph: WriterTerm = defaultGraphSingleton;
  private subject: WriterTerm | null = null;
  private predicate: WriterTerm | null = null;
  private prefixByIri: Record<string, string> | undefined;
  private baseIRI?: string;
  private closed = false;
  private messagesEnabled = false;
  private messageVersion = '1.2-messages';
  private messagesStarted = false;
  private currentMessageCounter = 0;
  private hasWrittenMessage = false;
  private trailingEmptyMessageCount = 0;

  public constructor(options?: WriterOptions);
  public constructor(outputStream: WriterOutputStream, options?: WriterOptions);
  public constructor(outputStreamOrOptions?: WriterOutputStream | WriterOptions, maybeOptions?: WriterOptions) {
    let outputStream: WriterOutputStream | undefined;
    let options: WriterOptions;
    if (isWriterOutputStream(outputStreamOrOptions)) {
      outputStream = outputStreamOrOptions;
      options = maybeOptions ?? {};
    } else {
      options = outputStreamOrOptions ?? {};
    }

    if (outputStream) {
      this.outputStream = outputStream;
      this.endStream = options.end !== undefined ? Boolean(options.end) : true;
    } else {
      let output = '';
      this.outputStream = {
        write: (chunk, _encoding, callback) => {
          output += chunk;
          callback?.(null);
        },
        end: callback => callback?.(null, output),
      };
      this.endStream = true;
    }

    this.lineMode = /(?:n-)?(?:triple|quad)s?/i.test(options.format ?? '');
    this.lists = options.lists;
    this.messagesEnabled = options.rdfMessages === true || options.messages === true || isMessagesVersion(options.version);
    if (options.version && isMessagesVersion(options.version)) this.messageVersion = options.version;
    if (!this.lineMode) {
      this.prefixByIri = Object.create(null) as Record<string, string>;
      if (options.baseIRI) this.baseIRI = options.baseIRI;
      if (options.prefixes) this.addPrefixes(options.prefixes);
    }
  }

  public quadToString(subject: WriterTerm, predicate: WriterTerm, object: WriterTerm, graph: WriterTerm = defaultGraphSingleton): string {
    const graphPart = graph.termType === 'DefaultGraph' || !graph.value ? '' : ` ${this.encodeIriOrBlank(graph)}`;
    return `${this.encodeSubject(subject)} ${this.encodeIriOrBlank(predicate)} ${this.encodeObject(object)}${graphPart} .\n`;
  }

  public quadsToString(quads: Iterable<QuadLike>): string {
    let output = '';
    for (const quad of quads) output += this.quadToString(quad.subject, quad.predicate, quad.object, quad.graph);
    return output;
  }

  public addQuad(quad: WriterInputItem, done?: (error?: Error | null) => void): void;
  public addQuad(subject: WriterTerm, predicate: WriterTerm, object: WriterTerm, done?: (error?: Error | null) => void): void;
  public addQuad(subject: WriterTerm, predicate: WriterTerm, object: WriterTerm, graph: WriterTerm, done?: (error?: Error | null) => void): void;
  public addQuad(
    subjectOrQuad: WriterTerm | WriterInputItem,
    predicateOrDone?: WriterTerm | ((error?: Error | null) => void),
    object?: WriterTerm,
    graphOrDone?: WriterTerm | ((error?: Error | null) => void),
    done?: (error?: Error | null) => void,
  ): void {
    try {
      this.assertOpen();
      let subject: WriterTerm;
      let predicate: WriterTerm;
      let quadObject: WriterTerm;
      let graph: WriterTerm;
      let callback = done;

      if (object === undefined && isMessageQuad(subjectOrQuad)) {
        callback = typeof predicateOrDone === 'function' ? predicateOrDone : done;
        this.writeMessageQuad(subjectOrQuad, callback);
        return;
      }

      if (object === undefined && isQuadLike(subjectOrQuad)) {
        subject = subjectOrQuad.subject;
        predicate = subjectOrQuad.predicate;
        quadObject = subjectOrQuad.object;
        graph = subjectOrQuad.graph;
        callback = typeof predicateOrDone === 'function' ? predicateOrDone : done;
      } else {
        if (!predicateOrDone || typeof predicateOrDone === 'function' || !object) throw new Error('Expected subject, predicate, and object');
        subject = subjectOrQuad as WriterTerm;
        predicate = predicateOrDone;
        quadObject = object;
        if (typeof graphOrDone === 'function') {
          graph = defaultGraphSingleton;
          callback = graphOrDone;
        } else {
          graph = graphOrDone ?? defaultGraphSingleton;
        }
      }

      if (this.messagesEnabled) this.ensureMessagesStarted();
      this.writeQuadTerms(subject, predicate, quadObject, graph, callback);
      if (this.messagesEnabled) {
        this.hasWrittenMessage = true;
        this.trailingEmptyMessageCount = 0;
      }
    } catch (error) {
      const callback = typeof predicateOrDone === 'function' ? predicateOrDone :
        typeof graphOrDone === 'function' ? graphOrDone : done;
      callback?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  public addQuads(quads: Iterable<WriterInputItem>): void {
    for (const quad of quads) this.addQuad(quad);
  }

  public addMessage(message: Iterable<QuadLike> | Message, done?: (error?: Error | null) => void): void {
    try {
      this.assertOpen();
      this.ensureMessagesStarted();
      if (this.hasWrittenMessage) this.writeMessageDelimiter();
      let wroteQuad = false;
      for (const quad of message) {
        wroteQuad = true;
        this.writeQuadTerms(quad.subject, quad.predicate, quad.object, quad.graph);
      }
      this.trailingEmptyMessageCount = wroteQuad ? 0 : this.trailingEmptyMessageCount + 1;
      this.hasWrittenMessage = true;
      done?.(null);
    } catch (error) {
      done?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  public addPrefix(prefix: string, iri: string | NamedNodeLike, done?: (error?: Error | null) => void): void {
    this.addPrefixes({ [prefix]: iri }, done);
  }

  public addPrefixes(prefixes: Record<string, string | NamedNodeLike>, done?: (error?: Error | null) => void): void {
    if (!this.prefixByIri) {
      done?.(null);
      return;
    }

    try {
      let wrote = false;
      for (const [prefix, iriValue] of Object.entries(prefixes)) {
        const iri = typeof iriValue === 'string' ? iriValue : iriValue.value;
        if (this.subject !== null) this.closeCurrentStatement();
        this.prefixByIri[iri] = `${prefix}:`;
        this.write(`@prefix ${prefix}: <${this.escapeIri(iri)}>.\n`, undefined);
        wrote = true;
      }
      if (wrote) this.write('\n', done);
      else done?.(null);
    } catch (error) {
      done?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  public blank(): TermLike;
  public blank(children: WriterBlankChild[]): TermLike;
  public blank(child: WriterBlankChild): TermLike;
  public blank(predicate: WriterTerm, object: WriterTerm): TermLike;
  public blank(predicateOrChildren?: WriterTerm | WriterBlankChild | WriterBlankChild[], object?: WriterTerm): TermLike {
    let children: WriterBlankChild[];
    if (predicateOrChildren === undefined) children = [];
    else if (Array.isArray(predicateOrChildren)) children = predicateOrChildren;
    else if (isTermLike(predicateOrChildren)) children = [{ predicate: predicateOrChildren, object: object ?? defaultGraphSingleton }];
    else children = [predicateOrChildren];

    if (children.length === 0) return new SerializedTerm('[]') as unknown as TermLike;
    if (children.length === 1) {
      const child = children[0]!;
      if (!(child.object instanceof SerializedTerm)) {
        return new SerializedTerm(`[ ${this.encodePredicate(child.predicate)} ${this.encodeObject(child.object)} ]`) as unknown as TermLike;
      }
    }

    let output = '[';
    let lastPredicate: WriterTerm | null = null;
    for (const [index, child] of children.entries()) {
      if (lastPredicate && child.predicate.equals(lastPredicate)) {
        output += `, ${this.encodeObject(child.object)}`;
      } else {
        output += `${index === 0 ? '\n  ' : ';\n  '}${this.encodePredicate(child.predicate)} ${this.encodeObject(child.object)}`;
        lastPredicate = child.predicate;
      }
    }
    output += '\n]';
    return new SerializedTerm(output) as unknown as TermLike;
  }

  public list(elements: WriterTerm[] = []): TermLike {
    return new SerializedTerm(`(${elements.map(element => this.encodeObject(element)).join(' ')})`) as unknown as TermLike;
  }

  public end(done?: WriterEndCallback): void {
    try {
      if (!this.closed && this.subject !== null) this.closeCurrentStatement();
      if (!this.closed && this.messagesStarted && this.trailingEmptyMessageCount > 0) {
        this.writeMessageDelimiter();
        this.trailingEmptyMessageCount = 0;
      }
      this.closed = true;
      if (!this.endStream) {
        done?.(null);
        return;
      }
      let called = false;
      const callback = (error?: Error | null, output?: string) => {
        if (called) return;
        called = true;
        done?.(error, output);
      };
      try {
        this.outputStream.end(callback);
      } catch (error) {
        callback(error instanceof Error ? error : new Error(String(error)));
      }
    } catch (error) {
      done?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private writePrettyQuad(subject: WriterTerm, predicate: WriterTerm, object: WriterTerm, graph: WriterTerm, done?: (error?: Error | null) => void): void {
    if (!graph.equals(this.graph)) {
      if (this.subject !== null) this.write(this.graph.termType === 'DefaultGraph' ? '.\n' : '\n}\n');
      if (graph.termType !== 'DefaultGraph') this.write(`${this.encodeIriOrBlank(graph)} {\n`);
      this.graph = graph;
      this.subject = null;
      this.predicate = null;
    }

    if (this.subject && subject.equals(this.subject)) {
      if (this.predicate && predicate.equals(this.predicate)) {
        this.write(`, ${this.encodeObject(object)}`, done);
      } else {
        this.predicate = predicate;
        this.write(`;\n    ${this.encodePredicate(predicate)} ${this.encodeObject(object)}`, done);
      }
      return;
    }

    const separator = this.subject === null ? '' : '.\n';
    this.subject = subject;
    this.predicate = predicate;
    this.write(`${separator}${this.encodeSubject(subject)} ${this.encodePredicate(predicate)} ${this.encodeObject(object)}`, done);
  }

  private writeQuadTerms(subject: WriterTerm, predicate: WriterTerm, object: WriterTerm, graph: WriterTerm, done?: (error?: Error | null) => void): void {
    if (this.lineMode) this.write(this.quadToString(subject, predicate, object, graph), done);
    else this.writePrettyQuad(subject, predicate, object, graph, done);
  }

  private writeMessageQuad(entry: MessageQuad, done?: (error?: Error | null) => void): void {
    if (!Number.isInteger(entry.messageCounter) || entry.messageCounter < 0) {
      throw new Error(`Invalid message counter ${entry.messageCounter}.`);
    }
    this.ensureMessagesStarted();
    if (entry.messageCounter < this.currentMessageCounter) {
      throw new Error(`Cannot write message counter ${entry.messageCounter} after ${this.currentMessageCounter}.`);
    }
    while (this.currentMessageCounter < entry.messageCounter) this.writeMessageDelimiter();
    this.writeQuadTerms(entry.quad.subject, entry.quad.predicate, entry.quad.object, entry.quad.graph, done);
    this.hasWrittenMessage = true;
    this.trailingEmptyMessageCount = 0;
  }

  private ensureMessagesStarted(): void {
    this.messagesEnabled = true;
    if (this.messagesStarted) return;
    if (this.subject !== null) this.closeCurrentStatement();
    this.write(this.lineMode ? `VERSION "${escapeLiteral(this.messageVersion)}"\n` : `@version "${escapeLiteral(this.messageVersion)}" .\n`);
    this.messagesStarted = true;
    this.currentMessageCounter = 0;
  }

  private writeMessageDelimiter(): void {
    if (this.subject !== null) this.closeCurrentStatement();
    this.write(this.lineMode ? 'MESSAGE\n' : '@message .\n');
    this.currentMessageCounter++;
  }

  private closeCurrentStatement(): void {
    this.write(this.graph.termType === 'DefaultGraph' ? '.\n' : '\n}\n');
    this.subject = null;
    this.predicate = null;
    this.graph = defaultGraphSingleton;
  }

  private encodeSubject(term: WriterTerm): string {
    return term.termType === 'Quad' ? this.encodeQuad(term) : this.encodeIriOrBlank(term);
  }

  private encodePredicate(term: WriterTerm): string {
    return term.termType === 'NamedNode' && term.value === RDF_TYPE ? 'a' : this.encodeIriOrBlank(term);
  }

  private encodeObject(term: WriterTerm): string {
    if (term instanceof SerializedTerm) return term.value;
    if (term.termType === 'Quad') return this.encodeQuad(term);
    if (term.termType === 'Literal') return this.encodeLiteral(term);
    return this.encodeIriOrBlank(term);
  }

  private encodeIriOrBlank(term: WriterTerm): string {
    if (term instanceof SerializedTerm) return term.value;
    if (term.termType === 'BlankNode') {
      if (this.lists && term.value in this.lists) return this.list(this.lists[term.value]!).value;
      return `_:${term.value}`;
    }
    if (term.termType !== 'NamedNode') return `_:${term.value}`;

    let iri = this.baseIRI ? relativizeIri(term.value, this.baseIRI) : term.value;
    iri = this.escapeIri(iri);
    const prefixed = this.prefixByIri ? this.toPrefixedName(iri) : undefined;
    return prefixed ?? `<${iri}>`;
  }

  private encodeLiteral(literalTerm: LiteralLike): string {
    const value = escapeLiteral(literalTerm.value);
    if (literalTerm.language) {
      const direction = literalTerm.direction ? `--${literalTerm.direction}` : '';
      return `"${value}"@${literalTerm.language}${direction}`;
    }

    if (this.lineMode) {
      if (literalTerm.datatype.value === XSD_STRING) return `"${value}"`;
    } else {
      switch (literalTerm.datatype.value) {
        case XSD_STRING:
          return `"${value}"`;
        case XSD_BOOLEAN:
          if (value === 'true' || value === 'false') return value;
          break;
        case XSD_INTEGER:
          if (/^[+-]?\d+$/.test(value)) return value;
          break;
        case XSD_DECIMAL:
          if (/^[+-]?(?:\d+\.\d*|\.\d+)$/.test(value)) return value;
          break;
        case XSD_DOUBLE:
          if (/^[+-]?(?:(?:\d+\.\d*|\.\d+|\d+)[eE][+-]?\d+)$/.test(value)) return value;
          break;
      }
    }

    return `"${value}"^^${this.encodeIriOrBlank(literalTerm.datatype)}`;
  }

  private encodeQuad(quadTerm: QuadLike): string {
    const graph = quadTerm.graph.termType === 'DefaultGraph' ? '' : ` ${this.encodeIriOrBlank(quadTerm.graph)}`;
    return `<<(${this.encodeSubject(quadTerm.subject)} ${this.encodePredicate(quadTerm.predicate)} ${this.encodeObject(quadTerm.object)}${graph})>>`;
  }

  private toPrefixedName(iri: string): string | undefined {
    if (!this.prefixByIri) return undefined;
    let bestIri = '';
    let bestPrefix = '';
    for (const [prefixIri, prefix] of Object.entries(this.prefixByIri)) {
      if (iri.startsWith(prefixIri) && prefixIri.length >= bestIri.length) {
        const local = iri.slice(prefixIri.length);
        if (isSafeLocalName(local)) {
          bestIri = prefixIri;
          bestPrefix = prefix;
        }
      }
    }
    return bestIri ? `${bestPrefix}${iri.slice(bestIri.length)}` : undefined;
  }

  private escapeIri(iri: string): string {
    return escapeIri(iri);
  }

  private write(chunk: string, done?: (error?: Error | null) => void): void {
    this.outputStream.write(chunk, 'utf8', done);
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('Cannot write because the writer has been closed.');
  }
}

export class StreamWriter extends Transform {
  private readonly writer: Writer;

  public constructor(options: WriterOptions = {}) {
    super({ encoding: 'utf8', writableObjectMode: true });
    this.writer = new Writer({
      write: (chunk, _encoding, callback) => {
        this.push(chunk);
        callback?.(null);
      },
      end: callback => {
        this.push(null);
        callback?.(null);
      },
    }, options);
  }

  public import(stream: Readable): this {
    stream.on('data', quad => this.write(quad));
    stream.on('end', () => this.end());
    stream.on('error', error => this.emit('error', error));
    stream.on('prefix', (prefix: string, iri: NamedNodeLike) => this.writer.addPrefix(prefix, iri));
    return this;
  }

  public override _transform(quad: WriterInputItem, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.writer.addQuad(quad, callback);
  }

  public override _flush(callback: TransformCallback): void {
    this.writer.end(callback);
  }
}

function isQuadLike(value: unknown): value is QuadLike {
  return Boolean(value && typeof value === 'object' && 'subject' in value && 'predicate' in value && 'object' in value && 'graph' in value);
}

function isWriterOutputStream(value: unknown): value is WriterOutputStream {
  return Boolean(value && typeof value === 'object' && 'write' in value && typeof value.write === 'function' && 'end' in value && typeof value.end === 'function');
}

function isTermLike(value: unknown): value is WriterTerm {
  return Boolean(value && typeof value === 'object' && 'termType' in value && 'value' in value && 'equals' in value);
}

function isSafeLocalName(value: string): boolean {
  return /^[A-Za-z0-9_][A-Za-z0-9_-]*$/.test(value);
}

function escapeLiteral(value: string): string {
  return value.replace(/["\\\t\n\r\b\f\u0000-\u001F]|[\uD800-\uDBFF][\uDC00-\uDFFF]/g, replaceEscapedCharacter);
}

function escapeIri(value: string): string {
  return value.replace(/[>"\\\t\n\r\b\f\u0000-\u001F]|[\uD800-\uDBFF][\uDC00-\uDFFF]/g, replaceEscapedCharacter);
}

function replaceEscapedCharacter(character: string): string {
  switch (character) {
    case '\\': return '\\\\';
    case '"': return '\\"';
    case '\t': return '\\t';
    case '\n': return '\\n';
    case '\r': return '\\r';
    case '\b': return '\\b';
    case '\f': return '\\f';
    default: {
      const codePoint = character.codePointAt(0) ?? 0;
      if (codePoint > 0xFFFF) return `\\U${codePoint.toString(16).padStart(8, '0')}`;
      return `\\u${codePoint.toString(16).padStart(4, '0')}`;
    }
  }
}

function relativizeIri(iri: string, baseIRI: string): string {
  try {
    const base = new URL(baseIRI);
    const target = new URL(iri);
    if (base.origin !== target.origin) return iri;
    if (base.pathname === target.pathname && base.search === target.search) return target.hash ? `${target.hash}` : '';
    const directory = base.pathname.endsWith('/') ? base.pathname : base.pathname.slice(0, base.pathname.lastIndexOf('/') + 1);
    if (target.pathname.startsWith(directory)) return `${target.pathname.slice(directory.length)}${target.search}${target.hash}`;
    return iri;
  } catch {
    return iri.startsWith(baseIRI) ? iri.slice(baseIRI.length) : iri;
  }
}

function isMessagesVersion(version: string | undefined): boolean {
  return typeof version === 'string' && version.toLowerCase().endsWith('-messages');
}


function escapeString(value: string): string {
  return value.replace(/[\\"\n\r\t\b\f]/g, character => {
    switch (character) {
      case '\\': return '\\\\';
      case '"': return '\\"';
      case '\n': return '\\n';
      case '\r': return '\\r';
      case '\t': return '\\t';
      case '\b': return '\\b';
      case '\f': return '\\f';
      default: return character;
    }
  });
}

export function termToString(term: TermLike): string {
  switch (term.termType) {
    case 'NamedNode':
      return `<${term.value.replace(/[>\\]/g, character => `\\${character}`)}>`;
    case 'BlankNode':
      return `_:${term.value}`;
    case 'Variable':
      return `?${term.value}`;
    case 'DefaultGraph':
      return '';
    case 'Literal': {
      const quoted = `"${escapeString(term.value)}"`;
      if (term.language) return `${quoted}@${term.direction ? `${term.language}--${term.direction}` : term.language}`;
      if (term.datatype.value === XSD_STRING) return quoted;
      return `${quoted}^^<${term.datatype.value}>`;
    }
    case 'Quad':
      return `<<(${termToString(term.subject)} ${termToString(term.predicate)} ${termToString(term.object)})>>`;
  }
}

export function quadToString(quad: QuadLike): string {
  const graph = quad.graph.termType === 'DefaultGraph' ? '' : ` ${termToString(quad.graph)}`;
  return `${termToString(quad.subject)} ${termToString(quad.predicate)} ${termToString(quad.object)}${graph} .`;
}

export function termToId(term: TermLike): string {
  return termToString(term);
}

export function isMessageQuad(value: unknown): value is MessageQuad {
  return Boolean(value && typeof value === 'object' && 'quad' in value && 'messageCounter' in value);
}

export function toMessages(output: Iterable<WriterOutputItem>, messageCount?: number): Message[] {
  const messages: Message[] = [];
  const parsedMessageCount = messageCount ?? getMessageCount(output);
  let sawMessageCounters = false;

  for (const item of output) {
    const entry = isMessageQuad(item) ? item : { quad: item, messageCounter: 0 };
    sawMessageCounters ||= isMessageQuad(item);
    while (messages.length <= entry.messageCounter) messages.push(new Message(messages.length));
    messages[entry.messageCounter]!.push(entry.quad);
  }

  if (parsedMessageCount !== undefined) {
    while (messages.length < parsedMessageCount) messages.push(new Message(messages.length));
  } else if (!sawMessageCounters && messages.length === 0) {
    return [];
  }

  return messages;
}

function getMessageCount(output: Iterable<WriterOutputItem>): number | undefined {
  if (!Array.isArray(output) || !('messageCount' in output)) return undefined;
  const value = (output as Partial<MessageQuadArray>).messageCount;
  return typeof value === 'number' ? value : undefined;
}

export const namedNode = DataFactory.namedNode;
export const blankNode = DataFactory.blankNode;
export const literal = DataFactory.literal;
export const variable = DataFactory.variable;
export const defaultGraph = DataFactory.defaultGraph;
export const quad = DataFactory.quad;
